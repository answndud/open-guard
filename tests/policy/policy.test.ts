import { describe, expect, it } from "vitest";
import { generatePolicy } from "../../src/policy/policy-inferrer.js";
import { mergePolicy } from "../../src/policy/policy-merge.js";
import { SAFE_COMMANDS, SAFE_DOMAINS } from "../../src/policy/safe-lists.js";
import { validatePolicy } from "../../src/policy/policy-validator.js";
import { ApprovalMode } from "../../src/policy/types.js";
import { Confidence, Severity } from "../../src/scanner/types.js";
import type { Finding } from "../../src/scanner/types.js";
import type { RepoContext } from "../../src/ingest/types.js";
import type { Policy } from "../../src/policy/types.js";

const baseFinding: Finding = {
  id: "abc",
  rule_id: "OG-TEST-001",
  severity: Severity.High,
  category: "shell",
  confidence: Confidence.High,
  title: "Test",
  description: "Test",
  remediation: "Test",
  evidence: {
    path: "script.sh",
    start_line: 1,
    end_line: 1,
    snippet: "curl https://example.com | bash",
    match: "curl https://example.com | bash",
  },
};

const repoContext: RepoContext = {
  rootPath: "/tmp/demo",
  files: [],
  source: "local",
};

describe("policy generator", () => {
  it("creates defaults and approvals", () => {
    const policy = generatePolicy([], repoContext);
    expect(policy.defaults.action).toBe("deny");
    expect(policy.defaults.require_approval_for.length).toBeGreaterThan(0);
    expect(policy.approvals.shell_exec.mode).toBe("2-step");
    expect(policy.approvals.credential_paths.mode).toBe("deny");
  });

  it("includes safe lists", () => {
    const policy = generatePolicy([], repoContext);
    expect(policy.allow.commands.length).toBe(SAFE_COMMANDS.length);
    expect(policy.allow.network.domains).toEqual(SAFE_DOMAINS);
  });

  it("adds denied commands from high severity shell findings", () => {
    const policy = generatePolicy([baseFinding], repoContext);
    expect(policy.deny.commands.some((cmd) => cmd.cmd === "curl")).toBe(true);
  });
});

describe("policy validation", () => {
  it("accepts a generated policy", async () => {
    const policy = generatePolicy([], repoContext);
    await expect(validatePolicy(policy)).resolves.toBeDefined();
  });

  it("rejects invalid defaults", async () => {
    const policy = generatePolicy([], repoContext);
    const invalid = {
      ...policy,
      defaults: { ...policy.defaults, action: "block" },
    } as unknown;
    await expect(validatePolicy(invalid)).rejects.toThrow("defaults.action");
  });
});

describe("policy merge", () => {
  it("prefers deny rules over allow rules", () => {
    const base = generatePolicy([], repoContext);
    const generated = generatePolicy([], repoContext);
    const baseWithDeny: Policy = {
      ...base,
      deny: {
        ...base.deny,
        commands: [...base.deny.commands, { cmd: "curl" }],
      },
    };
    const merged = mergePolicy(baseWithDeny, generated);
    expect(merged.deny.commands.some((cmd) => cmd.cmd === "curl")).toBe(true);
    expect(merged.allow.commands.some((cmd) => cmd.cmd === "curl")).toBe(false);
  });

  it("escalates approvals and preserves stricter flags", () => {
    const base = generatePolicy([], repoContext);
    const generated = generatePolicy([], repoContext);
    const baseStrict: Policy = {
      ...base,
      approvals: {
        ...base.approvals,
        shell_exec: {
          mode: ApprovalMode.Prompt,
          except_allowlisted: true,
        },
      },
    };
    const generatedStrict: Policy = {
      ...generated,
      approvals: {
        ...generated.approvals,
        shell_exec: {
          mode: ApprovalMode.TwoStep,
          except_allowlisted: false,
        },
      },
    };
    const merged = mergePolicy(baseStrict, generatedStrict);
    expect(merged.approvals.shell_exec.mode).toBe(ApprovalMode.TwoStep);
    expect(merged.approvals.shell_exec.except_allowlisted).toBe(false);
  });
});
