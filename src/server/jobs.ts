import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPolicyGenerate } from "../cli/policy-command.js";
import { runScanCommand, type ScanResult } from "../cli/scan-command.js";
import { runSignCommand } from "../cli/sign-command.js";
import { runVerifyCommand } from "../cli/verify-command.js";
import type { SummaryInfo } from "../report/types.js";
import {
  appendAuditEvent,
  listPersistedJobs,
  listRuns,
  loadRunReport,
  normalizeTargetPath,
  resolveDataDir,
  savePersistedJob,
  targetIdForPath,
  targetLabelForPath,
  updateRunMetadata,
  upsertTarget,
} from "./store.js";
import type {
  DashboardTargetRecord,
  ExecutedJobAction,
  PolicyGenerateJobRequest,
  RerunJobRequest,
  ScanJobRequest,
  ServerJob,
  ServerJobAction,
  ServerJobEvent,
  ServerJobRequest,
  ServerJobResult,
  SignJobRequest,
  VerifyJobRequest,
} from "./types.js";

interface ExecutionOutcome {
  readonly executed_action: ExecutedJobAction;
  readonly result: ServerJobResult;
  readonly target_path: string;
}

export interface JobManager {
  createJob(input: unknown): Promise<ServerJob>;
  getJob(id: string): ServerJob | null;
  listJobs(): ServerJob[];
}

export async function createJobManager(
  options: { dataDir?: string } = {},
): Promise<JobManager> {
  const dataDir = resolveDataDir(options.dataDir);
  const jobs = new Map<string, ServerJob>();
  const persistedJobs = await listPersistedJobs(dataDir);
  persistedJobs.forEach((job) => jobs.set(job.id, job));

  const getJob = (id: string): ServerJob | null => jobs.get(id) ?? null;

  const listJobs = (): ServerJob[] =>
    Array.from(jobs.values()).sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    );

  const saveJob = async (
    job: ServerJob,
    auditMessage?: string,
  ): Promise<ServerJob> => {
    jobs.set(job.id, job);
    const saved = await savePersistedJob(dataDir, job);
    jobs.set(saved.id, saved);
    if (auditMessage) {
      await appendAuditEvent(dataDir, {
        id: randomUUID(),
        created_at: new Date().toISOString(),
        actor: "local-dashboard",
        job_id: saved.id,
        action: saved.action,
        status: saved.status,
        target_id: saved.target_id,
        target_label: saved.target_label,
        request: saved.request,
        result: saved.result,
        error: saved.error,
        message: auditMessage,
      });
    }
    return saved;
  };

  const createJob = async (input: unknown): Promise<ServerJob> => {
    const request = normalizeJobRequest(input);
    const resolvedTarget = resolveTargetForRequest(request, jobs);
    const sensitive = isSensitiveJob(request, jobs);
    const eventMessage = buildQueuedMessage(request, resolvedTarget?.label);
    const job: ServerJob = {
      id: randomUUID(),
      action: request.action,
      status: "queued",
      created_at: new Date().toISOString(),
      request,
      command_preview: commandPreviewForRequest(request),
      target_id: resolvedTarget?.id,
      target_label: resolvedTarget?.label,
      sensitive,
      requires_confirmation: sensitive,
      events: [createEvent("queued", eventMessage)],
    };
    const saved = await saveJob(job, eventMessage);
    void runJob(saved).catch(() => undefined);
    return saved;
  };

  const runJob = async (job: ServerJob): Promise<void> => {
    let current = await saveJob(
      transitionJob(job, "running", "Executing locally"),
      "Executing locally",
    );

    try {
      const toolVersion = await loadToolVersion();
      const outcome = await executeJob(current, toolVersion, dataDir, jobs);
      current = await finalizeJob(current, outcome, dataDir, saveJob);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      current = await saveJob(
        transitionJob(current, "failed", `Failed: ${message}`, { error: message }),
        `Failed: ${message}`,
      );
      if (current.target_id && current.target_label) {
        await syncTarget(current, current.request.action, undefined, dataDir);
      }
    }

    jobs.set(current.id, current);
  };

  return { createJob, getJob, listJobs };
}

