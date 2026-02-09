import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { discoverFiles } from "./file-discovery.js";
import type { RepoContext } from "./types.js";

export async function loadTarget(target: string): Promise<RepoContext> {
  if (isGitUrl(target)) {
    return await loadFromGit(target);
  }

  const resolvedPath = path.resolve(target);
  let stats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stats = await fs.stat(resolvedPath);
  } catch {
    throw new Error(
      `Target path does not exist: ${resolvedPath}. Provide a valid directory.`,
    );
  }

  if (!stats.isDirectory()) {
    throw new Error(
      `Target path must be a directory: ${resolvedPath}. Provide a directory to scan.`,
    );
  }

  const files = await discoverFiles(resolvedPath);
  return {
    rootPath: resolvedPath,
    files,
    source: "local",
  };
}

function isGitUrl(target: string): boolean {
  if (target.startsWith("git@")) {
    return true;
  }

  try {
    const url = new URL(target);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function loadFromGit(repoUrl: string): Promise<RepoContext> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-"));
  const git = simpleGit();

  await git.clone(repoUrl, tempDir, ["--depth", "1"]);

  const cleanup = async (): Promise<void> => {
    await fs.rm(tempDir, { recursive: true, force: true });
  };

  registerCleanup(cleanup);

  const files = await discoverFiles(tempDir);
  return {
    rootPath: tempDir,
    files,
    source: "git",
    repoUrl,
    cleanup,
  };
}

function registerCleanup(cleanup: () => Promise<void>): void {
  const handler = (): void => {
    void cleanup();
  };

  process.once("exit", handler);
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
}
