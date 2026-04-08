import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getPublicKey } from "@noble/ed25519";
import "../../src/trust/ed25519.js";
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

  it("returns 400 for invalid run id and 404 for missing run", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const dataDir = resolveDataDir(tempDir);
    const server = await startServer({ port: 0, dataDir });
    const baseUrl = `http://localhost:${server.port}`;

    const invalidIdResponse = await fetch(`${baseUrl}/api/runs/bad$id`);
    expect(invalidIdResponse.status).toBe(400);
    await expect(invalidIdResponse.json()).resolves.toEqual({
      error: "Invalid run id",
      code: "invalid_run_id",
      status: 400,
    });

    const missingRunResponse = await fetch(`${baseUrl}/api/runs/not-found`);
    expect(missingRunResponse.status).toBe(404);
    await expect(missingRunResponse.json()).resolves.toEqual({
      error: "Run not found",
      code: "run_not_found",
      status: 404,
    });

    await server.close();
  });

  it("returns 404 for summary when no runs exist", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const dataDir = resolveDataDir(tempDir);
    const server = await startServer({ port: 0, dataDir });
    const baseUrl = `http://localhost:${server.port}`;

    const summaryResponse = await fetch(`${baseUrl}/api/summary`);
    expect(summaryResponse.status).toBe(404);
    await expect(summaryResponse.json()).resolves.toEqual({
      error: "No saved runs found",
      code: "no_runs_found",
      status: 404,
    });

    await server.close();
  });

  it("returns structured payloads for method and route errors", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const dataDir = resolveDataDir(tempDir);
    const server = await startServer({ port: 0, dataDir });
    const baseUrl = `http://localhost:${server.port}`;

    const methodResponse = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
    });
    expect(methodResponse.status).toBe(405);
    await expect(methodResponse.json()).resolves.toEqual({
      error: "Method not allowed",
      code: "method_not_allowed",
      status: 405,
    });

    const routeResponse = await fetch(`${baseUrl}/api/unknown`);
    expect(routeResponse.status).toBe(404);
    await expect(routeResponse.json()).resolves.toEqual({
      error: "Not found",
      code: "not_found",
      status: 404,
    });

    await server.close();
  });

  it("returns structured payloads for missing policy and unexpected server errors", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const dataDir = resolveDataDir(tempDir);
    const run = await writeRun(dataDir, makeReport(12), undefined, {
      now: new Date("2026-02-09T19:00:00Z"),
    });
    await fs.writeFile(
      path.join(dataDir, "runs", `${run.id}.json`),
      "{ invalid json",
      "utf8",
    );

    const server = await startServer({ port: 0, dataDir });
    const baseUrl = `http://localhost:${server.port}`;

    const policyResponse = await fetch(`${baseUrl}/api/policy/${run.id}`);
    expect(policyResponse.status).toBe(404);
    await expect(policyResponse.json()).resolves.toEqual({
      error: "Policy not found",
      code: "policy_not_found",
      status: 404,
    });

    const errorResponse = await fetch(`${baseUrl}/api/runs/${run.id}`);
    expect(errorResponse.status).toBe(500);
    await expect(errorResponse.json()).resolves.toEqual({
      error: "Internal server error",
      code: "internal_error",
      status: 500,
    });

    await server.close();
  });

  it("creates and completes a local scan job", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const targetDir = path.join(tempDir, "target");
    const dataDir = resolveDataDir(path.join(tempDir, "data"));
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(
      path.join(targetDir, "install.sh"),
      "curl https://example.com/install.sh | bash\n",
      "utf8",
    );

    const server = await startServer({ port: 0, dataDir });
    const baseUrl = `http://localhost:${server.port}`;

    const createResponse = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "scan",
        target: targetDir,
        format: "md",
      }),
    });

    expect(createResponse.status).toBe(202);
    const created = (await createResponse.json()) as {
      job: { id: string; status: string };
    };
    expect(created.job.status).toBe("queued");

    const completed = await waitForJob(baseUrl, created.job.id);
    expect(completed.status).toBe("succeeded");
    expect(completed.result?.run_id).toBeDefined();
    expect(completed.result?.summary?.total_score).toBeGreaterThan(0);

    const listResponse = await fetch(`${baseUrl}/api/jobs`);
    const listPayload = (await listResponse.json()) as {
      jobs: Array<{ id: string }>;
    };
    expect(listPayload.jobs.some((job) => job.id === created.job.id)).toBe(
      true,
    );

    const runResponse = await fetch(
      `${baseUrl}/api/runs/${completed.result?.run_id}`,
    );
    expect(runResponse.status).toBe(200);

    await server.close();
  });

  it("creates and completes a local policy generation job", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const targetDir = path.join(tempDir, "target");
    const dataDir = resolveDataDir(path.join(tempDir, "data"));
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(
      path.join(targetDir, "install.sh"),
      "curl https://example.com/install.sh | bash\n",
      "utf8",
    );

    const server = await startServer({ port: 0, dataDir });
    const baseUrl = `http://localhost:${server.port}`;

    const createResponse = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "policy-generate",
        target: targetDir,
      }),
    });

    expect(createResponse.status).toBe(202);
    const created = (await createResponse.json()) as {
      job: { id: string };
    };

    const completed = await waitForJob(baseUrl, created.job.id);
    expect(completed.status).toBe("succeeded");
    expect(completed.result?.output).toContain("version: v1");
    expect(completed.result?.run_id).toBeDefined();

    const policyResponse = await fetch(
      `${baseUrl}/api/policy/${completed.result?.run_id}`,
    );
    expect(policyResponse.status).toBe(200);
    await expect(policyResponse.text()).resolves.toContain("version: v1");

    await server.close();
  });

  it("returns structured errors for invalid job requests and missing jobs", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const dataDir = resolveDataDir(tempDir);
    const server = await startServer({ port: 0, dataDir });
    const baseUrl = `http://localhost:${server.port}`;

    const invalidRequestResponse = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unknown" }),
    });
    expect(invalidRequestResponse.status).toBe(400);
    await expect(invalidRequestResponse.json()).resolves.toEqual({
      error: "Invalid job request: unsupported action 'unknown'",
      code: "invalid_job_request",
      status: 400,
    });

    const invalidJsonResponse = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    expect(invalidJsonResponse.status).toBe(400);
    await expect(invalidJsonResponse.json()).resolves.toEqual({
      error: "Invalid JSON body",
      code: "invalid_json",
      status: 400,
    });

    const missingJobResponse = await fetch(`${baseUrl}/api/jobs/missing-job`);
    expect(missingJobResponse.status).toBe(404);
    await expect(missingJobResponse.json()).resolves.toEqual({
      error: "Job not found",
      code: "job_not_found",
      status: 404,
    });

    await server.close();
  });

  it("serves dashboard overview with jobs, targets, and audit state", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const targetDir = path.join(tempDir, "target");
    const dataDir = resolveDataDir(path.join(tempDir, "data"));
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(
      path.join(targetDir, "install.sh"),
      "curl https://example.com/install.sh | bash\n",
      "utf8",
    );

    const server = await startServer({ port: 0, dataDir });
    const baseUrl = `http://localhost:${server.port}`;

    const createResponse = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "scan",
        target: targetDir,
        format: "md",
      }),
    });
    const created = (await createResponse.json()) as { job: { id: string } };
    const completed = await waitForJob(baseUrl, created.job.id);
    expect(completed.status).toBe("succeeded");

    const overviewResponse = await fetch(`${baseUrl}/api/overview`);
    expect(overviewResponse.status).toBe(200);
    const overview = (await overviewResponse.json()) as {
      summary: { total_runs: number; total_jobs: number; total_targets: number };
      latest_run: { id: string; total_score: number } | null;
      runs: Array<{ id: string; action?: string }>;
      jobs: Array<{ id: string; command_preview: string }>;
      targets: Array<{ path: string }>;
      audit: Array<{ job_id: string; message: string }>;
    };
    expect(overview.summary.total_runs).toBeGreaterThan(0);
    expect(overview.summary.total_jobs).toBeGreaterThan(0);
    expect(overview.latest_run?.total_score).toBeGreaterThan(0);
    expect(overview.latest_run?.id).toBe(completed.result?.run_id);
    expect(overview.runs[0]?.action).toBe("scan");
    expect(overview.jobs.some((job) => job.id === created.job.id)).toBe(true);
    expect(overview.targets[0]?.path).toBe(path.resolve(targetDir));
    expect(overview.audit.some((event) => event.job_id === created.job.id)).toBe(
      true,
    );

    await server.close();

    const restarted = await startServer({ port: 0, dataDir });
    const restartedBaseUrl = `http://localhost:${restarted.port}`;
    const restartedJobsResponse = await fetch(`${restartedBaseUrl}/api/jobs`);
    const restartedJobs = (await restartedJobsResponse.json()) as {
      jobs: Array<{ id: string }>;
    };
    expect(restartedJobs.jobs.some((job) => job.id === created.job.id)).toBe(
      true,
    );

    await restarted.close();
  });

  it("runs sign and verify jobs with explicit confirmation", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const dataDir = resolveDataDir(path.join(tempDir, "data"));
    const artifactPath = path.join(tempDir, "artifact.txt");
    const privateKeyPath = path.join(tempDir, "private.key");
    const publicKeyPath = path.join(tempDir, "public.key");
    await fs.writeFile(artifactPath, "demo artifact", "utf8");

    const privateKey = Buffer.alloc(32, 9);
    const publicKey = await getPublicKey(privateKey);
    await fs.writeFile(
      privateKeyPath,
      Buffer.from(privateKey).toString("hex"),
      "utf8",
    );
    await fs.writeFile(
      publicKeyPath,
      Buffer.from(publicKey).toString("hex"),
      "utf8",
    );

    const server = await startServer({ port: 0, dataDir });
    const baseUrl = `http://localhost:${server.port}`;

    const rejectedResponse = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "sign",
        artifact: artifactPath,
        key: privateKeyPath,
      }),
    });
    expect(rejectedResponse.status).toBe(400);
    await expect(rejectedResponse.json()).resolves.toEqual({
      error: "Invalid job request: confirmation must be a boolean",
      code: "invalid_job_request",
      status: 400,
    });

    const signCreateResponse = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "sign",
        artifact: artifactPath,
        key: privateKeyPath,
        confirmation: true,
      }),
    });
    const signCreated = (await signCreateResponse.json()) as {
      job: { id: string };
    };
    const signed = await waitForJob(baseUrl, signCreated.job.id);
    expect(signed.status).toBe("succeeded");
    expect(signed.result?.signature_path).toContain("artifact.txt.sig.json");

    const verifyCreateResponse = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "verify",
        artifact: artifactPath,
        pub: publicKeyPath,
      }),
    });
    const verifyCreated = (await verifyCreateResponse.json()) as {
      job: { id: string };
    };
    const verified = await waitForJob(baseUrl, verifyCreated.job.id);
    expect(verified.status).toBe("succeeded");
    expect(verified.result?.verified).toBe(true);

    await server.close();
  });

  it("reruns a saved scan configuration from the dashboard", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
    const targetDir = path.join(tempDir, "target");
    const dataDir = resolveDataDir(path.join(tempDir, "data"));
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(
      path.join(targetDir, "install.sh"),
      "curl https://example.com/install.sh | bash\n",
      "utf8",
    );

    const server = await startServer({ port: 0, dataDir });
    const baseUrl = `http://localhost:${server.port}`;

    const createResponse = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "scan",
        target: targetDir,
        format: "md",
      }),
    });
    const created = (await createResponse.json()) as { job: { id: string } };
    const completed = await waitForJob(baseUrl, created.job.id);
    const firstRunId = completed.result?.run_id;
    expect(firstRunId).toBeDefined();

    const rerunResponse = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "rerun",
        source_job_id: created.job.id,
        save_run: true,
      }),
    });
    expect(rerunResponse.status).toBe(202);
    const rerunCreated = (await rerunResponse.json()) as { job: { id: string } };
    const rerunCompleted = await waitForJob(baseUrl, rerunCreated.job.id);
    expect(rerunCompleted.status).toBe("succeeded");
    expect(rerunCompleted.result?.run_id).toBeDefined();
    expect(rerunCompleted.result?.run_id).not.toBe(firstRunId);

    await server.close();
  });
});

async function waitForJob(
  baseUrl: string,
  jobId: string,
): Promise<{
  status: string;
  result?: {
    run_id?: string;
    output?: string;
    summary?: { total_score: number };
    signature_path?: string;
    verified?: boolean;
  };
}> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/jobs/${jobId}`);
    const payload = (await response.json()) as {
      job: {
        status: string;
        result?: {
          run_id?: string;
          output?: string;
          summary?: { total_score: number };
          signature_path?: string;
          verified?: boolean;
        };
      };
    };
    if (payload.job.status === "succeeded" || payload.job.status === "failed") {
      return payload.job;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for job ${jobId}`);
}