async function finalizeJob(
  job: ServerJob,
  outcome: ExecutionOutcome,
  dataDir: string,
  saveJob: (job: ServerJob, auditMessage?: string) => Promise<ServerJob>,
): Promise<ServerJob> {
  const normalizedTarget = normalizeTargetPath(outcome.target_path);
  const targetId = targetIdForPath(normalizedTarget);
  const targetLabel = targetLabelForPath(normalizedTarget);
  const result: ServerJobResult = {
    ...outcome.result,
    executed_action: outcome.executed_action,
    source_job_id:
      job.request.action === "rerun" ? job.request.source_job_id : undefined,
  };

  if (result.run_id) {
    await updateRunMetadata(dataDir, result.run_id, {
      action: outcome.executed_action,
      source_job_id: job.id,
      target_id: targetId,
      target_label: targetLabel,
    });
  }

  const completed = await saveJob(
    transitionJob(job, "succeeded", successMessage(outcome), {
      result,
      target_id: targetId,
      target_label: targetLabel,
    }),
    successMessage(outcome),
  );

  await syncTarget(completed, outcome.executed_action, result, dataDir);
  return completed;
}

async function syncTarget(
  job: ServerJob,
  action: ServerJobAction,
  result: ServerJobResult | undefined,
  dataDir: string,
): Promise<void> {
  if (!job.target_id || !job.target_label) {
    return;
  }

  const base: DashboardTargetRecord = {
    id: job.target_id,
    label: job.target_label,
    path: job.target_label,
    updated_at: job.finished_at ?? job.started_at ?? job.created_at,
    last_job_id: job.id,
    last_action: action,
    last_status: job.status,
    last_run_id: result?.run_id,
    last_score: result?.summary?.total_score,
    last_risk: result?.summary?.risk_level,
    last_findings: result?.summary?.counts.total,
  };

  const next: DashboardTargetRecord =
    action === "scan"
      ? { ...base, last_scan_job_id: job.id }
      : action === "policy-generate"
        ? { ...base, last_policy_job_id: job.id }
        : action === "sign"
          ? { ...base, last_sign_job_id: job.id }
          : action === "verify"
            ? { ...base, last_verify_job_id: job.id }
            : base;

  await upsertTarget(dataDir, next);
}

async function executeJob(
  job: ServerJob,
  toolVersion: string,
  dataDir: string,
  jobs: ReadonlyMap<string, ServerJob>,
): Promise<ExecutionOutcome> {
  switch (job.request.action) {
    case "scan":
      return await executeScanJob(job.request, toolVersion, dataDir);
    case "policy-generate":
      return await executePolicyJob(job.request, toolVersion, dataDir);
    case "sign":
      return await executeSignJob(job.request, toolVersion);
    case "verify":
      return await executeVerifyJob(job.request);
    case "rerun":
      return await executeRerunJob(job.request, toolVersion, dataDir, jobs);
    default:
      throw new Error("Invalid job request: unsupported action");
  }
}

async function executeScanJob(
  request: ScanJobRequest,
  toolVersion: string,
  dataDir: string,
): Promise<ExecutionOutcome> {
  const result: ScanResult = await runScanCommand(
    {
      target: request.target,
      format: request.format ?? "md",
      diffBase: request.diff_base,
      rulesDir: request.rules_dir,
      policyPath: request.policy_path,
      threshold: request.threshold,
      show: request.show ?? "all",
      maxFindings: request.max_findings,
      showEvidence: request.show_evidence ?? false,
      saveRun: request.save_run ?? true,
      dataDir,
    },
    toolVersion,
  );

  return {
    executed_action: "scan",
    target_path: request.target,
    result: {
      output: result.output,
      run_id: request.save_run === false ? undefined : await getLatestRunId(dataDir),
      summary: result.report.summary,
      policy_present: Boolean(result.report.recommended_policy),
    },
  };
}

