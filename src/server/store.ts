import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ScanReport } from "../report/types.js";
import type {
  DashboardAuditEvent,
  DashboardTargetRecord,
  PolicyGenerateJobRequest,
  ScanJobRequest,
  ServerJob,
  ServerJobAction,
} from "./types.js";

export interface RunIndexEntry {
  readonly id: string;
  readonly created: string;
  readonly report: string;
  readonly policy?: string;
  readonly total_score: number;
  readonly target_id?: string;
  readonly target_label?: string;
  readonly action?: ServerJobAction;
  readonly source_job_id?: string;
  readonly source_request?: ScanJobRequest | PolicyGenerateJobRequest;
}

export interface RunIndex {
  readonly latest?: string;
  readonly runs: readonly RunIndexEntry[];
}

export interface RunWriteOptions {
  readonly now?: Date;
  readonly sourceAction?: ServerJobAction;
  readonly sourceJobId?: string;
  readonly sourceRequest?: ScanJobRequest | PolicyGenerateJobRequest;
}

export interface RunMetadataPatch {
  readonly target_id?: string;
  readonly target_label?: string;
  readonly action?: ServerJobAction;
  readonly source_job_id?: string;
  readonly source_request?: ScanJobRequest | PolicyGenerateJobRequest;
}

export interface DashboardState {
  readonly summary: {
    total_runs: number;
    total_targets: number;
    total_jobs: number;
    active_jobs: number;
    failed_jobs: number;
  };
  readonly latest_run:
    | (RunIndexEntry & {
        readonly risk_level: ScanReport["summary"]["risk_level"];
        readonly findings_total: number;
      })
    | null;
  readonly runs: readonly RunIndexEntry[];
  readonly targets: readonly DashboardTargetRecord[];
  readonly jobs: readonly ServerJob[];
  readonly audit: readonly DashboardAuditEvent[];
}

const DEFAULT_DIR = ".openguard";
const RUNS_DIR = "runs";
const INDEX_FILE = "index.json";
const JOBS_FILE = "jobs.json";
const TARGETS_FILE = "targets.json";
const AUDIT_FILE = "audit.json";
const writeQueues = new Map<string, Promise<void>>();

export function resolveDataDir(customDir?: string): string {
  if (customDir) {
    return path.resolve(assertNoTilde(customDir));
  }
  return path.join(process.cwd(), DEFAULT_DIR);
}

export function normalizeTargetPath(target: string): string {
  return path.resolve(assertNoTilde(target));
}

export function targetIdForPath(targetPath: string): string {
  const hash = createHash("sha1").update(targetPath).digest("hex");
  return `target-${hash.slice(0, 12)}`;
}

export function targetLabelForPath(targetPath: string): string {
  return targetPath;
}

function assertNoTilde(input: string): string {
  if (input.includes("~")) {
    throw new Error("data-dir must not include '~'. Use an absolute path.");
  }
  return input;
}

export async function ensureDataDirs(dataDir: string): Promise<void> {
  await fs.mkdir(path.join(dataDir, RUNS_DIR), { recursive: true });
}

export async function loadIndex(dataDir: string): Promise<RunIndex> {
  const parsed = await readJsonFile<RunIndex>(path.join(dataDir, INDEX_FILE), {
    runs: [],
  });
  if (!parsed.runs || !Array.isArray(parsed.runs)) {
    return { runs: [] };
  }
  return {
    latest: parsed.latest,
    runs: parsed.runs,
  };
}

export async function writeRun(
  dataDir: string,
  report: ScanReport,
  policyYaml?: string,
  options: RunWriteOptions = {},
): Promise<RunIndexEntry> {
  await ensureDataDirs(dataDir);
  const index = await loadIndex(dataDir);
  const now = options.now ?? new Date();
  const created = formatTimestamp(now);
  const id = uniqueId(
    created,
    index.runs.map((run) => run.id),
  );
  const reportFile = `${id}.json`;
  const reportPath = path.join(dataDir, RUNS_DIR, reportFile);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  let policyFile: string | undefined;
  if (policyYaml) {
    policyFile = `${id}.policy`;
    await fs.writeFile(
      path.join(dataDir, RUNS_DIR, policyFile),
      policyYaml,
      "utf8",
    );
  }

  const entry: RunIndexEntry = {
    id,
    created,
    report: path.posix.join(RUNS_DIR, reportFile),
    policy: policyFile ? path.posix.join(RUNS_DIR, policyFile) : undefined,
    total_score: report.summary.total_score,
    target_id: targetIdForPath(report.target.resolved_path ?? report.target.input),
    target_label: targetLabelForPath(
      report.target.resolved_path ?? report.target.input,
    ),
    action: options.sourceAction,
    source_job_id: options.sourceJobId,
    source_request: options.sourceRequest,
  };

  const runs = [...index.runs, entry].sort(compareRunEntries);
  await writeIndex(dataDir, {
    latest: runs[0]?.report,
    runs,
  });
  return entry;
}

