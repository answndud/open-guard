import type { Finding } from "../scanner/types.js";
import type { ReportInput, ScanReport, SummaryCounts } from "./types.js";
import { riskLevelForScore } from "./report-utils.js";

export function buildJsonReport(input: ReportInput): ScanReport {
  const counts = countFindings(input.findings);
  return {
    tool: { name: "openguard", version: input.toolVersion },
    target: input.target,
    summary: {
      total_score: input.totalScore,
      subscores: input.subscores,
      counts,
      risk_level: riskLevelForScore(input.totalScore),
    },
    findings: sortFindings(input.findings),
    recommended_policy: input.recommendedPolicy,
    scan_metadata: input.scanMetadata,
  };
}

function countFindings(findings: readonly Finding[]): SummaryCounts {
  const counts: SummaryCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    total: findings.length,
  };

  for (const finding of findings) {
    switch (finding.severity) {
      case "critical":
        counts.critical += 1;
        break;
      case "high":
        counts.high += 1;
        break;
      case "medium":
        counts.medium += 1;
        break;
      case "low":
        counts.low += 1;
        break;
      case "info":
        counts.info += 1;
        break;
      default:
        break;
    }
  }

  return counts;
}

function sortFindings(findings: readonly Finding[]): Finding[] {
  const order = new Map([
    ["critical", 0],
    ["high", 1],
    ["medium", 2],
    ["low", 3],
    ["info", 4],
  ]);

  return [...findings].sort((a, b) => {
    const aRank = order.get(a.severity) ?? 5;
    const bRank = order.get(b.severity) ?? 5;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    return a.id.localeCompare(b.id);
  });
}