async function executePolicyJob(
  request: PolicyGenerateJobRequest,
  toolVersion: string,
  dataDir: string,
): Promise<ExecutionOutcome> {
  const output = await runPolicyGenerate({
    target: request.target,
    merge: request.merge,
    rulesDir: request.rules_dir,
    saveRun: request.save_run ?? true,
    dataDir,
    toolVersion,
  });

  const runId =
    request.save_run === false ? undefined : await getLatestRunId(dataDir);
  const summary = runId ? await loadRunSummary(dataDir, runId) : undefined;

  return {
    executed_action: "policy-generate",
    target_path: request.target,
    result: {
      output,
      run_id: runId,
      summary,
      policy_present: true,
    },
  };
}

async function executeSignJob(
  request: SignJobRequest,
  toolVersion: string,
): Promise<ExecutionOutcome> {
  assertConfirmed(request.confirmation, "sign");
  await runSignCommand({
    artifact: request.artifact,
    key: request.key,
    out: request.out,
    toolVersion,
  });
  const signaturePath = request.out ?? defaultSignaturePath(request.artifact);
  return {
    executed_action: "sign",
    target_path: request.artifact,
    result: {
      output: `Signature written to ${signaturePath}`,
      signature_path: signaturePath,
    },
  };
}

async function executeVerifyJob(
  request: VerifyJobRequest,
): Promise<ExecutionOutcome> {
  await runVerifyCommand({
    artifact: request.artifact,
    pub: request.pub,
    signature: request.signature,
    strict: request.strict,
  });
  const signaturePath = request.signature ?? defaultSignaturePath(request.artifact);
  return {
    executed_action: "verify",
    target_path: request.artifact,
    result: {
      output: `Verified ${signaturePath}`,
      signature_path: signaturePath,
      verified: true,
    },
  };
}

async function executeRerunJob(
  request: RerunJobRequest,
  toolVersion: string,
  dataDir: string,
  jobs: ReadonlyMap<string, ServerJob>,
): Promise<ExecutionOutcome> {
  const source = jobs.get(request.source_job_id);
  if (!source) {
    throw new Error(`Source job not found: ${request.source_job_id}`);
  }
  if (source.request.action === "rerun") {
    throw new Error("Cannot rerun a rerun job. Select the original action.");
  }

  if (source.request.action === "scan") {
    return await executeScanJob(
      {
        ...source.request,
        save_run: request.save_run ?? source.request.save_run ?? true,
      },
      toolVersion,
      dataDir,
    );
  }

  if (source.request.action === "policy-generate") {
    return await executePolicyJob(
      {
        ...source.request,
        save_run: request.save_run ?? source.request.save_run ?? true,
      },
      toolVersion,
      dataDir,
    );
  }

  if (source.request.action === "sign") {
    assertConfirmed(request.confirmation ?? false, "rerun-sign");
    return await executeSignJob(
      {
        ...source.request,
        confirmation: true,
      },
      toolVersion,
    );
  }

  return await executeVerifyJob(source.request);
}

function transitionJob(
  job: ServerJob,
  status: ServerJob["status"],
  message: string,
  patch: Partial<ServerJob> = {},
): ServerJob {
  const time = new Date().toISOString();
  const event: ServerJobEvent = createEvent(status, message, time);
  return {
    ...job,
    ...patch,
    status,
    started_at: status === "running" ? time : job.started_at,
    finished_at:
      status === "succeeded" || status === "failed" || status === "canceled"
        ? time
        : job.finished_at,
    events: [...job.events, event],
  };
}

function createEvent(
  status: ServerJob["status"],
  message: string,
  time = new Date().toISOString(),
): ServerJobEvent {
  return { time, status, message };
}

function buildQueuedMessage(
  request: ServerJobRequest,
  targetLabel: string | undefined,
): string {
  switch (request.action) {
    case "scan":
      return `Queued scan for ${targetLabel ?? request.target}`;
    case "policy-generate":
      return `Queued policy generation for ${targetLabel ?? request.target}`;
    case "sign":
      return `Queued signing for ${targetLabel ?? request.artifact}`;
    case "verify":
      return `Queued verification for ${targetLabel ?? request.artifact}`;
    case "rerun":
      return `Queued rerun from job ${request.source_job_id}`;
    default:
      return "Queued local job";
  }
}

