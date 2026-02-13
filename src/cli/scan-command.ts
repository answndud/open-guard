import fs from "node:fs/promises";
import path from "node:path";
import { simpleGit } from "simple-git";
import { loadTarget } from "../ingest/repo-loader.js";
import { discoverFiles } from "../ingest/file-discovery.js";
import { loadRules } from "../scanner/rule-loader.js";
import { scanTarget } from "../scanner/rule-engine.js";
import { calculateScore } from "../scoring/score-calculator.js";
import { generatePolicy } from "../policy/policy-inferrer.js";
import { buildJsonReport } from "../report/json-reporter.js";
import { renderSarifReport } from "../report/sarif-reporter.js";
import {
  renderMarkdownReport,
  type MarkdownRenderOptions,
} from "../report/markdown-reporter.js";
import { serializePolicy } from "../policy/policy-serializer.js";
import { resolveDataDir, writeRun } from "../server/store.js";
import type { ScanReport } from "../report/types.js";
import type { Finding, Rule, RuleMeta } from "../scanner/types.js";
import type { RepoContext } from "../ingest/types.js";

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
  const rulesDir = options.rulesDir ?? path.join(process.cwd(), "rules");
  const repoContext = await loadTarget(options.target);
  const { rules, meta } = await loadRules(rulesDir);
  const scanResult = options.diffBase
    ? await scanWithDiffBase(repoContext, options.diffBase, rules, meta)
    : await scanCurrent(repoContext, rules, meta);
  const findings = scanResult.findings;
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

  const output = buildOutput(report, options);

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

function buildOutput(report: ScanReport, options: ScanOptions): string {
  if (options.format === "json") {
    return JSON.stringify(report, null, 2);
  }
  if (options.format === "sarif") {
    return renderSarifReport(report);
  }
  return renderMarkdownReport(report, buildMarkdownOptions(options));
}

async function scanCurrent(
  repoContext: RepoContext,
  rules: readonly Rule[],
  meta: RuleMeta,
): Promise<{ findings: Finding[] }> {
  const findings = await scanTarget(repoContext.files, rules, meta);
  return { findings };
}

async function scanWithDiffBase(
  repoContext: RepoContext,
  diffBase: string,
  rules: readonly Rule[],
  meta: RuleMeta,
): Promise<{ findings: Finding[] }> {
  const git = simpleGit({ baseDir: repoContext.rootPath });
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error("diff-base requires a git repository target");
  }

  const status = await git.status();
  if (!status.isClean()) {
    throw new Error(
      "diff-base requires a clean working tree. Commit or stash changes first.",
    );
  }

  const headRef = await git.revparse(["HEAD"]);
  const headFindings = await scanTarget(repoContext.files, rules, meta);

  let baseFindings: Finding[] = [];
  try {
    await git.checkout(diffBase);
    const baseFiles = await discoverFiles(repoContext.rootPath);
    baseFindings = await scanTarget(baseFiles, rules, meta);
  } finally {
    await git.checkout(headRef);
  }

  const baseIds = new Set(baseFindings.map((finding) => finding.id));
  const newFindings = headFindings.filter(
    (finding) => !baseIds.has(finding.id),
  );
  return { findings: newFindings };
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
