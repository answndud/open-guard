import { describe, expect, it } from "vitest";
import {
  createMetadata,
  resolveCommit,
  tryResolveCommit,
  type MetadataDeps,
} from "../../src/trust/metadata.js";

describe("trust metadata", () => {
  it("keeps explicit metadata values", async () => {
    const metadata = await createMetadata({
      version: "0.1.0",
      commit: "abc123",
      builder: "custom-builder",
      timestamp: "2026-02-09T00:00:00Z",
    });

    expect(metadata).toEqual({
      version: "0.1.0",
      commit: "abc123",
      builder: "custom-builder",
      timestamp: "2026-02-09T00:00:00Z",
    });
  });

  it("uses deps defaults for commit and timestamp", async () => {
    const deps: MetadataDeps = {
      getCommit: async () => ({ ok: true, value: "resolved-commit" }),
      nowIso: () => "2026-02-10T10:00:00Z",
    };

    const metadata = await createMetadata({ version: "0.2.0" }, deps);
    expect(metadata).toEqual({
      version: "0.2.0",
      commit: "resolved-commit",
      builder: "openguard-cli/0.2.0",
      timestamp: "2026-02-10T10:00:00Z",
    });
  });

  it("falls back to unknown commit when lookup fails", async () => {
    const deps: MetadataDeps = {
      getCommit: async () => ({ ok: false, error: new Error("no git") }),
      nowIso: () => "2026-02-10T10:00:00Z",
    };

    const commit = await resolveCommit(deps);
    expect(commit).toBe("unknown");
  });

  it("resolves commit from git output", async () => {
    const result = await tryResolveCommit(async () => ({
      stdout: "abc123\n",
    }));
    expect(result).toEqual({ ok: true, value: "abc123" });
  });

  it("returns error result on empty git output", async () => {
    const result = await tryResolveCommit(async () => ({ stdout: "\n" }));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain("Empty git commit output");
  });

  it("returns error result when git command fails", async () => {
    const result = await tryResolveCommit(async () => {
      throw new Error("git missing");
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain("git missing");
  });
});
