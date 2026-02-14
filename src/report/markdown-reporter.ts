import type { ScanReport } from "./types.js";

export interface MarkdownRenderOptions {
  readonly showSummary?: boolean;
  readonly showFindings?: boolean;
  readonly maxFindings?: number;
  readonly showEvidence?: boolean;
  readonly snippetWidth?: number;
}

export function renderMarkdownReport(
  report: ScanReport,
  options: MarkdownRenderOptions = {},
): string {
  const showSummary = options.showSummary ?? true;
  const showFindings = options.showFindings ?? true;
  const maxFindings = options.maxFindings;
  const showEvidence = options.showEvidence ?? false;
  const snippetWidth = options.snippetWidth ?? 80;
  const lines: string[] = [];
  if (showSummary) {
    lines.push(renderHeaderBlock(report));
    lines.push("");
    lines.push(
      renderAsciiTable(
        [
          [
            "Shell",
            String(report.summary.subscores.shell),
            String(countFindings(report, ["shell", "obfuscation", "gha"])),
          ],
          [
            "Network",
            String(report.summary.subscores.network),
            String(countFindings(report, ["network", "supply-chain"])),
          ],
          [
            "Filesystem",
            String(report.summary.subscores.filesystem),
            String(countFindings(report, ["filesystem", "macos", "windows"])),
          ],
          [
            "Credentials",
            String(report.summary.subscores.credentials),
            String(countFindings(report, ["credentials"])),
          ],
        ],
        ["Category", "Score", "Findings"],
      ),
    );

    const socialSummary = buildSocialEngineeringSummary(report);
    if (socialSummary) {
      lines.push("");
      lines.push("### Social Engineering Signals");
      lines.push("");
      lines.push(socialSummary);
    }
  }

  const findings = applyFindingLimit(report.findings, maxFindings);
  const findingsTotal = report.findings.length;
  if (showFindings && findingsTotal === 0) {
    lines.push("");
    lines.push("No findings detected.");
    return lines.join("\n");
  }
  if (!showFindings) {
    return lines.join("\n");
  }

  lines.push("");
  lines.push("### Findings");
  lines.push("");
  if (findings.length === 0) {
    lines.push("No findings detected.");
    return lines.join("\n");
  }
  lines.push(
    renderAsciiTable(
      findings.map((finding) => [
        finding.id,
        finding.severity,
        finding.rule_id,
        truncateText(finding.evidence.path, 32),
        String(finding.evidence.start_line),
        truncateText(finding.title, snippetWidth),
      ]),
      ["ID", "Severity", "Rule", "File", "Line", "Title"],
    ),
  );

  if (findingsTotal > findings.length) {
    lines.push("");
    lines.push(
      `Showing ${findings.length} of ${findingsTotal} findings. Use --max-findings to adjust.`,
    );
  }

  if (showEvidence) {
    lines.push("");
    lines.push("### Evidence");
    lines.push("");
    for (const finding of findings) {
      lines.push(
        `- ${finding.rule_id} (${finding.evidence.path}:${finding.evidence.start_line})`,
      );
      lines.push("```text");
      lines.push(finding.evidence.snippet);
      lines.push("```");
    }
  }

  return lines.join("\n");
}

function renderHeaderBlock(report: ScanReport): string {
  const title = "OpenGuard Scan Report";
  const scoreLine = `Risk Score: ${report.summary.total_score}/100`;
  const riskLine = `Risk Level: ${formatRiskLevel(report.summary.risk_level)}`;
  const targetLine = `Target: ${report.target.input}`;
  const lines = [title, scoreLine, riskLine, targetLine];
  return renderAsciiBox(lines);
}

function renderAsciiBox(content: readonly string[]): string {
  const width = Math.max(...content.map((line) => line.length));
  const top = `+${"-".repeat(width + 2)}+`;
  const body = content.map((line) => {
    const padding = " ".repeat(width - line.length);
    return `| ${line}${padding} |`;
  });
  const bottom = top;
  return [top, ...body, bottom].join("\n");
}

function renderAsciiTable(
  rows: readonly string[][],
  headers: readonly string[],
): string {
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...rows.map((row) => (row[index] ? row[index].length : 0)),
    ),
  );
  const border = `+${widths.map((w) => "-".repeat(w + 2)).join("+")}+`;
  const headerLine = `| ${headers
    .map((header, index) => header.padEnd(widths[index] ?? 0))
    .join(" | ")} |`;
  const body = rows.map(
    (row) =>
      `| ${row
        .map((cell, index) => cell.padEnd(widths[index] ?? 0))
        .join(" | ")} |`,
  );
  return [border, headerLine, border, ...body, border].join("\n");
}

function countFindings(
  report: ScanReport,
  categories: readonly string[],
): number {
  return report.findings.filter((finding) =>
    categories.includes(finding.category),
  ).length;
}

function formatRiskLevel(level: string): string {
  switch (level) {
    case "very-high":
      return "Very High";
    default:
      return level.charAt(0).toUpperCase() + level.slice(1);
  }
}

function truncateText(input: string, max: number): string {
  if (input.length <= max) {
    return input;
  }
  return `${input.slice(0, Math.max(0, max - 3))}...`;
}

function applyFindingLimit<T>(items: readonly T[], limit?: number): T[] {
  if (!limit || limit <= 0) {
    return [...items];
  }
  return items.slice(0, limit);
}

function buildSocialEngineeringSummary(report: ScanReport): string | null {
  const clipboard = report.findings.filter(
    (finding) => finding.rule_id === "OG-MD-001",
  ).length;
  const verificationBypass = report.findings.filter(
    (finding) => finding.rule_id === "OG-MD-002",
  ).length;

  if (clipboard === 0 && verificationBypass === 0) {
    return null;
  }

  const rows = [
    ["Clipboard execution instructions", String(clipboard)],
    ["Verification bypass instructions", String(verificationBypass)],
  ];
  return renderAsciiTable(rows, ["Signal", "Count"]);
}
