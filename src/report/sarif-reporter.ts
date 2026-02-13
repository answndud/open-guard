import type { Finding } from "../scanner/types.js";
import type { ScanReport } from "./types.js";

type SarifLevel = "error" | "warning" | "note";

interface SarifRule {
  readonly id: string;
  readonly name: string;
  readonly shortDescription: { readonly text: string };
  readonly fullDescription?: { readonly text: string };
  readonly help?: { readonly text: string };
  readonly properties?: Record<string, string>;
}

interface SarifResult {
  readonly ruleId: string;
  readonly level: SarifLevel;
  readonly message: { readonly text: string };
  readonly locations: readonly {
    readonly physicalLocation: {
      readonly artifactLocation: { readonly uri: string };
      readonly region: {
        readonly startLine: number;
        readonly endLine?: number;
        readonly snippet?: { readonly text: string };
      };
    };
  }[];
  readonly properties?: Record<string, string>;
}

interface SarifLog {
  readonly version: "2.1.0";
  readonly $schema: string;
  readonly runs: readonly {
    readonly tool: {
      readonly driver: {
        readonly name: string;
        readonly version: string;
        readonly rules: readonly SarifRule[];
      };
    };
    readonly results: readonly SarifResult[];
  }[];
}

export function renderSarifReport(report: ScanReport): string {
  const { rules, results } = toSarif(report.findings);
  const sarif: SarifLog = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "OpenGuard",
            version: report.tool.version,
            rules,
          },
        },
        results,
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

function toSarif(findings: readonly Finding[]): {
  readonly rules: SarifRule[];
  readonly results: SarifResult[];
} {
  const rules: SarifRule[] = [];
  const seen = new Set<string>();
  const results = findings.map((finding) => {
    if (!seen.has(finding.rule_id)) {
      seen.add(finding.rule_id);
      rules.push(buildRule(finding));
    }
    return buildResult(finding);
  });
  return { rules, results };
}

function buildRule(finding: Finding): SarifRule {
  return {
    id: finding.rule_id,
    name: finding.rule_id,
    shortDescription: { text: finding.title },
    fullDescription: finding.description
      ? { text: finding.description }
      : undefined,
    help: finding.remediation ? { text: finding.remediation } : undefined,
    properties: {
      category: finding.category,
      severity: finding.severity,
      confidence: finding.confidence,
    },
  };
}

function buildResult(finding: Finding): SarifResult {
  return {
    ruleId: finding.rule_id,
    level: toSarifLevel(finding.severity),
    message: { text: finding.title },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.evidence.path },
          region: {
            startLine: finding.evidence.start_line,
            endLine: finding.evidence.end_line,
            snippet: finding.evidence.snippet
              ? { text: finding.evidence.snippet }
              : undefined,
          },
        },
      },
    ],
    properties: {
      id: finding.id,
      category: finding.category,
      severity: finding.severity,
      confidence: finding.confidence,
    },
  };
}

function toSarifLevel(severity: Finding["severity"]): SarifLevel {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
    case "info":
    default:
      return "note";
  }
}
