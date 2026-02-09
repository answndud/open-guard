import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { simpleGit } from "simple-git";
import { runScanCommand } from "../src/cli/scan-command.js";
import { renderPrComment } from "../src/report/pr-comment-renderer.js";
import { postOrUpdateComment } from "./pr-commenter.js";
import type { ScanReport } from "../src/report/types.js";

async function run(): Promise<void> {
  const token = process.env.GITHUB_TOKEN ?? core.getInput("github-token");
  if (!token) {
    core.setFailed("Missing GITHUB_TOKEN");
    return;
  }

  const failOnScore = Number(core.getInput("fail-on-score") || "80");
  const commentEnabled = core.getInput("comment").toLowerCase() !== "false";
  const diffOnly = core.getInput("diff-only").toLowerCase() !== "false";
  const rulesDir = core.getInput("rules") || undefined;
  const policyPath = core.getInput("policy") || undefined;

  const payload = github.context.payload;
  const pullRequest = payload.pull_request;
  if (!pullRequest) {
    core.setFailed("This action must run on pull_request events");
    return;
  }

  const headSha = pullRequest.head?.sha;
  const baseSha = pullRequest.base?.sha;
  if (!headSha || !baseSha) {
    core.setFailed("Missing head/base SHA in pull request context");
    return;
  }

  const toolVersion = await loadVersion();
  const git = simpleGit();
  const headReport = await scanAtRef(git, headSha, {
    rulesDir,
    policyPath,
    toolVersion,
  });

  let baseReport: ScanReport | undefined;
  if (diffOnly) {
    baseReport = await scanAtRef(git, baseSha, {
      rulesDir,
      policyPath,
      toolVersion,
    });
  }

  await git.checkout(headSha);

  if (commentEnabled) {
    const octokit = github.getOctokit(token);
    const body = renderPrComment({ head: headReport, base: baseReport });
    await postOrUpdateComment(
      octokit,
      github.context.repo,
      pullRequest.number,
      body,
    );
  }

  if (headReport.summary.total_score >= failOnScore) {
    core.setFailed(
      `Risk score ${headReport.summary.total_score} >= ${failOnScore}`,
    );
  }
}

async function scanAtRef(
  git: ReturnType<typeof simpleGit>,
  ref: string,
  options: {
    rulesDir?: string;
    policyPath?: string;
    toolVersion: string;
  },
) {
  await git.checkout(ref);
  const result = await runScanCommand(
    {
      target: ".",
      format: "json",
      rulesDir: options.rulesDir,
      policyPath: options.policyPath,
    },
    options.toolVersion,
  );
  return result.report;
}

async function loadVersion(): Promise<string> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const rootPath = path.resolve(dir, "..", "..");
  const raw = await fs.readFile(path.join(rootPath, "package.json"), "utf8");
  const json = JSON.parse(raw) as { version?: string };
  return json.version ?? "0.0.0";
}

void run();
