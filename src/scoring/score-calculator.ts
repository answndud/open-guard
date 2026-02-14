import type { Finding } from "../scanner/types.js";
import type { ScoreResult, Subscores } from "./types.js";
import {
  CATEGORY_MAP,
  CATEGORY_WEIGHTS,
  CONFIDENCE_WEIGHTS,
  SEVERITY_POINTS,
  ScoreCategory,
} from "./weights.js";

export function calculateScore(findings: readonly Finding[]): ScoreResult {
  const subscores: Subscores = {
    shell: 0,
    network: 0,
    filesystem: 0,
    credentials: 0,
  };

  let hasCritical = false;

  for (const finding of findings) {
    const contribution = contributionForFinding(finding);
    const category = scoreCategoryForFinding(finding);
    subscores[category] = Math.min(subscores[category] + contribution, 100);

    if (finding.severity === "critical") {
      hasCritical = true;
    }
  }

  const total = totalScore(subscores, hasCritical);
  return { total, subscores, hasCritical };
}

function scoreCategoryForFinding(finding: Finding): ScoreCategory {
  if (finding.category !== "gha") {
    return CATEGORY_MAP[finding.category] ?? ScoreCategory.Shell;
  }

  if (finding.rule_id === "OG-GHA-001") {
    return ScoreCategory.Credentials;
  }

  return ScoreCategory.Shell;
}

function contributionForFinding(finding: Finding): number {
  const severityPoints = SEVERITY_POINTS[finding.severity] ?? 0;
  const confidenceWeight = CONFIDENCE_WEIGHTS[finding.confidence] ?? 0;
  return severityPoints * confidenceWeight;
}

function totalScore(subscores: Subscores, hasCritical: boolean): number {
  const weighted =
    subscores.shell * CATEGORY_WEIGHTS[ScoreCategory.Shell] +
    subscores.network * CATEGORY_WEIGHTS[ScoreCategory.Network] +
    subscores.filesystem * CATEGORY_WEIGHTS[ScoreCategory.Filesystem] +
    subscores.credentials * CATEGORY_WEIGHTS[ScoreCategory.Credentials];

  const score = Math.min(Math.round(weighted), 100);
  return hasCritical ? Math.max(score, 60) : score;
}