export async function updateRunMetadata(
  dataDir: string,
  runId: string,
  patch: RunMetadataPatch,
): Promise<RunIndexEntry> {
  const nextIndex = await updateJsonFile<RunIndex>(
    path.join(dataDir, INDEX_FILE),
    { runs: [] },
    (current) => {
      const runs = (current.runs ?? []).map((entry) =>
        entry.id === runId ? { ...entry, ...patch } : entry,
      );
      if (!runs.some((entry) => entry.id === runId)) {
        throw new Error(`Run not found: ${runId}`);
      }
      return {
        latest: current.latest,
        runs: runs.sort(compareRunEntries),
      };
    },
  );
  const updated = nextIndex.runs.find((entry) => entry.id === runId);
  if (!updated) {
    throw new Error(`Run not found: ${runId}`);
  }
  return updated;
}

export async function attachPolicyToLatest(
  dataDir: string,
  policyYaml: string,
): Promise<RunIndexEntry> {
  await ensureDataDirs(dataDir);
  const index = await loadIndex(dataDir);
  const latest = index.runs[0];
  if (!latest) {
    throw new Error("No saved runs found. Run a scan with --save-run first.");
  }

  const policyFile = `${latest.id}.policy`;
  await fs.writeFile(
    path.join(dataDir, RUNS_DIR, policyFile),
    policyYaml,
    "utf8",
  );

  const updated: RunIndexEntry = {
    ...latest,
    policy: path.posix.join(RUNS_DIR, policyFile),
  };
  await updateJsonFile<RunIndex>(
    path.join(dataDir, INDEX_FILE),
    { runs: [] },
    (current) => ({
      latest: current.latest,
      runs: (current.runs ?? [])
        .map((run) => (run.id === latest.id ? updated : run))
        .sort(compareRunEntries),
    }),
  );
  return updated;
}

export async function listRuns(dataDir: string): Promise<RunIndexEntry[]> {
  const index = await loadIndex(dataDir);
  return [...index.runs].sort(compareRunEntries);
}

export async function loadRunReport(
  dataDir: string,
  runId: string,
): Promise<ScanReport> {
  const index = await loadIndex(dataDir);
  const entry = index.runs.find((run) => run.id === runId);
  if (!entry) {
    throw new Error(`Run not found: ${runId}`);
  }
  const raw = await fs.readFile(path.join(dataDir, entry.report), "utf8");
  return JSON.parse(raw) as ScanReport;
}

export async function loadRunEntry(
  dataDir: string,
  runId: string,
): Promise<RunIndexEntry> {
  const index = await loadIndex(dataDir);
  const entry = index.runs.find((run) => run.id === runId);
  if (!entry) {
    throw new Error(`Run not found: ${runId}`);
  }
  return entry;
}

export async function loadRunPolicy(
  dataDir: string,
  runId: string,
): Promise<string | null> {
  const index = await loadIndex(dataDir);
  const entry = index.runs.find((run) => run.id === runId);
  if (!entry) {
    throw new Error(`Run not found: ${runId}`);
  }
  if (!entry.policy) {
    return null;
  }
  return await fs.readFile(path.join(dataDir, entry.policy), "utf8");
}

export async function loadLatestSummary(
  dataDir: string,
): Promise<{ entry: RunIndexEntry; report: ScanReport }> {
  const index = await loadIndex(dataDir);
  const latest = index.runs[0];
  if (!latest) {
    throw new Error("No saved runs found.");
  }
  const report = await loadRunReport(dataDir, latest.id);
  return { entry: latest, report };
}

export async function listPersistedJobs(dataDir: string): Promise<ServerJob[]> {
  const jobs = await readJsonFile<ServerJob[]>(path.join(dataDir, JOBS_FILE), []);
  return [...jobs].sort(compareJobs);
}

export async function listJobs(dataDir: string): Promise<ServerJob[]> {
  return await listPersistedJobs(dataDir);
}

export async function savePersistedJob(
  dataDir: string,
  job: ServerJob,
): Promise<ServerJob> {
  const jobs = await updateJsonFile<ServerJob[]>(
    path.join(dataDir, JOBS_FILE),
    [],
    (current) => {
      const next = [...current];
      const index = next.findIndex((entry) => entry.id === job.id);
      if (index >= 0) {
        next[index] = job;
      } else {
        next.push(job);
      }
      return next.sort(compareJobs);
    },
  );
  const saved = jobs.find((entry) => entry.id === job.id);
  if (!saved) {
    throw new Error(`Job not found after save: ${job.id}`);
  }
  return saved;
}

export async function upsertJob(
  dataDir: string,
  job: ServerJob,
): Promise<ServerJob> {
  return await savePersistedJob(dataDir, job);
}

