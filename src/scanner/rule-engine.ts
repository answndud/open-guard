import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import type { FileEntry } from "../ingest/types.js";
import { extractEvidence } from "./evidence.js";
import { createFinding } from "./finding-factory.js";
import type { Finding, Rule, RuleMeta } from "./types.js";

const FILE_TYPE_PATH_MATCHERS: Readonly<Record<string, RegExp[]>> = {
  "yaml-workflow": [/^\.github\/workflows\/.+\.ya?ml$/i],
  dockerfile: [/^dockerfile$/i, /\.dockerfile$/i],
  "mcp-config": [
    /^mcp(\.|-|_)?(config|manifest)?\.(json|jsonc|ya?ml)$/i,
    /^\.mcp\.(json|jsonc|ya?ml)$/i,
    /^opencode\.jsonc?$/i,
    /(^|\/)mcp\/(.+)\.(json|jsonc|ya?ml)$/i,
  ],
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
  const isWorkflowFile = isGitHubWorkflowFile(file.relativePath);

  for (const rule of rules) {
    if (!ruleAppliesToFile(rule, file, meta)) {
      continue;
    }

    if (isWorkflowFile && isGhaRule(rule)) {
      const structuredFindings = scanGhaRuleStructured(
        rule,
        file.relativePath,
        content,
      );
      if (structuredFindings !== null) {
        findings.push(...structuredFindings);
        continue;
      }
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

function isGitHubWorkflowFile(relativePath: string): boolean {
  return /^\.github\/workflows\/.+\.ya?ml$/i.test(
    relativePath.split(path.sep).join(path.posix.sep),
  );
}

function isGhaRule(rule: Rule): boolean {
  return rule.id.startsWith("OG-GHA-");
}

function scanGhaRuleStructured(
  rule: Rule,
  relativePath: string,
  content: string,
): Finding[] | null {
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }

  const matches = findGhaMatches(rule.id, parsed);
  const findings: Finding[] = [];
  for (const matchedText of matches) {
    const index = content.indexOf(matchedText);
    if (index < 0) {
      continue;
    }
    const evidence = extractEvidence(relativePath, content, index, matchedText);
    findings.push(createFinding(rule, evidence));
  }
  return findings;
}

function findGhaMatches(
  ruleId: string,
  doc: Record<string, unknown>,
): string[] {
  switch (ruleId) {
    case "OG-GHA-001":
      return findBroadPermissions(doc);
    case "OG-GHA-002":
      return findUnpinnedUses(doc);
    case "OG-GHA-003":
      return findDangerousTriggers(doc);
    case "OG-GHA-004":
      return findExpressionInjectionRuns(doc);
    case "OG-GHA-005":
      return findSelfHostedRunners(doc);
    default:
      return [];
  }
}

function findBroadPermissions(doc: Record<string, unknown>): string[] {
  const matches: string[] = [];
  const workflowPermissions = doc.permissions;
  if (workflowPermissions === "write-all") {
    matches.push("permissions: write-all");
  }

  for (const [, job] of getJobs(doc)) {
    if (!isRecord(job)) {
      continue;
    }
    const permissions = job.permissions;
    if (permissions === "write-all") {
      matches.push("permissions: write-all");
      continue;
    }
    if (isRecord(permissions)) {
      const contents = permissions.contents;
      const pullRequests = permissions["pull-requests"];
      if (contents === "write" && pullRequests === "write") {
        matches.push("contents: write");
        matches.push("pull-requests: write");
      }
    }
  }

  return matches;
}

function findUnpinnedUses(doc: Record<string, unknown>): string[] {
  const matches: string[] = [];
  for (const [, job] of getJobs(doc)) {
    if (!isRecord(job)) {
      continue;
    }

    if (typeof job.uses === "string") {
      if (/@(main|master|develop|latest)$/i.test(job.uses)) {
        matches.push(`uses: ${job.uses}`);
      } else if (/@v\d+$/i.test(job.uses)) {
        matches.push(`uses: ${job.uses}`);
      }
    }

    const steps = job.steps;
    if (!Array.isArray(steps)) {
      continue;
    }
    for (const step of steps) {
      if (!isRecord(step) || typeof step.uses !== "string") {
        continue;
      }
      if (/@(main|master|develop|latest)$/i.test(step.uses)) {
        matches.push(`uses: ${step.uses}`);
        continue;
      }
      if (/@v\d+$/i.test(step.uses)) {
        matches.push(`uses: ${step.uses}`);
      }
    }
  }
  return matches;
}

function findDangerousTriggers(doc: Record<string, unknown>): string[] {
  const matches: string[] = [];
  const on = doc.on;
  if (typeof on === "string") {
    if (on === "pull_request_target" || on === "issue_comment") {
      matches.push(`on: ${on}`);
    }
    return matches;
  }

  if (Array.isArray(on)) {
    for (const item of on) {
      if (item === "pull_request_target" || item === "issue_comment") {
        matches.push(`on: ${String(item)}`);
      }
    }
    return matches;
  }

  if (!isRecord(on)) {
    return matches;
  }
  if (Object.hasOwn(on, "pull_request_target")) {
    matches.push("pull_request_target");
  }
  if (Object.hasOwn(on, "issue_comment")) {
    matches.push("issue_comment");
  }
  return matches;
}

function findExpressionInjectionRuns(doc: Record<string, unknown>): string[] {
  const matches: string[] = [];
  const riskyExpressions = [
    "${{ github.event.issue.title }}",
    "${{ github.event.issue.body }}",
    "${{ github.event.pull_request.title }}",
    "${{ github.event.pull_request.body }}",
    "${{ github.event.comment.body }}",
    "${{ github.head_ref }}",
  ];

  for (const [, job] of getJobs(doc)) {
    if (!isRecord(job)) {
      continue;
    }

    if (typeof job.uses === "string" && isRecord(job.with)) {
      for (const value of Object.values(job.with)) {
        if (typeof value !== "string") {
          continue;
        }
        for (const expression of riskyExpressions) {
          if (value.includes(expression)) {
            matches.push(expression);
          }
        }
      }
    }

    const steps = job.steps;
    if (!Array.isArray(steps)) {
      continue;
    }
    steps.forEach((step) => {
      if (!isRecord(step) || typeof step.run !== "string") {
        return;
      }
      for (const expression of riskyExpressions) {
        if (step.run.includes(expression)) {
          matches.push(expression);
        }
      }
    });
  }
  return matches;
}

function findSelfHostedRunners(doc: Record<string, unknown>): string[] {
  const matches: string[] = [];
  for (const [, job] of getJobs(doc)) {
    if (!isRecord(job)) {
      continue;
    }
    const runsOn = job["runs-on"];
    if (typeof runsOn === "string" && runsOn.toLowerCase() === "self-hosted") {
      matches.push("self-hosted");
      continue;
    }
    if (
      Array.isArray(runsOn) &&
      runsOn.some(
        (value) =>
          typeof value === "string" && value.toLowerCase() === "self-hosted",
      )
    ) {
      matches.push("self-hosted");
    }
  }
  return matches;
}

function getJobs(doc: Record<string, unknown>): Array<[string, unknown]> {
  const jobs = doc.jobs;
  if (!isRecord(jobs)) {
    return [];
  }
  return Object.entries(jobs);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
