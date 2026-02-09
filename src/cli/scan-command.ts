import fs from "node:fs/promises";
import path from "node:path";
import { loadTarget } from "../ingest/repo-loader.js";
import { loadRules } from "../scanner/rule-loader.js";
import { scanTarget } from "../scanner/rule-engine.js";
import { calculateScore } from "../scoring/score-calculator.js";
import { generatePolicy } from "../policy/policy-inferrer.js";
import { buildJsonReport } from "../report/json-reporter.js";
import {
  renderMarkdownReport,
  type MarkdownRenderOptions,
} from "../report/markdown-reporter.js";
import { serializePolicy } from "../policy/policy-serializer.js";
import { resolveDataDir, writeRun } from "../server/store.js";
import type { ScanReport } from "../report/types.js";

export interface ScanOptions {
  readonly target: string;
  readonly format: "json" | "md" | "sarif";
  readonly out?: string;
  readonly diffBase?: string;
  readonly rulesDir?: string;
  readonly policyPath?: string;
  readonly threshold?: number;
  readonly saveRun?: boolean;
  readonly dataDir?: string;
  readonly show?: "summary" | "findings" | "all";
  readonly maxFindings?: number;
  readonly showEvidence?: boolean;
}

export interface ScanResult {
  readonly report: ScanReport;
  readonly output: string;
}

export async function runScanCommand(
  options: ScanOptions,
  toolVersion: string,
): Promise<ScanResult> {
  if (options.diffBase) {
    throw new Error("diff-base is not implemented yet");
  }
  if (options.format === "sarif") {
    throw new Error("sarif output is not implemented yet");
  }

  const rulesDir = options.rulesDir ?? path.join(process.cwd(), "rules");
  const repoContext = await loadTarget(options.target);
  const { rules, meta } = await loadRules(rulesDir);
  const findings = await scanTarget(repoContext.files, rules, meta);
  const score = calculateScore(findings);
  const recommendedPolicy = generatePolicy(findings, repoContext);

  if (options.policyPath) {
    await readPolicyFile(options.policyPath);
  }

  const report = buildJsonReport({
    toolVersion,
    target: {
      input: options.target,
      resolved_path: repoContext.rootPath,
      files_scanned: repoContext.files.length,
    },
    findings,
    subscores: score.subscores,
    totalScore: score.total,
    recommendedPolicy,
    scanMetadata: {
      rules_loaded: rules.length,
      rules_version: meta.rule_format_version,
    },
  });

  const output =
    options.format === "json"
      ? JSON.stringify(report, null, 2)
      : renderMarkdownReport(report, buildMarkdownOptions(options));

  if (options.out) {
    await fs.writeFile(options.out, output, "utf8");
  }

  const shouldSave = Boolean(options.saveRun) || Boolean(options.dataDir);
  if (shouldSave) {
    const dataDir = resolveDataDir(options.dataDir);
    const policyYaml = report.recommended_policy
      ? serializePolicy(report.recommended_policy)
      : undefined;
    await writeRun(dataDir, report, policyYaml);
    await ensureRunPersisted(dataDir);
  }

  return { report, output };
}

async function readPolicyFile(policyPath: string): Promise<void> {
  await fs.readFile(policyPath, "utf8");
}

function buildMarkdownOptions(options: ScanOptions): MarkdownRenderOptions {
  const show = options.show ?? "all";
  const showSummary = show === "summary" || show === "all";
  const showFindings = show === "findings" || show === "all";
  return {
    showSummary,
    showFindings,
    maxFindings: options.maxFindings,
    showEvidence: options.showEvidence ?? false,
  };
}

async function ensureRunPersisted(dataDir: string): Promise<void> {
  try {
    await fs.access(path.join(dataDir, "index.json"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Failed to persist run to ${dataDir}. Ensure the directory is writable.`,
      );
    }
    throw error;
  }
}
