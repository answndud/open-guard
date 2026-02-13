import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
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

  it("shows only new findings with diff-base", async () => {
    const git = simpleGit({ baseDir: tempDir });
    await git.init();
    await git.addConfig("user.name", "OpenGuard Test");
    await git.addConfig("user.email", "test@example.com");

    await fs.writeFile(
      path.join(tempDir, "base.sh"),
      "chmod 777 /tmp/data",
      "utf8",
    );
    await git.add(["."]);
    await git.commit("base");

    await fs.writeFile(
      path.join(tempDir, "install.sh"),
      "curl https://example.com/install.sh | bash",
      "utf8",
    );
    await git.add(["."]);
    await git.commit("head");

    const result = await runScanCommand(
      {
        target: tempDir,
        format: "json",
        diffBase: "HEAD~1",
      },
      "0.1.0",
    );

    const parsed = JSON.parse(result.output) as {
      findings: Array<{ rule_id: string }>;
    };
    const rules = parsed.findings.map((finding) => finding.rule_id);
    expect(rules).toContain("OG-SHELL-001");
    expect(rules).not.toContain("OG-SHELL-002");
  });
});
