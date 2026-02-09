import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ScanReport } from "../../src/report/types.js";
import { startServer } from "../../src/server/index.js";
import { resolveDataDir, writeRun } from "../../src/server/store.js";

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

describe("server api", () => {
  it("serves summary and runs", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const dataDir = resolveDataDir(tempDir);
    const policyYaml = "version: v1\n";
    const run = await writeRun(dataDir, makeReport(12), policyYaml, {
      now: new Date("2026-02-09T19:00:00Z"),
    });

    const server = await startServer({ port: 0, dataDir });
    const baseUrl = `http://localhost:${server.port}`;

    const summaryResponse = await fetch(`${baseUrl}/api/summary`);
    const summary = await summaryResponse.json();
    expect(summary.summary.total_score).toBe(12);
    expect(summary.run.id).toBe(run.id);

    const runsResponse = await fetch(`${baseUrl}/api/runs`);
    const runs = await runsResponse.json();
    expect(runs.runs.length).toBe(1);

    const reportResponse = await fetch(`${baseUrl}/api/runs/${run.id}`);
    const report = await reportResponse.json();
    expect(report.tool.name).toBe("openguard");

    const policyResponse = await fetch(`${baseUrl}/api/policy/${run.id}`);
    const policy = await policyResponse.text();
    expect(policy).toBe(policyYaml);

    await server.close();
  });
});
