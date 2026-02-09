import type { Finding } from "../scanner/types.js";
import type { Policy } from "../policy/types.js";
import type { Subscores } from "../scoring/types.js";

export interface ToolInfo {
  readonly name: "openguard";
  readonly version: string;
}

export interface TargetInfo {
  readonly input: string;
  readonly resolved_path?: string;
  readonly commit?: string;
  readonly branch?: string;
  readonly files_scanned?: number;
  readonly files_skipped?: number;
}

export interface SummaryCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export type RiskLevel = "low" | "moderate" | "high" | "very-high" | "critical";

export interface SummaryInfo {
  readonly total_score: number;
  readonly subscores: Subscores;
  readonly counts: SummaryCounts;
  readonly risk_level: RiskLevel;
}

export interface ScanMetadata {
  readonly started_at?: string;
  readonly completed_at?: string;
  readonly duration_ms?: number;
  readonly rules_loaded?: number;
  readonly rules_version?: string;
}

export interface ScanReport {
  readonly tool: ToolInfo;
  readonly target: TargetInfo;
  readonly summary: SummaryInfo;
  readonly findings: readonly Finding[];
  readonly recommended_policy?: Policy;
  readonly scan_metadata?: ScanMetadata;
}

export interface ReportInput {
  readonly toolVersion: string;
  readonly target: TargetInfo;
  readonly findings: readonly Finding[];
  readonly subscores: Subscores;
  readonly totalScore: number;
  readonly recommendedPolicy?: Policy;
  readonly scanMetadata?: ScanMetadata;
}
