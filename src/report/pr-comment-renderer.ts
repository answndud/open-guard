import type { ScanReport } from "./types.js";
import type { Finding } from "../scanner/types.js";
import type { Policy, CommandRule } from "../policy/types.js";
import { riskLevelForScore } from "./report-utils.js";

const COMMENT_MARKER = "<!-- openguard-pr-comment -->";

export interface PrCommentInput {
  readonly head: ScanReport;
  readonly base?: ScanReport;
}

export function renderPrComment(input: PrCommentInput): string {
  const head = input.head;
  const base = input.base;
  const headScore = head.summary.total_score;
  const baseScore = base?.summary.total_score ?? 0;
  const delta = headScore - baseScore;
  const deltaLabel = formatDelta(delta);
  const newFindings = base
    ? diffFindings(base.findings, head.findings)
    : head.findings;

  const lines: string[] = [];
  lines.push(COMMENT_MARKER);
  lines.push("## 🛡️ OpenGuard Scan Report");
  lines.push("");
  lines.push(
    `**Risk Score:** ${headScore}/100 (${formatRiskLabel(
      riskLevelForScore(headScore),
    )}) ${deltaLabel}`,
  );
  lines.push("");
  lines.push("| Category | Score | Findings |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Shell | ${head.summary.subscores.shell} | ${countCategories(head, [
      "shell",
      "obfuscation",
      "gha",
    ])} |`,
  );
  lines.push(
    `| Network | ${head.summary.subscores.network} | ${countCategories(head, [
      "network",
      "supply-chain",
    ])} |`,
  );
  lines.push(
    `| Filesystem | ${head.summary.subscores.filesystem} | ${countCategories(
      head,
      ["filesystem", "macos", "windows"],
    )} |`,
  );
  lines.push(
    `| Credentials | ${head.summary.subscores.credentials} | ${countCategories(
      head,
      ["credentials"],
    )} |`,
  );

  const socialSummary = buildSocialEngineeringSummary(head);
  if (socialSummary.length > 0) {
    lines.push("");
    lines.push("### Social Engineering Signals");
    lines.push("");
    lines.push("| Signal | Count |");
    lines.push("| --- | --- |");
    for (const row of socialSummary) {
      lines.push(`| ${row[0]} | ${row[1]} |`);
    }
  }

  const highSignal = buildHighSignalSummary(newFindings);
  if (highSignal.length > 0) {
    lines.push("");
    lines.push("### New High-Signal Rules");
    lines.push("");
    lines.push("| Rule | Hits |");
    lines.push("| --- | --- |");
    for (const [ruleId, count] of highSignal) {
      lines.push(`| ${ruleId} | ${count} |`);
    }
  }

  const policyDiff = buildPolicyDiff(
    base?.recommended_policy,
    head.recommended_policy,
  );
  if (policyDiff.length > 0) {
    lines.push("");
    lines.push("<details><summary>📋 Recommended Policy Changes</summary>");
    lines.push("");
    for (const line of policyDiff) {
      lines.push(`- ${line}`);
    }
    lines.push("");
    lines.push("</details>");
  }

  lines.push("");
  lines.push("### New Findings");
  lines.push("");
  if (newFindings.length === 0) {
    lines.push("No new findings in this change set.");
  } else {
    lines.push("| ID | Severity | Rule | File | Line |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const finding of newFindings) {
      lines.push(
        `| \`${finding.id}\` | ${formatSeverity(
          finding.severity,
        )} | ${finding.rule_id} | \`${finding.evidence.path}\` | L${finding.evidence.start_line} |`,
      );
    }
  }

  return lines.join("\n");
}

function diffFindings(
  base: readonly Finding[],
  head: readonly Finding[],
): Finding[] {
  const baseIds = new Set(base.map((finding) => finding.id));
  return head.filter((finding) => !baseIds.has(finding.id));
}

function countCategories(
  report: ScanReport,
  categories: readonly string[],
): number {
  return report.findings.filter((finding) =>
    categories.includes(finding.category),
  ).length;
}

function formatSeverity(severity: string): string {
  switch (severity) {
    case "critical":
      return "🔴 Critical";
    case "high":
      return "🟠 High";
    case "medium":
      return "🟡 Medium";
    case "low":
      return "🟢 Low";
    case "info":
      return "⚪ Info";
    default:
      return severity;
  }
}

function formatRiskLabel(level: string): string {
  switch (level) {
    case "very-high":
      return "Very High";
    default:
      return level.charAt(0).toUpperCase() + level.slice(1);
  }
}

