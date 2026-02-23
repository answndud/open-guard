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

interface ActionCore {
  getInput(name: string): string;
  setFailed(message: string): void;
}

interface ActionGithub {
  readonly context: {
    readonly payload: {
      readonly pull_request?: {
        readonly number: number;
        readonly head?: { readonly sha?: string };
        readonly base?: { readonly sha?: string };
      };
    };
    readonly repo: { owner: string; repo: string };
  };
  getOctokit(token: string): Parameters<typeof postOrUpdateComment>[0];
}

interface GitClient {
  checkout(ref: string): Promise<unknown>;
}

export interface RunActionDeps {
  readonly core: ActionCore;
  readonly github: ActionGithub;
  readonly createGit: () => GitClient;
  readonly runScan: typeof runScanCommand;
  readonly renderComment: typeof renderPrComment;
  readonly postComment: typeof postOrUpdateComment;
  readonly loadVersion: () => Promise<string>;
  readonly tokenFromEnv: () => string | undefined;
}

const DEFAULT_DEPS: RunActionDeps = {
  core,
  github,
  createGit: () => simpleGit(),
  runScan: runScanCommand,
  renderComment: renderPrComment,
  postComment: postOrUpdateComment,
  loadVersion,
  tokenFromEnv: () => process.env.GITHUB_TOKEN,
};

export async function runAction(
  deps: RunActionDeps = DEFAULT_DEPS,
): Promise<void> {
  const token = deps.tokenFromEnv() ?? deps.core.getInput("github-token");
  if (!token) {
    deps.core.setFailed("Missing GITHUB_TOKEN");
    return;
  }

  const failOnScore = Number(deps.core.getInput("fail-on-score") || "80");
  const commentEnabled =
    deps.core.getInput("comment").toLowerCase() !== "false";
  const diffOnly = deps.core.getInput("diff-only").toLowerCase() !== "false";
  const rulesDir = deps.core.getInput("rules") || undefined;
  const policyPath = deps.core.getInput("policy") || undefined;

  const payload = deps.github.context.payload;
  const pullRequest = payload.pull_request;
  if (!pullRequest) {
    deps.core.setFailed("This action must run on pull_request events");
    return;
  }

  const headSha = pullRequest.head?.sha;
  const baseSha = pullRequest.base?.sha;
  if (!headSha || !baseSha) {
    deps.core.setFailed("Missing head/base SHA in pull request context");
    return;
  }

  const toolVersion = await deps.loadVersion();
  const git = deps.createGit();
  const headReport = await scanAtRef(git, headSha, {
    rulesDir,
    policyPath,
    toolVersion,
    runScan: deps.runScan,
  });

  let baseReport: ScanReport | undefined;
  if (diffOnly) {
    baseReport = await scanAtRef(git, baseSha, {
      rulesDir,
      policyPath,
      toolVersion,
      runScan: deps.runScan,
    });
  }

  await git.checkout(headSha);

  if (commentEnabled) {
    const octokit = deps.github.getOctokit(token);
    const body = deps.renderComment({ head: headReport, base: baseReport });
    await deps.postComment(
      octokit,
      deps.github.context.repo,
      pullRequest.number,
      body,
    );
  }

  if (headReport.summary.total_score >= failOnScore) {
    deps.core.setFailed(
      `Risk score ${headReport.summary.total_score} >= ${failOnScore}`,
    );
  }
}

async function scanAtRef(
  git: GitClient,
  ref: string,
  options: {
    rulesDir?: string;
    policyPath?: string;
    toolVersion: string;
    runScan: typeof runScanCommand;
  },
) {
  await git.checkout(ref);
  const result = await options.runScan(
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

if (process.env.VITEST !== "true") {
  void runAction();
}
