import type { RiskLevel } from "./types.js";

export function riskLevelForScore(score: number): RiskLevel {
  if (score >= 80) {
    return "critical";
  }
  if (score >= 60) {
    return "very-high";
  }
  if (score >= 40) {
    return "high";
  }
  if (score >= 20) {
    return "moderate";
  }
  return "low";
}