export async function listTargets(
  dataDir: string,
): Promise<DashboardTargetRecord[]> {
  const targets = await readJsonFile<DashboardTargetRecord[]>(
    path.join(dataDir, TARGETS_FILE),
    [],
  );
  return [...targets].sort(compareTargets);
}

export async function upsertTarget(
  dataDir: string,
  record: DashboardTargetRecord,
): Promise<DashboardTargetRecord> {
  const targets = await updateJsonFile<DashboardTargetRecord[]>(
    path.join(dataDir, TARGETS_FILE),
    [],
    (current) => {
      const next = [...current];
      const index = next.findIndex((entry) => entry.id === record.id);
      if (index >= 0) {
        next[index] = { ...next[index], ...record };
      } else {
        next.push(record);
      }
      return next.sort(compareTargets);
    },
  );
  const saved = targets.find((entry) => entry.id === record.id);
  if (!saved) {
    throw new Error(`Target not found after save: ${record.id}`);
  }
  return saved;
}

export async function listAuditEvents(
  dataDir: string,
): Promise<DashboardAuditEvent[]> {
  const events = await readJsonFile<DashboardAuditEvent[]>(
    path.join(dataDir, AUDIT_FILE),
    [],
  );
  return [...events].sort(compareAuditEntries);
}

export async function listAuditEntries(
  dataDir: string,
  limit = 40,
): Promise<DashboardAuditEvent[]> {
  const events = await listAuditEvents(dataDir);
  return events.slice(0, limit);
}

export async function appendAuditEvent(
  dataDir: string,
  event: DashboardAuditEvent,
): Promise<void> {
  await updateJsonFile<DashboardAuditEvent[]>(
    path.join(dataDir, AUDIT_FILE),
    [],
    (current) => [event, ...current].slice(0, 500),
  );
}

export async function loadDashboardState(
  dataDir: string,
): Promise<DashboardState> {
  const [runs, targets, jobs, audit] = await Promise.all([
    listRuns(dataDir),
    listTargets(dataDir),
    listPersistedJobs(dataDir),
    listAuditEntries(dataDir, 12),
  ]);
  const latestRun = runs[0];
  const latestReport = latestRun ? await loadRunReport(dataDir, latestRun.id) : null;

  return {
    summary: {
      total_runs: runs.length,
      total_targets: targets.length,
      total_jobs: jobs.length,
      active_jobs: jobs.filter(
        (job) => job.status === "queued" || job.status === "running",
      ).length,
      failed_jobs: jobs.filter((job) => job.status === "failed").length,
    },
    latest_run:
      latestRun && latestReport
        ? {
            ...latestRun,
            risk_level: latestReport.summary.risk_level,
            findings_total: latestReport.summary.counts.total,
          }
        : null,
    runs: runs.slice(0, 8),
    targets: targets.slice(0, 8),
    jobs: jobs.slice(0, 12),
    audit,
  };
}

async function writeIndex(dataDir: string, index: RunIndex): Promise<void> {
  await writeJsonFile(path.join(dataDir, INDEX_FILE), index);
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function updateJsonFile<T>(
  filePath: string,
  fallback: T,
  update: (current: T) => T | Promise<T>,
): Promise<T> {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  let nextValue = fallback;
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const current = await readJsonFile(filePath, fallback);
      nextValue = await update(current);
      await writeJsonFile(filePath, nextValue);
    });
  writeQueues.set(filePath, next);
  await next;
  return nextValue;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

function formatTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "");
}

function uniqueId(base: string, existing: readonly string[]): string {
  if (!existing.includes(base)) {
    return base;
  }
  let counter = 1;
  let candidate = `${base}-${counter}`;
  while (existing.includes(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

function compareRunEntries(a: RunIndexEntry, b: RunIndexEntry): number {
  if (a.created !== b.created) {
    return a.created > b.created ? -1 : 1;
  }

  const aCounter = runCounter(a.id, a.created);
  const bCounter = runCounter(b.id, b.created);
  if (aCounter !== bCounter) {
    return bCounter - aCounter;
  }

  return b.id.localeCompare(a.id);
}

function runCounter(id: string, created: string): number {
  if (id === created) {
    return 0;
  }
  const prefix = `${created}-`;
  if (!id.startsWith(prefix)) {
    return 0;
  }
  const suffix = id.slice(prefix.length);
  if (!/^[0-9]+$/.test(suffix)) {
    return 0;
  }
  return Number(suffix);
}

function compareJobs(a: ServerJob, b: ServerJob): number {
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? 1 : -1;
  }
  return b.id.localeCompare(a.id);
}

function compareTargets(
  a: DashboardTargetRecord,
  b: DashboardTargetRecord,
): number {
  if (a.updated_at !== b.updated_at) {
    return a.updated_at < b.updated_at ? 1 : -1;
  }
  return a.label.localeCompare(b.label);
}

function compareAuditEntries(
  a: DashboardAuditEvent,
  b: DashboardAuditEvent,
): number {
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? 1 : -1;
  }
  return b.id.localeCompare(a.id);
}
