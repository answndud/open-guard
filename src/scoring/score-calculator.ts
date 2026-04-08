import type { Finding } from "../scanner/types.js";
import type { ScoreResult, Subscores } from "./types.js";
import {
  CATEGORY_WEIGHTS,
  CONFIDENCE_WEIGHTS,
  SEVERITY_POINTS,
} from "./weights.js";
import { scoreCategoryForFinding } from "./score-category.js";

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
function contributionForFinding(finding: Finding): number {
  const severityPoints = SEVERITY_POINTS[finding.severity] ?? 0;
  const confidenceWeight = CONFIDENCE_WEIGHTS[finding.confidence] ?? 0;
  return severityPoints * confidenceWeight;
}

function totalScore(subscores: Subscores, hasCritical: boolean): number {
  const weighted =
    subscores.shell * CATEGORY_WEIGHTS.shell +
    subscores.network * CATEGORY_WEIGHTS.network +
    subscores.filesystem * CATEGORY_WEIGHTS.filesystem +
    subscores.credentials * CATEGORY_WEIGHTS.credentials;

  const score = Math.min(Math.round(weighted), 100);
  return hasCritical ? Math.max(score, 60) : score;
}
