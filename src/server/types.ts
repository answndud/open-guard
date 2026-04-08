import type { SummaryInfo, RiskLevel } from "../report/types.js";

export type ServerJobAction =
  | "scan"
  | "policy-generate"
  | "sign"
  | "verify"
  | "rerun";

export type ExecutedJobAction = Exclude<ServerJobAction, "rerun">;

export type ServerJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface ScanJobRequest {
  readonly action: "scan";
  readonly target: string;
  readonly format?: "json" | "md" | "sarif";
  readonly diff_base?: string;
  readonly rules_dir?: string;
  readonly policy_path?: string;
  readonly threshold?: number;
  readonly show?: "summary" | "findings" | "all";
  readonly max_findings?: number;
  readonly show_evidence?: boolean;
  readonly save_run?: boolean;
}

export interface PolicyGenerateJobRequest {
  readonly action: "policy-generate";
  readonly target: string;
  readonly merge?: string;
  readonly rules_dir?: string;
  readonly save_run?: boolean;
}

export interface SignJobRequest {
  readonly action: "sign";
  readonly artifact: string;
  readonly key: string;
  readonly out?: string;
  readonly confirmation: boolean;
}

export interface VerifyJobRequest {
  readonly action: "verify";
  readonly artifact: string;
  readonly pub: string;
  readonly signature?: string;
  readonly strict?: boolean;
}

export interface RerunJobRequest {
  readonly action: "rerun";
  readonly source_job_id: string;
  readonly save_run?: boolean;
  readonly confirmation?: boolean;
}

export type ServerJobRequest =
  | ScanJobRequest
  | PolicyGenerateJobRequest
  | SignJobRequest
  | VerifyJobRequest
  | RerunJobRequest;

export interface ServerJobEvent {
  readonly time: string;
  readonly status: ServerJobStatus;
  readonly message: string;
}

export interface ServerJobResult {
  readonly output?: string;
  readonly run_id?: string;
  readonly summary?: SummaryInfo;
  readonly signature_path?: string;
  readonly verified?: boolean;
  readonly policy_present?: boolean;
  readonly executed_action?: ExecutedJobAction;
  readonly source_job_id?: string;
}

export interface ServerJob {
  readonly id: string;
  readonly action: ServerJobAction;
  readonly status: ServerJobStatus;
  readonly created_at: string;
  readonly started_at?: string;
  readonly finished_at?: string;
  readonly request: ServerJobRequest;
  readonly command_preview: string;
  readonly result?: ServerJobResult;
  readonly error?: string;
  readonly target_id?: string;
  readonly target_label?: string;
  readonly sensitive?: boolean;
  readonly requires_confirmation?: boolean;
  readonly events: readonly ServerJobEvent[];
}

export interface DashboardTargetRecord {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly updated_at: string;
  readonly last_job_id?: string;
  readonly last_run_id?: string;
  readonly last_action?: ServerJobAction;
  readonly last_status?: ServerJobStatus;
  readonly last_score?: number;
  readonly last_risk?: RiskLevel;
  readonly last_findings?: number;
  readonly last_scan_job_id?: string;
  readonly last_policy_job_id?: string;
  readonly last_sign_job_id?: string;
  readonly last_verify_job_id?: string;
}

export interface DashboardAuditEvent {
  readonly id: string;
  readonly created_at: string;
  readonly actor: "local-dashboard";
  readonly job_id: string;
  readonly action: ServerJobAction;
  readonly status: ServerJobStatus;
  readonly target_id?: string;
  readonly target_label?: string;
  readonly request: ServerJobRequest;
  readonly result?: ServerJobResult;
  readonly error?: string;
  readonly message: string;
}
