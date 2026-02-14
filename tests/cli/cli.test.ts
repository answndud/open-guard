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

  it("supports diff-base with dirty working tree", async () => {
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

    await fs.writeFile(path.join(tempDir, "notes.txt"), "local edits", "utf8");

    const branchBefore = await git.revparse(["--abbrev-ref", "HEAD"]);
    const result = await runScanCommand(
      {
        target: tempDir,
        format: "json",
        diffBase: "HEAD~1",
      },
      "0.1.0",
    );
    const branchAfter = await git.revparse(["--abbrev-ref", "HEAD"]);

    const parsed = JSON.parse(result.output) as {
      findings: Array<{ rule_id: string }>;
    };
    expect(branchAfter.trim()).toBe(branchBefore.trim());
    expect(
      parsed.findings.some((finding) => finding.rule_id === "OG-SHELL-001"),
    ).toBe(true);
  });

  it("merges custom rules with built-in rules", async () => {
    const customRulesDir = path.join(tempDir, "custom-rules");
    await fs.mkdir(customRulesDir, { recursive: true });
    await fs.writeFile(
      path.join(customRulesDir, "_meta.yaml"),
      [
        'rule_format_version: "1.0"',
        "file_type_extensions:",
        '  shell: [".sh"]',
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(customRulesDir, "custom.yaml"),
      [
        "rules:",
        "  - id: OG-CUSTOM-001",
        '    title: "Custom shell marker"',
        '    description: "Detects custom marker"',
        "    severity: low",
        "    confidence: high",
        "    category: shell",
        "    scope:",
        "      file_types: [shell]",
        "    patterns:",
        '      - regex: "custom_marker"',
        '        description: "Custom marker in shell"',
        '    remediation: "Remove marker"',
      ].join("\n"),
      "utf8",
    );

    await fs.writeFile(
      path.join(tempDir, "install.sh"),
      "custom_marker\ncurl https://example.com/install.sh | bash",
      "utf8",
    );

    const result = await runScanCommand(
      {
        target: tempDir,
        format: "json",
        rulesDir: customRulesDir,
      },
      "0.1.0",
    );

    const parsed = JSON.parse(result.output) as {
      findings: Array<{ rule_id: string }>;
    };
    const ruleIds = parsed.findings.map((finding) => finding.rule_id);
    expect(ruleIds).toContain("OG-CUSTOM-001");
    expect(ruleIds).toContain("OG-SHELL-001");
  });

  it("validates policy file when --policy is provided", async () => {
    await fs.writeFile(
      path.join(tempDir, "install.sh"),
      "curl https://example.com/install.sh | bash",
      "utf8",
    );

    const invalidPolicyPath = path.join(tempDir, "policy.yaml");
    await fs.writeFile(
      invalidPolicyPath,
      ["version: v1", "defaults:", "  action: block"].join("\n"),
      "utf8",
    );

    await expect(
      runScanCommand(
        {
          target: tempDir,
          format: "json",
          policyPath: invalidPolicyPath,
        },
        "0.1.0",
      ),
    ).rejects.toThrow("defaults.action");
  });
});
