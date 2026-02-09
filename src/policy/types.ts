export const enum ApprovalMode {
  Auto = "auto",
  Prompt = "prompt",
  TwoStep = "2-step",
  Deny = "deny",
}

export const enum ApprovalCategory {
  ShellExec = "shell_exec",
  NewDomain = "new_domain",
  CredentialPaths = "credential_paths",
  FileWrite = "file_write",
  ElevatedPrivilege = "elevated_privilege",
}

export interface PolicyMetadata {
  readonly name?: string;
  readonly description?: string;
  readonly created?: string;
  readonly author?: string;
}

export interface PolicyDefaults {
  readonly action: "deny" | "allow";
  readonly require_approval_for: readonly ApprovalCategory[];
}

export interface CommandRule {
  readonly cmd: string;
  readonly args?: readonly string[];
  readonly description?: string;
}

export interface PathRules {
  readonly read: readonly string[];
  readonly write: readonly string[];
}

export interface NetworkRules {
  readonly domains: readonly string[];
  readonly ports: readonly number[];
}

export interface AllowRules {
  readonly commands: readonly CommandRule[];
  readonly paths: PathRules;
  readonly network: NetworkRules;
}

export interface DenyRules {
  readonly commands: readonly CommandRule[];
  readonly paths: readonly string[];
  readonly network: {
    readonly domains: readonly string[];
  };
}

export interface ApprovalConfig {
  readonly mode: ApprovalMode;
  readonly except_allowlisted: boolean;
}

export interface Approvals {
  readonly shell_exec: ApprovalConfig;
  readonly new_domain: ApprovalConfig;
  readonly credential_paths: ApprovalConfig;
  readonly file_write: ApprovalConfig;
  readonly elevated_privilege: ApprovalConfig;
}

export interface Policy {
  readonly version: "v1";
  readonly metadata?: PolicyMetadata;
  readonly defaults: PolicyDefaults;
  readonly allow: AllowRules;
  readonly deny: DenyRules;
  readonly approvals: Approvals;
}
