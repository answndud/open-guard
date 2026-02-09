import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { loadTarget } from "../ingest/repo-loader.js";
import { loadRules } from "../scanner/rule-loader.js";
import { scanTarget } from "../scanner/rule-engine.js";
import { calculateScore } from "../scoring/score-calculator.js";
import { generatePolicy } from "../policy/policy-inferrer.js";
import { mergePolicy } from "../policy/policy-merge.js";
import { serializePolicy } from "../policy/policy-serializer.js";
import { validatePolicy } from "../policy/policy-validator.js";
import { buildJsonReport } from "../report/json-reporter.js";
import { resolveDataDir, writeRun } from "../server/store.js";

export interface PolicyGenerateOptions {
  readonly target: string;
  readonly out?: string;
  readonly merge?: string;
  readonly rulesDir?: string;
  readonly saveRun?: boolean;
  readonly dataDir?: string;
  readonly toolVersion?: string;
}

export async function runPolicyGenerate(
  options: PolicyGenerateOptions,
): Promise<string> {
  const rulesDir = options.rulesDir ?? path.join(process.cwd(), "rules");
  const repoContext = await loadTarget(options.target);
  const { rules, meta } = await loadRules(rulesDir);
  const findings = await scanTarget(repoContext.files, rules, meta);
  const generatedPolicy = generatePolicy(findings, repoContext);
  const validatedGenerated = await validatePolicy(generatedPolicy);
  const policy = options.merge
    ? mergePolicy(await loadPolicyFromFile(options.merge), validatedGenerated)
    : validatedGenerated;
  const output = serializePolicy(await validatePolicy(policy));

  if (options.out) {
    await fs.writeFile(options.out, output, "utf8");
  }

  const shouldSave = Boolean(options.saveRun) || Boolean(options.dataDir);
  if (shouldSave) {
    const score = calculateScore(findings);
    const report = buildJsonReport({
      toolVersion: options.toolVersion ?? "0.0.0",
      target: {
        input: options.target,
        resolved_path: repoContext.rootPath,
        files_scanned: repoContext.files.length,
      },
      findings,
      subscores: score.subscores,
      totalScore: score.total,
      recommendedPolicy: policy,
      scanMetadata: {
        rules_loaded: rules.length,
        rules_version: meta.rule_format_version,
      },
    });
    const dataDir = resolveDataDir(options.dataDir);
    await writeRun(dataDir, report, output);
    await ensureRunPersisted(dataDir);
  }

  return output;
}

async function loadPolicyFromFile(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const doc = yaml.load(raw);
  return await validatePolicy(doc);
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
