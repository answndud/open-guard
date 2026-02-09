import fs from "node:fs/promises";
import path from "node:path";
import type { FileEntry } from "../ingest/types.js";
import { extractEvidence } from "./evidence.js";
import { createFinding } from "./finding-factory.js";
import type { Finding, Rule, RuleMeta } from "./types.js";

const FILE_TYPE_PATH_MATCHERS: Readonly<Record<string, RegExp[]>> = {
  "yaml-workflow": [/^\.github\/workflows\/.+\.ya?ml$/i],
  dockerfile: [/^dockerfile$/i, /\.dockerfile$/i],
};

export async function scanTarget(
  files: readonly FileEntry[],
  rules: readonly Rule[],
  meta: RuleMeta,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    const fileFindings = await scanFile(file, rules, meta);
    for (const finding of fileFindings) {
      if (seenIds.has(finding.id)) {
        continue;
      }
      seenIds.add(finding.id);
      findings.push(finding);
    }
  }

  findings.sort((a, b) => a.id.localeCompare(b.id));
  return findings;
}

export async function scanFile(
  file: FileEntry,
  rules: readonly Rule[],
  meta: RuleMeta,
): Promise<Finding[]> {
  const content = await fs.readFile(file.absolutePath, "utf8");
  const findings: Finding[] = [];

  for (const rule of rules) {
    if (!ruleAppliesToFile(rule, file, meta)) {
      continue;
    }

    for (const pattern of rule.patterns) {
      const regex = new RegExp(pattern.regex, "gmi");
      let match = regex.exec(content);
      while (match) {
        const matchedText = match[0] ?? "";
        const index = match.index ?? 0;
        const evidence = extractEvidence(
          file.relativePath,
          content,
          index,
          matchedText,
        );
        findings.push(createFinding(rule, evidence));
        match = regex.exec(content);
      }
    }
  }

  return findings;
}

function ruleAppliesToFile(
  rule: Rule,
  file: FileEntry,
  meta: RuleMeta,
): boolean {
  const fileTypes = resolveFileTypes(file, meta);
  for (const type of rule.scope.file_types) {
    if (fileTypes.has(type)) {
      return true;
    }
  }
  return false;
}

function resolveFileTypes(file: FileEntry, meta: RuleMeta): Set<string> {
  const types = new Set<string>();
  const relative = file.relativePath.split(path.sep).join(path.posix.sep);
  const lower = relative.toLowerCase();
  const ext = path.posix.extname(lower);
  const base = path.posix.basename(lower);

  for (const [type, extensions] of Object.entries(meta.file_type_extensions)) {
    if (extensions.some((value) => value.toLowerCase() === ext)) {
      types.add(type);
    }
  }

  for (const [type, patterns] of Object.entries(FILE_TYPE_PATH_MATCHERS)) {
    if (patterns.some((pattern) => pattern.test(lower) || pattern.test(base))) {
      types.add(type);
    }
  }

  return types;
}
