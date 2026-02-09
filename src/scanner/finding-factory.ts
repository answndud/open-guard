import crypto from "node:crypto";
import type { Evidence, Finding, Rule } from "./types.js";

export function createFinding(rule: Rule, evidence: Evidence): Finding {
  const id = createFindingId(
    rule.id,
    evidence.path,
    evidence.start_line,
    evidence.match,
  );
  return {
    id,
    rule_id: rule.id,
    severity: rule.severity,
    category: rule.category,
    confidence: rule.confidence,
    title: rule.title,
    description: rule.description,
    evidence,
    remediation: rule.remediation,
    tags: rule.tags,
  };
}

export function createFindingId(
  ruleId: string,
  relativePath: string,
  startLine: number,
  matchedText: string,
): string {
  const input = `${ruleId}:${relativePath}:${startLine}:${matchedText}`;
  const hash = crypto.createHash("sha256").update(input).digest("hex");
  return hash.slice(0, 12);
}
