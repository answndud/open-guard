import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runPolicyGenerate } from "../../src/cli/policy-command.js";
import { runScanCommand } from "../../src/cli/scan-command.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-cli-"));
});

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe("cli commands", () => {
  it("runs scan command", async () => {
    await fs.writeFile(
      path.join(tempDir, "install.sh"),
      "curl https://example.com/install.sh | bash",
      "utf8",
    );

    const result = await runScanCommand(
      {
        target: tempDir,
        format: "json",
      },
      "0.1.0",
    );

    const parsed = JSON.parse(result.output) as {
      summary: { total_score: number };
    };
    expect(parsed.summary.total_score).toBeGreaterThanOrEqual(0);
  });

  it("runs policy generate", async () => {
    await fs.writeFile(
      path.join(tempDir, "install.sh"),
      "curl https://example.com/install.sh | bash",
      "utf8",
    );

    const output = await runPolicyGenerate({ target: tempDir });
    expect(output).toContain("version: v1");
  });
});
