import type { IncomingMessage, ServerResponse } from "node:http";
import {
  listRuns,
  loadLatestSummary,
  loadRunPolicy,
  loadRunReport,
  resolveDataDir,
} from "./store.js";

export interface ApiOptions {
  readonly dataDir?: string;
}

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ApiOptions = {},
): Promise<boolean> {
  const method = req.method ?? "GET";
  if (method !== "GET") {
    respondJson(res, 405, { error: "Method not allowed" });
    return true;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) {
    return false;
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

    if (url.pathname.startsWith("/api/runs/")) {
      const runId = url.pathname.replace("/api/runs/", "");
      const report = await loadRunReport(dataDir, runId);
      respondJson(res, 200, report);
      return true;
    }

    if (url.pathname.startsWith("/api/policy/")) {
      const runId = url.pathname.replace("/api/policy/", "");
      const policy = await loadRunPolicy(dataDir, runId);
      if (!policy) {
        respondJson(res, 404, { error: "Policy not found" });
        return true;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "text/yaml; charset=utf-8");
      res.end(policy);
      return true;
    }

    respondJson(res, 404, { error: "Not found" });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    respondJson(res, 404, { error: message });
    return true;
  }
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
