import { describe, expect, it } from "vitest";
import { runAction } from "../../github-action/index.js";
import type { RunActionDeps } from "../../github-action/index.js";
import type { ScanReport } from "../../src/report/types.js";

describe("github action entrypoint", () => {
  it("fails when no token is provided", async () => {
    const failed: string[] = [];
    await runAction(
      makeDeps({
        token: undefined,
        inputs: { "github-token": "" },
        onFailed: (message) => failed.push(message),
      }),
    );
    expect(failed).toEqual(["Missing GITHUB_TOKEN"]);
  });

  it("accepts token from action input when env token is absent", async () => {
    const comments: string[] = [];
    await runAction(
      makeDeps({
        token: undefined,
        inputs: {
          "github-token": "input-token",
          comment: "true",
          "diff-only": "false",
        },
        onComment: (body) => comments.push(body),
      }),
    );

    expect(comments).toEqual(["rendered comment"]);
  });

  it("fails when event is not pull_request", async () => {
    const failed: string[] = [];
    await runAction(
      makeDeps({
        token: "token",
        payload: {},
        onFailed: (message) => failed.push(message),
      }),
    );
    expect(failed).toEqual(["This action must run on pull_request events"]);
  });

  it("posts comment and fails when score exceeds threshold", async () => {
    const failed: string[] = [];
    const comments: string[] = [];
    const checkouts: string[] = [];
    await runAction(
      makeDeps({
        token: "token",
        inputs: {
          "fail-on-score": "50",
          comment: "true",
          "diff-only": "true",
        },
        onFailed: (message) => failed.push(message),
        onComment: (body) => comments.push(body),
        onCheckout: (ref) => checkouts.push(ref),
      }),
    );

    expect(comments).toHaveLength(1);
    expect(failed).toEqual(["Risk score 75 >= 50"]);
    expect(checkouts).toEqual(["head-sha", "base-sha", "head-sha"]);
  });
});

interface DepsOptions {
  readonly token?: string;
  readonly inputs?: Record<string, string>;
  readonly payload?: {
    readonly pull_request?: {
      readonly number: number;
      readonly head?: { readonly sha?: string };
      readonly base?: { readonly sha?: string };
    };
  };
  readonly onFailed?: (message: string) => void;
  readonly onComment?: (body: string) => void;
  readonly onCheckout?: (ref: string) => void;
}

function makeDeps(options: DepsOptions): RunActionDeps {
  const inputMap = options.inputs ?? {};
  const payload = options.payload ?? {
    pull_request: {
      number: 12,
      head: { sha: "head-sha" },
      base: { sha: "base-sha" },
    },
  };
  const repo = { owner: "acme", repo: "openguard" };
  let currentRef = "head-sha";

  return {
    core: {
      getInput(name: string): string {
        return inputMap[name] ?? "";
      },
      setFailed(message: string): void {
        options.onFailed?.(message);
      },
    },
    github: {
      context: { payload, repo },
      getOctokit(): Parameters<RunActionDeps["postComment"]>[0] {
        return {} as Parameters<RunActionDeps["postComment"]>[0];
      },
    },
    createGit() {
      return {
        async checkout(ref: string): Promise<void> {
          currentRef = ref;
          options.onCheckout?.(ref);
        },
      };
    },
    async runScan() {
      const report =
        currentRef === "base-sha" ? makeReport(10) : makeReport(75);
      return { output: JSON.stringify(report), report };
    },
    renderComment() {
      return "rendered comment";
    },
    async postComment(
      _octokit: Parameters<RunActionDeps["postComment"]>[0],
      _repo: { owner: string; repo: string },
      _pullNumber: number,
      body: string,
    ) {
      options.onComment?.(body);
    },
    async loadVersion() {
      return "0.1.0";
    },
    tokenFromEnv() {
      return options.token;
    },
  };
}

function makeReport(score: number): ScanReport {
  return {
    tool: { name: "openguard", version: "0.1.0" },
    target: { input: "." },
    summary: {
      total_score: score,
      subscores: { shell: score, network: 0, filesystem: 0, credentials: 0 },
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      risk_level: score >= 80 ? "critical" : "high",
    },
    findings: [],
  };
}
