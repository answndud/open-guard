export const enum Severity {
  Info = "info",
  Low = "low",
  Medium = "medium",
  High = "high",
  Critical = "critical",
}

export const enum Confidence {
  Low = "low",
  Medium = "medium",
  High = "high",
}

export interface RulePattern {
  readonly regex: string;
  readonly description: string;
}

export interface RuleScope {
  readonly file_types: readonly string[];
}

export interface Rule {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly category: string;
  readonly scope: RuleScope;
  readonly patterns: readonly RulePattern[];
  readonly remediation: string;
  readonly tags?: readonly string[];
}

export interface Evidence {
  readonly path: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly snippet: string;
  readonly match: string;
}

export interface Finding {
  readonly id: string;
  readonly rule_id: string;
  readonly severity: Severity;
  readonly category: string;
  readonly confidence: Confidence;
  readonly title: string;
  readonly description: string;
  readonly evidence: Evidence;
  readonly remediation: string;
  readonly tags?: readonly string[];
}

export interface RuleMeta {
  readonly rule_format_version: string;
  readonly file_type_extensions: Record<string, readonly string[]>;
}
