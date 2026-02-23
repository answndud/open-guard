import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProvenanceMetadata, Result } from "./types.js";

const execFileAsync = promisify(execFile);

type GitExec = (
  command: string,
  args: readonly string[],
) => Promise<{ readonly stdout: string }>;

const DEFAULT_GIT_EXEC: GitExec = async (command, args) => {
  const { stdout } = await execFileAsync(command, [...args]);
  return { stdout: String(stdout) };
};

export interface MetadataDeps {
  readonly getCommit: () => Promise<Result<string>>;
  readonly nowIso: () => string;
}

const DEFAULT_DEPS: MetadataDeps = {
  getCommit: () => tryResolveCommit(),
  nowIso: () => new Date().toISOString(),
};

export interface MetadataOptions {
  readonly version: string;
  readonly commit?: string;
  readonly builder?: string;
  readonly timestamp?: string;
}

export async function createMetadata(
  options: MetadataOptions,
  deps: MetadataDeps = DEFAULT_DEPS,
): Promise<ProvenanceMetadata> {
  const commit = options.commit ?? (await resolveCommit(deps));
  const builder = options.builder ?? `openguard-cli/${options.version}`;
  const timestamp = options.timestamp ?? deps.nowIso();

  return {
    timestamp,
    version: options.version,
    commit,
    builder,
  };
}

export async function resolveCommit(
  deps: MetadataDeps = DEFAULT_DEPS,
): Promise<string> {
  const result = await deps.getCommit();
  return result.ok ? result.value : "unknown";
}

export async function tryResolveCommit(
  runGit: GitExec = DEFAULT_GIT_EXEC,
): Promise<Result<string>> {
  try {
    const { stdout } = await runGit("git", ["rev-parse", "HEAD"]);
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
