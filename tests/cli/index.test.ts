import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeShow,
  parseFormat,
  parseOptionalNumberOption,
  parseRequiredNumberOption,
  shouldLaunchInteractive,
} from "../../src/cli/index.js";

describe("cli entrypoint helpers", () => {
  it("parses supported output formats", () => {
    expect(parseFormat("md")).toBe("md");
    expect(parseFormat("json")).toBe("json");
    expect(parseFormat("sarif")).toBe("sarif");
    expect(() => parseFormat("xml")).toThrow("Unsupported format");
  });

  it("validates optional numeric options", () => {
    expect(
      parseOptionalNumberOption(undefined, { name: "threshold", min: 0 }),
    ).toBeUndefined();
    expect(
      parseOptionalNumberOption("80", { name: "threshold", min: 0, max: 100 }),
    ).toBe(80);
    expect(
      parseOptionalNumberOption("10", {
        name: "max-findings",
        min: 1,
        integer: true,
      }),
    ).toBe(10);
    expect(() =>
      parseOptionalNumberOption("1.5", {
        name: "max-findings",
        min: 1,
        integer: true,
      }),
    ).toThrow("must be an integer");
    expect(() =>
      parseOptionalNumberOption("101", {
        name: "threshold",
        min: 0,
        max: 100,
      }),
    ).toThrow("must be <= 100");
  });

  it("validates required numeric options", () => {
    expect(
      parseRequiredNumberOption("8787", {
        name: "port",
        min: 1,
        max: 65535,
        integer: true,
      }),
    ).toBe(8787);
    expect(() =>
      parseRequiredNumberOption("0", {
        name: "port",
        min: 1,
        max: 65535,
        integer: true,
      }),
    ).toThrow("must be >= 1");
  });

  it("normalizes show option", () => {
    expect(normalizeShow("summary")).toBe("summary");
    expect(normalizeShow("findings")).toBe("findings");
    expect(normalizeShow("all")).toBe("all");
    expect(normalizeShow("other")).toBe("all");
  });

  it("launches interactive menu only when allowed", () => {
    const restore = setTty(true, true);
    const prevCi = process.env.CI;
    const prevActions = process.env.GITHUB_ACTIONS;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;

    try {
      expect(shouldLaunchInteractive(["node", "openguard"])).toBe(true);
      expect(shouldLaunchInteractive(["node", "openguard", "--help"])).toBe(
        false,
      );
      expect(
        shouldLaunchInteractive(["node", "openguard", "--no-interactive"]),
      ).toBe(false);

      process.env.CI = "1";
      expect(shouldLaunchInteractive(["node", "openguard"])).toBe(false);
    } finally {
      restore();
      restoreEnv("CI", prevCi);
      restoreEnv("GITHUB_ACTIONS", prevActions);
    }
  });
});

afterEach(() => {
  delete process.env.CI;
  delete process.env.GITHUB_ACTIONS;
});

function setTty(stdinTty: boolean, stdoutTty: boolean): () => void {
  const stdinDesc = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const stdoutDesc = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: stdinTty,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: stdoutTty,
  });
  return () => {
    if (stdinDesc) {
      Object.defineProperty(process.stdin, "isTTY", stdinDesc);
    }
    if (stdoutDesc) {
      Object.defineProperty(process.stdout, "isTTY", stdoutDesc);
    }
  };
}

function restoreEnv(name: "CI" | "GITHUB_ACTIONS", value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
