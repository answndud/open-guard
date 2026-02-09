import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProvenanceMetadata, Result } from "./types.js";

const execFileAsync = promisify(execFile);

export interface MetadataOptions {
  readonly version: string;
  readonly commit?: string;
  readonly builder?: string;
  readonly timestamp?: string;
}

export async function createMetadata(
  options: MetadataOptions,
): Promise<ProvenanceMetadata> {
  const commit = options.commit ?? (await resolveCommit());
  const builder = options.builder ?? `openguard-cli/${options.version}`;
  const timestamp = options.timestamp ?? new Date().toISOString();

  return {
    timestamp,
    version: options.version,
    commit,
    builder,
  };
}

export async function resolveCommit(): Promise<string> {
  const result = await tryResolveCommit();
  return result.ok ? result.value : "unknown";
}

async function tryResolveCommit(): Promise<Result<string>> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"]);
    const value = stdout.trim();
    if (!value) {
      return { ok: false, error: new Error("Empty git commit output") };
    }
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error : new Error("Git commit lookup failed"),
    };
  }
}
