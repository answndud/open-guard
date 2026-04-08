import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

interface FileEntry {
  readonly absolutePath: string;
  readonly relativePath: string;
}

export async function hashArtifact(artifactPath: string): Promise<string> {
  const stats = await fs.stat(artifactPath);
  const hash = crypto.createHash("sha256");

  if (stats.isFile()) {
    const data = await fs.readFile(artifactPath);
    hash.update(data);
    return `sha256:${hash.digest("hex")}`;
  }

  if (!stats.isDirectory()) {
    throw new Error("Artifact must be a file or directory");
  }

  const files = await listFiles(artifactPath, artifactPath, new Set<string>());
  for (const file of files) {
    hash.update(`file:${file.relativePath}\n`);
    const data = await fs.readFile(file.absolutePath);
    hash.update(data);
    hash.update("\n");
  }

  return `sha256:${hash.digest("hex")}`;
}

async function listFiles(
  root: string,
  current: string,
  visitedDirs: Set<string>,
): Promise<FileEntry[]> {
  const realCurrent = await fs.realpath(current);
  if (visitedDirs.has(realCurrent)) {
    return [];
  }
  visitedDirs.add(realCurrent);

  const entries = await fs.readdir(current, { withFileTypes: true });
  const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
  const results: FileEntry[] = [];

  for (const entry of sorted) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = path
      .relative(root, absolutePath)
      .split(path.sep)
      .join(path.posix.sep);

    if (entry.isSymbolicLink()) {
      const resolved = await safeRealpath(absolutePath);
      if (!resolved) {
        continue;
      }
      if (!isWithinRoot(root, resolved)) {
        continue;
      }
      const stats = await fs.stat(resolved);
      if (stats.isDirectory()) {
        const nested = await listFiles(root, resolved, visitedDirs);
        results.push(...nested);
      } else if (stats.isFile()) {
        results.push({ absolutePath: resolved, relativePath });
      }
      continue;
    }

    if (entry.isDirectory()) {
      const nested = await listFiles(root, absolutePath, visitedDirs);
      results.push(...nested);
      continue;
    }

    if (entry.isFile()) {
      results.push({ absolutePath, relativePath });
    }
  }

  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function safeRealpath(targetPath: string): Promise<string | null> {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return null;
  }
}
