import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import type { Rule, RuleMeta } from "./types.js";

interface RuleFile {
  readonly rules?: Rule[];
}

export interface LoadedRules {
  readonly rules: Rule[];
  readonly meta: RuleMeta;
}

export async function loadRules(rulesDir: string): Promise<LoadedRules> {
  const metaPath = path.join(rulesDir, "_meta.yaml");
  const meta = await loadMeta(metaPath);
  const entries = await fs.readdir(rulesDir, { withFileTypes: true });

  const rules: Rule[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.endsWith(".yaml") || entry.name === "_meta.yaml") {
      continue;
    }

    const filePath = path.join(rulesDir, entry.name);
    const ruleFile = await loadRuleFile(filePath);
    for (const rule of ruleFile.rules ?? []) {
      validateRule(rule, filePath);
      rules.push(rule);
    }
  }

  rules.sort((a, b) => a.id.localeCompare(b.id));
  return { rules, meta };
}

async function loadMeta(metaPath: string): Promise<RuleMeta> {
  const raw = await fs.readFile(metaPath, "utf8");
  const doc = yaml.load(raw);
  if (!doc || typeof doc !== "object") {
    throw new Error(`Invalid rules meta format: ${metaPath}`);
  }

  const meta = doc as RuleMeta;
  if (!meta.rule_format_version) {
    throw new Error(`Missing rule_format_version in ${metaPath}`);
  }

  if (
    !meta.file_type_extensions ||
    typeof meta.file_type_extensions !== "object"
  ) {
    throw new Error(`Missing file_type_extensions in ${metaPath}`);
  }

  return meta;
}

async function loadRuleFile(filePath: string): Promise<RuleFile> {
  const raw = await fs.readFile(filePath, "utf8");
  const doc = yaml.load(raw);
  if (!doc || typeof doc !== "object") {
    throw new Error(`Invalid rule file format: ${filePath}`);
  }
  return doc as RuleFile;
}

function validateRule(rule: Rule, filePath: string): void {
  if (!rule.id || !rule.title || !rule.description) {
    throw new Error(`Rule missing required fields in ${filePath}`);
  }
  if (!rule.scope || !Array.isArray(rule.scope.file_types)) {
    throw new Error(`Rule scope missing file_types in ${filePath}`);
  }
  if (!Array.isArray(rule.patterns) || rule.patterns.length === 0) {
    throw new Error(`Rule patterns missing in ${filePath}`);
  }
  for (const pattern of rule.patterns) {
    if (!pattern.regex || !pattern.description) {
      throw new Error(`Rule pattern missing regex/description in ${filePath}`);
    }
  }
}
