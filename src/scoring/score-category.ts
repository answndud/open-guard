import type { Finding } from "../scanner/types.js";
import type { Subscores } from "./types.js";
import { CATEGORY_MAP } from "./weights.js";

export interface ScoreCategoryInput {
  readonly category: string;
  readonly rule_id: string;
}

export type ScoreCategoryKey = keyof Subscores;

export function scoreCategoryForFinding(
  finding: ScoreCategoryInput,
): ScoreCategoryKey {
  if (finding.category !== "gha") {
    return CATEGORY_MAP[finding.category] ?? "shell";
  }

  if (finding.rule_id === "OG-GHA-001") {
    return "credentials";
  }

  return "shell";
}

export function countFindingsForScoreCategory(
  findingsOrReport:
    | readonly Finding[]
    | { readonly findings: readonly Finding[] },
  category: ScoreCategoryKey,
): number {
  const findings: readonly Finding[] = Array.isArray(findingsOrReport)
    ? findingsOrReport
    : (findingsOrReport as { readonly findings: readonly Finding[] }).findings;
  return findings.filter((finding) => scoreCategoryForFinding(finding) === category)
    .length;
}
