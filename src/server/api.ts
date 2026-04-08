import type { IncomingMessage, ServerResponse } from "node:http";
import {
  listAuditEntries,
  listRuns,
  listTargets,
  loadDashboardState,
  loadLatestSummary,
  loadRunPolicy,
  loadRunReport,
  resolveDataDir,
} from "./store.js";

export interface ApiOptions {
  readonly dataDir?: string;
  readonly jobs?: {
    createJob(input: unknown): Promise<unknown>;
    getJob(id: string): unknown | null;
    listJobs(): unknown[];
  };
}

interface ApiErrorPayload {
  readonly error: string;
  readonly code: string;
  readonly status: number;
}

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ApiOptions = {},
): Promise<boolean> {
  const method = req.method ?? "GET";

  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) {
    return false;
  }

  if (method === "POST" && url.pathname === "/api/jobs") {
    try {
      const payload = await readJsonBody(req);
      if (!options.jobs) {
        throw new Error("Job manager unavailable");
      }
      const job = await options.jobs.createJob(payload);
      respondJson(res, 202, { job });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "Invalid JSON body") {
        respondError(res, {
          error: message,
          code: "invalid_json",
          status: 400,
        });
        return true;
      }
      if (message.startsWith("Invalid job request:")) {
        respondError(res, {
          error: message,
          code: "invalid_job_request",
          status: 400,
        });
        return true;
      }
      respondError(res, errorPayloadForMessage(message));
      return true;
    }
  }

  if (method !== "GET") {
    respondError(res, {
      error: "Method not allowed",
      code: "method_not_allowed",
      status: 405,
    });
    return true;
  }

  const dataDir = resolveDataDir(options.dataDir);

  try {
    if (url.pathname === "/api/summary") {
      const latest = await loadLatestSummary(dataDir);
      respondJson(res, 200, {
        run: latest.entry,
        summary: latest.report.summary,
        target: latest.report.target,
        policy_present: Boolean(latest.entry.policy),
      });
      return true;
    }

    if (url.pathname === "/api/runs") {
      const runs = await listRuns(dataDir);
      respondJson(res, 200, { runs });
      return true;
    }

    if (url.pathname === "/api/targets") {
      const targets = await listTargets(dataDir);
      respondJson(res, 200, { targets });
      return true;
    }

    if (url.pathname === "/api/audit") {
      const limit = parsePositiveInteger(url.searchParams.get("limit")) ?? 40;
      const audit = await listAuditEntries(dataDir, limit);
      respondJson(res, 200, { audit });
      return true;
    }

    if (url.pathname === "/api/dashboard" || url.pathname === "/api/overview") {
      const dashboard = await loadDashboardState(dataDir);
      const latestSummary = await loadLatestSummarySafe(dataDir);
      respondJson(res, 200, {
        ...dashboard,
        latest_summary: latestSummary
          ? {
              run: latestSummary.entry,
              summary: latestSummary.report.summary,
              target: latestSummary.report.target,
              policy_present: Boolean(latestSummary.entry.policy),
            }
          : null,
      });
      return true;
    }

    if (url.pathname === "/api/jobs") {
      respondJson(res, 200, {
        jobs: options.jobs ? options.jobs.listJobs() : [],
      });
      return true;
    }

    if (url.pathname.startsWith("/api/jobs/")) {
      const jobId = url.pathname.replace("/api/jobs/", "");
      if (!isValidEntityId(jobId)) {
        respondError(res, {
          error: "Invalid job id",
          code: "invalid_job_id",
          status: 400,
        });
        return true;
      }
      const job = options.jobs?.getJob(jobId) ?? null;
      if (!job) {
        respondError(res, {
          error: "Job not found",
          code: "job_not_found",
          status: 404,
        });
        return true;
      }
      respondJson(res, 200, { job });
      return true;
    }

    if (url.pathname.startsWith("/api/runs/")) {
      const runId = url.pathname.replace("/api/runs/", "");
      if (!isValidEntityId(runId)) {
        respondError(res, {
          error: "Invalid run id",
          code: "invalid_run_id",
          status: 400,
        });
        return true;
      }
      const report = await loadRunReport(dataDir, runId);
      respondJson(res, 200, report);
      return true;
    }

    if (url.pathname.startsWith("/api/policy/")) {
      const runId = url.pathname.replace("/api/policy/", "");
      if (!isValidEntityId(runId)) {
        respondError(res, {
          error: "Invalid run id",
          code: "invalid_run_id",
          status: 400,
        });
        return true;
      }
      const policy = await loadRunPolicy(dataDir, runId);
      if (!policy) {
        respondError(res, {
          error: "Policy not found",
          code: "policy_not_found",
          status: 404,
        });
        return true;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "text/yaml; charset=utf-8");
      res.end(policy);
      return true;
    }

    respondError(res, {
      error: "Not found",
      code: "not_found",
      status: 404,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    respondError(res, errorPayloadForMessage(message));
    return true;
  }
}

function isValidEntityId(id: string): boolean {
  if (!id) {
    return false;
  }
  if (id.includes("/")) {
    return false;
  }
  return /^[A-Za-z0-9._:-]+$/.test(id);
}

function errorPayloadForMessage(message: string): ApiErrorPayload {
  if (message.startsWith("Run not found:")) {
    return {
      error: "Run not found",
      code: "run_not_found",
      status: 404,
    };
  }
  if (message === "No saved runs found.") {
    return {
      error: "No saved runs found",
      code: "no_runs_found",
      status: 404,
    };
  }
  return {
    error: "Internal server error",
    code: "internal_error",
    status: 500,
  };
}

function respondJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function respondError(res: ServerResponse, payload: ApiErrorPayload): void {
  respondJson(res, payload.status, payload);
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  if (!/^[0-9]+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) {
      throw new Error("Invalid JSON body");
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new Error("Invalid JSON body");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function loadLatestSummarySafe(
  dataDir: string,
): Promise<Awaited<ReturnType<typeof loadLatestSummary>> | null> {
  try {
    return await loadLatestSummary(dataDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "No saved runs found.") {
      return null;
    }
    throw error;
  }
}