function successMessage(outcome: ExecutionOutcome): string {
  switch (outcome.executed_action) {
    case "scan":
      return "Scan completed";
    case "policy-generate":
      return "Policy generation completed";
    case "sign":
      return "Signing completed";
    case "verify":
      return "Verification completed";
    default:
      return "Job completed";
  }
}

function resolveTargetForRequest(
  request: ServerJobRequest,
  jobs: ReadonlyMap<string, ServerJob>,
): { id: string; label: string } | null {
  if (request.action === "scan" || request.action === "policy-generate") {
    const targetPath = normalizeTargetPath(request.target);
    return {
      id: targetIdForPath(targetPath),
      label: targetLabelForPath(targetPath),
    };
  }
  if (request.action === "sign" || request.action === "verify") {
    const targetPath = normalizeTargetPath(request.artifact);
    return {
      id: targetIdForPath(targetPath),
      label: targetLabelForPath(targetPath),
    };
  }
  const source = jobs.get(request.source_job_id);
  return source?.target_id && source.target_label
    ? { id: source.target_id, label: source.target_label }
    : null;
}

function isSensitiveJob(
  request: ServerJobRequest,
  jobs: ReadonlyMap<string, ServerJob>,
): boolean {
  if (request.action === "sign") {
    return true;
  }
  if (request.action === "rerun") {
    const source = jobs.get(request.source_job_id);
    return Boolean(source?.sensitive);
  }
  return false;
}

function normalizeJobRequest(input: unknown): ServerJobRequest {
  if (!isRecord(input) || typeof input.action !== "string") {
    throw new Error("Invalid job request: missing action");
  }

  if (input.action === "scan") {
    return normalizeScanJobRequest(input);
  }
  if (input.action === "policy-generate") {
    return normalizePolicyJobRequest(input);
  }
  if (input.action === "sign") {
    return normalizeSignJobRequest(input);
  }
  if (input.action === "verify") {
    return normalizeVerifyJobRequest(input);
  }
  if (input.action === "rerun") {
    return normalizeRerunJobRequest(input);
  }

  throw new Error(`Invalid job request: unsupported action '${String(input.action)}'`);
}

function normalizeScanJobRequest(input: Record<string, unknown>): ScanJobRequest {
  return {
    action: "scan",
    target: requiredString(input.target, "target"),
    format: optionalFormat(input.format),
    diff_base: optionalString(input.diff_base),
    rules_dir: optionalString(input.rules_dir),
    policy_path: optionalString(input.policy_path),
    threshold: optionalNumber(input.threshold, "threshold"),
    show: optionalShow(input.show),
    max_findings: optionalInteger(input.max_findings, "max_findings"),
    show_evidence: optionalBoolean(input.show_evidence),
    save_run: optionalBoolean(input.save_run),
  };
}

function normalizePolicyJobRequest(
  input: Record<string, unknown>,
): PolicyGenerateJobRequest {
  return {
    action: "policy-generate",
    target: requiredString(input.target, "target"),
    merge: optionalString(input.merge),
    rules_dir: optionalString(input.rules_dir),
    save_run: optionalBoolean(input.save_run),
  };
}

function normalizeSignJobRequest(input: Record<string, unknown>): SignJobRequest {
  return {
    action: "sign",
    artifact: requiredString(input.artifact, "artifact"),
    key: requiredString(input.key, "key"),
    out: optionalString(input.out),
    confirmation: requiredBoolean(input.confirmation, "confirmation"),
  };
}

function normalizeVerifyJobRequest(
  input: Record<string, unknown>,
): VerifyJobRequest {
  return {
    action: "verify",
    artifact: requiredString(input.artifact, "artifact"),
    pub: requiredString(input.pub, "pub"),
    signature: optionalString(input.signature),
    strict: optionalBoolean(input.strict),
  };
}

