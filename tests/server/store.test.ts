import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ScanReport } from "../../src/report/types.js";
import {
  attachPolicyToLatest,
  listRuns,
  loadLatestSummary,
  loadRunPolicy,
  loadRunReport,
  resolveDataDir,
  writeRun,
} from "../../src/server/store.js";

function makeReport(totalScore: number): ScanReport {
  return {
    tool: { name: "openguard", version: "0.1.0" },
    target: { input: ".", resolved_path: "/tmp/repo", files_scanned: 1 },
    summary: {
      total_score: totalScore,
      subscores: { shell: 0, network: 0, filesystem: 0, credentials: 0 },
      counts: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        total: 0,
      },
      risk_level: "low",
    },
    findings: [],
    scan_metadata: { rules_loaded: 0, rules_version: "v1" },
  };
}

describe("run store", () => {
  it("persists runs in deterministic order", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const dataDir = resolveDataDir(tempDir);

    const first = await writeRun(dataDir, makeReport(10), undefined, {
      now: new Date("2026-02-09T18:02:00Z"),
    });
    const second = await writeRun(dataDir, makeReport(20), undefined, {
      now: new Date("2026-02-09T18:03:00Z"),
    });

    const runs = await listRuns(dataDir);
    expect(runs[0].id).toBe(second.id);
    expect(runs[1].id).toBe(first.id);

    const latest = await loadLatestSummary(dataDir);
    expect(latest.entry.id).toBe(second.id);
    expect(latest.report.summary.total_score).toBe(20);
  });

  it("attaches policy to latest run", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const dataDir = resolveDataDir(tempDir);

    const run = await writeRun(dataDir, makeReport(5), undefined, {
      now: new Date("2026-02-09T18:04:00Z"),
    });
    const policyYaml = "version: v1\n";
    await attachPolicyToLatest(dataDir, policyYaml);
    const policy = await loadRunPolicy(dataDir, run.id);
    expect(policy).toBe(policyYaml);

    const report = await loadRunReport(dataDir, run.id);
    expect(report.summary.total_score).toBe(5);
  });
});