function formatDelta(delta: number): string {
  if (delta === 0) {
    return "(no change)";
  }
  const sign = delta > 0 ? "⬆️" : "⬇️";
  return `${sign} ${delta > 0 ? "+" : ""}${delta}`;
}

function buildSocialEngineeringSummary(report: ScanReport): string[][] {
  const clipboard = report.findings.filter(
    (finding) => finding.rule_id === "OG-MD-001",
  ).length;
  const verificationBypass = report.findings.filter(
    (finding) => finding.rule_id === "OG-MD-002",
  ).length;
  if (clipboard === 0 && verificationBypass === 0) {
    return [];
  }
  return [
    ["Clipboard execution instructions", String(clipboard)],
    ["Verification bypass instructions", String(verificationBypass)],
  ];
}

function buildHighSignalSummary(
  findings: readonly Finding[],
): Array<[string, string]> {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    const isHighSignal =
      (finding.severity === "critical" || finding.severity === "high") &&
      (finding.confidence === "high" || finding.confidence === "medium");
    if (!isHighSignal) {
      continue;
    }
    counts.set(finding.rule_id, (counts.get(finding.rule_id) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (a[1] !== b[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    })
    .map(([ruleId, count]) => [ruleId, String(count)]);
}

function buildPolicyDiff(base?: Policy, head?: Policy): string[] {
  if (!head) {
    return [];
  }

  if (!base) {
    return [
      "Generated a recommended policy for this change set.",
      `Allow commands: ${head.allow.commands.length}`,
      `Deny commands: ${head.deny.commands.length}`,
      `Allowed domains: ${head.allow.network.domains.length}`,
    ];
  }

  const lines: string[] = [];
  lines.push(
    ...diffList(
      "allow.commands",
      formatCommands(base.allow.commands),
      formatCommands(head.allow.commands),
    ),
  );
  lines.push(
    ...diffList(
      "allow.paths.read",
      base.allow.paths.read,
      head.allow.paths.read,
    ),
  );
  lines.push(
    ...diffList(
      "allow.paths.write",
      base.allow.paths.write,
      head.allow.paths.write,
    ),
  );
  lines.push(
    ...diffList(
      "allow.network.domains",
      base.allow.network.domains,
      head.allow.network.domains,
    ),
  );
  lines.push(
    ...diffList(
      "deny.commands",
      formatCommands(base.deny.commands),
      formatCommands(head.deny.commands),
    ),
  );
  lines.push(...diffList("deny.paths", base.deny.paths, head.deny.paths));
  lines.push(
    ...diffList(
      "deny.network.domains",
      base.deny.network.domains,
      head.deny.network.domains,
    ),
  );
  lines.push(...diffApprovals(base, head));

  return lines.length > 0 ? lines : ["No policy changes detected."];
}

function formatCommands(commands: readonly CommandRule[]): string[] {
  return commands
    .map((command) =>
      command.args && command.args.length > 0
        ? `${command.cmd} ${command.args.join(" ")}`
        : command.cmd,
    )
    .sort((a, b) => a.localeCompare(b));
}

function diffList(
  label: string,
  baseItems: readonly string[],
  headItems: readonly string[],
): string[] {
  const baseSet = new Set(baseItems);
  const headSet = new Set(headItems);
  const added = [...headSet].filter((item) => !baseSet.has(item)).sort();
  const removed = [...baseSet].filter((item) => !headSet.has(item)).sort();
  const changes: string[] = [];

  for (const item of added) {
    changes.push(`Added ${label}: \`${item}\``);
  }
  for (const item of removed) {
    changes.push(`Removed ${label}: \`${item}\``);
  }
  return changes;
}

function diffApprovals(base: Policy, head: Policy): string[] {
  const keys: Array<keyof Policy["approvals"]> = [
    "shell_exec",
    "new_domain",
    "credential_paths",
    "file_write",
    "elevated_privilege",
  ];

  const changes: string[] = [];
  for (const key of keys) {
    const baseValue = base.approvals[key];
    const headValue = head.approvals[key];
    if (baseValue.mode !== headValue.mode) {
      changes.push(
        `Updated approvals.${key}.mode: \`${baseValue.mode}\` -> \`${headValue.mode}\``,
      );
    }
    if (baseValue.except_allowlisted !== headValue.except_allowlisted) {
      changes.push(
        `Updated approvals.${key}.except_allowlisted: \`${String(baseValue.except_allowlisted)}\` -> \`${String(headValue.except_allowlisted)}\``,
      );
    }
  }
  return changes;
}