function normalizeRerunJobRequest(input: Record<string, unknown>): RerunJobRequest {
  return {
    action: "rerun",
    source_job_id: requiredString(input.source_job_id, "source_job_id"),
    save_run: optionalBoolean(input.save_run),
    confirmation: optionalBoolean(input.confirmation),
  };
}

function commandPreviewForRequest(request: ServerJobRequest): string {
  if (request.action === "scan") {
    return joinCommand([
      "openguard",
      "scan",
      request.target,
      "--format",
      request.format ?? "md",
      ...(request.diff_base ? ["--diff-base", request.diff_base] : []),
      ...(request.rules_dir ? ["--rules-dir", request.rules_dir] : []),
      ...(request.policy_path ? ["--policy", request.policy_path] : []),
      ...(request.threshold !== undefined
        ? ["--threshold", String(request.threshold)]
        : []),
      ...(request.max_findings !== undefined
        ? ["--max-findings", String(request.max_findings)]
        : []),
      ...(request.show ? ["--show", request.show] : []),
      ...(request.show_evidence ? ["--show-evidence"] : []),
      ...(request.save_run === false ? [] : ["--save-run"]),
    ]);
  }

  if (request.action === "policy-generate") {
    return joinCommand([
      "openguard",
      "policy-generate",
      request.target,
      ...(request.merge ? ["--merge", request.merge] : []),
      ...(request.rules_dir ? ["--rules-dir", request.rules_dir] : []),
      ...(request.save_run === false ? [] : ["--save-run"]),
    ]);
  }

  if (request.action === "sign") {
    return joinCommand([
      "openguard",
      "sign",
      request.artifact,
      "--key",
      request.key,
      ...(request.out ? ["--out", request.out] : []),
    ]);
  }

  if (request.action === "verify") {
    return joinCommand([
      "openguard",
      "verify",
      request.artifact,
      "--pub",
      request.pub,
      ...(request.signature ? ["--signature", request.signature] : []),
      ...(request.strict ? ["--strict"] : []),
    ]);
  }

  return joinCommand(["openguard", "rerun", request.source_job_id]);
}

function joinCommand(parts: readonly string[]): string {
  return parts
    .filter((part) => part.length > 0)
    .map((part) =>
      /[\s"]/u.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part,
    )
    .join(" ");
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid job request: ${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("Invalid job request: expected string value");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error("Invalid job request: expected boolean value");
  }
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid job request: ${field} must be a boolean`);
  }
  return value;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid job request: ${field} must be a finite number`);
  }
  return value;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid job request: ${field} must be a positive integer`);
  }
  return value;
}

function optionalShow(value: unknown): "summary" | "findings" | "all" | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "summary" || value === "findings" || value === "all") {
    return value;
  }
  throw new Error("Invalid job request: show must be one of summary/findings/all");
}

function optionalFormat(value: unknown): "json" | "md" | "sarif" | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "json" || value === "md" || value === "sarif") {
    return value;
  }
  throw new Error("Invalid job request: format must be one of json/md/sarif");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function getLatestRunId(dataDir: string): Promise<string | undefined> {
  const runs = await listRuns(dataDir);
  return runs[0]?.id;
}

async function loadRunSummary(
  dataDir: string,
  runId: string,
): Promise<SummaryInfo | undefined> {
  try {
    const report = await loadRunReport(dataDir, runId);
    return report.summary;
  } catch {
    return undefined;
  }
}

function assertConfirmed(confirmation: boolean, action: string): void {
  if (!confirmation) {
    throw new Error(
      `Invalid job request: ${action} requires explicit confirmation`,
    );
  }
}

function defaultSignaturePath(artifactPath: string): string {
  return path.resolve(`${artifactPath}.sig.json`);
}

async function loadToolVersion(): Promise<string> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const rootPath = path.resolve(dir, "..", "..");
  const raw = await fs.readFile(path.join(rootPath, "package.json"), "utf8");
  const json = JSON.parse(raw) as { version?: string };
  return json.version ?? "0.0.0";
}
