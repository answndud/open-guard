import { describe, expect, it } from "vitest";
import { calculateScore } from "../../src/scoring/score-calculator.js";
import { Confidence, Severity } from "../../src/scanner/types.js";
import type { Finding } from "../../src/scanner/types.js";

const baseFinding: Finding = {
  id: "abc123",
  rule_id: "OG-TEST-001",
  severity: Severity.Low,
  category: "shell",
  confidence: Confidence.Low,
  title: "Test",
  description: "Test",
  remediation: "Test",
  evidence: {
    path: "test.sh",
    start_line: 1,
    end_line: 1,
    snippet: "echo test",
    match: "echo",
  },
};

describe("score calculator", () => {
  it("returns zero scores for empty findings", () => {
    const result = calculateScore([]);
    expect(result.total).toBe(0);
    expect(result.subscores.shell).toBe(0);
    expect(result.subscores.network).toBe(0);
    expect(result.subscores.filesystem).toBe(0);
    expect(result.subscores.credentials).toBe(0);
    expect(result.hasCritical).toBe(false);
  });

  it("applies category mapping and weights", () => {
    const findings: Finding[] = [
      {
        ...baseFinding,
        id: "1",
        severity: Severity.High,
        confidence: Confidence.High,
        category: "shell",
      },
      {
        ...baseFinding,
        id: "2",
        severity: Severity.Medium,
        confidence: Confidence.Medium,
        category: "network",
      },
      {
        ...baseFinding,
        id: "3",
        severity: Severity.Low,
        confidence: Confidence.High,
        category: "macos",
      },
      {
        ...baseFinding,
        id: "4",
        severity: Severity.Info,
        confidence: Confidence.High,
        category: "credentials",
      },
    ];

    const result = calculateScore(findings);
    expect(result.subscores.shell).toBeGreaterThan(0);
    expect(result.subscores.network).toBeGreaterThan(0);
    expect(result.subscores.filesystem).toBeGreaterThan(0);
    expect(result.subscores.credentials).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it("caps subscores at 100", () => {
    const findings: Finding[] = [];
    for (let i = 0; i < 20; i += 1) {
      findings.push({
        ...baseFinding,
        id: `shell-${i}`,
        severity: Severity.Critical,
        confidence: Confidence.High,
        category: "shell",
      });
    }

    const result = calculateScore(findings);
    expect(result.subscores.shell).toBe(100);
  });

  it("enforces critical floor", () => {
    const findings: Finding[] = [
      {
        ...baseFinding,
        id: "critical",
        severity: Severity.Critical,
        confidence: Confidence.Low,
      },
    ];

    const result = calculateScore(findings);
    expect(result.hasCritical).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(60);
  });

  it("maps GHA permissions rule to credentials subscore", () => {
    const finding: Finding = {
      ...baseFinding,
      id: "gha-permissions",
      rule_id: "OG-GHA-001",
      severity: Severity.High,
      confidence: Confidence.High,
      category: "gha",
    };

    const result = calculateScore([finding]);
    expect(result.subscores.credentials).toBe(15);
    expect(result.subscores.shell).toBe(0);
  });
});
