import fs from "node:fs/promises";
import path from "node:path";
import type { ScanReport } from "../report/types.js";

export interface RunIndexEntry {
  readonly id: string;
  readonly created: string;
  readonly report: string;
  readonly policy?: string;
  readonly total_score: number;
}

export interface RunIndex {
  readonly latest?: string;
  readonly runs: readonly RunIndexEntry[];
}

export interface RunWriteOptions {
  readonly now?: Date;
}

const DEFAULT_DIR = ".openguard";
const RUNS_DIR = "runs";
const INDEX_FILE = "index.json";

export function resolveDataDir(customDir?: string): string {
  if (customDir) {
    return path.resolve(assertNoTilde(customDir));
  }
  return path.join(process.cwd(), DEFAULT_DIR);
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
  try {
    const raw = await fs.readFile(path.join(dataDir, INDEX_FILE), "utf8");
    const parsed = JSON.parse(raw) as RunIndex;
    if (!parsed.runs || !Array.isArray(parsed.runs)) {
      return { runs: [] };
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { runs: [] };
    }
    throw error;
  }
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
  };

  const runs = [...index.runs, entry].sort(compareRunEntries);
  const latest = runs[0]?.report;
  await writeIndex(dataDir, { latest, runs });
  return entry;
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
  const runs = [updated, ...index.runs.slice(1)];
  await writeIndex(dataDir, { latest: index.latest, runs });
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

async function writeIndex(dataDir: string, index: RunIndex): Promise<void> {
  await fs.writeFile(
    path.join(dataDir, INDEX_FILE),
    JSON.stringify(index, null, 2),
    "utf8",
  );
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
  return a.id.localeCompare(b.id);
}
