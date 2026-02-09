import fs from "node:fs/promises";
import path from "node:path";
import { classifyFile } from "./file-classifier.js";
import { FileCategory } from "./types.js";
import type { FileDiscoveryOptions, FileEntry } from "./types.js";

const DEFAULT_MAX_FILE_SIZE_BYTES = 1_000_000;
const DEFAULT_IGNORE_FILES = [".gitignore", ".openguardignore"] as const;
const DEFAULT_IGNORE_PATTERNS = [".git/"] as const;

interface IgnorePattern {
  readonly raw: string;
  readonly negated: boolean;
  readonly anchored: boolean;
  readonly directoryOnly: boolean;
  readonly hasSlash: boolean;
  readonly pattern: string;
  readonly regex: RegExp | null;
}

export async function discoverFiles(
  rootPath: string,
  options: FileDiscoveryOptions = {},
): Promise<FileEntry[]> {
  const realRoot = await fs.realpath(rootPath);
  const maxFileSize = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  const ignoreFileNames = options.ignoreFileNames ?? DEFAULT_IGNORE_FILES;
  const ignorePatterns = await loadIgnorePatterns(realRoot, ignoreFileNames);
  const entries: FileEntry[] = [];
  const visitedDirs = new Set<string>();

  await walkDirectory(realRoot, realRoot, entries, {
    ignorePatterns,
    maxFileSize,
    visitedDirs,
  });

  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return entries;
}

interface WalkContext {
  readonly ignorePatterns: readonly IgnorePattern[];
  readonly maxFileSize: number;
  readonly visitedDirs: Set<string>;
}

async function walkDirectory(
  rootPath: string,
  currentPath: string,
  entries: FileEntry[],
  context: WalkContext,
): Promise<void> {
  const realCurrent = await fs.realpath(currentPath);
  if (context.visitedDirs.has(realCurrent)) {
    return;
  }
  context.visitedDirs.add(realCurrent);

  let dirEntries = await fs.readdir(currentPath, { withFileTypes: true });
  dirEntries = dirEntries.sort((a, b) => a.name.localeCompare(b.name));

  for (const dirent of dirEntries) {
    const absolutePath = path.join(currentPath, dirent.name);
    const relativePath = toRelativePosix(rootPath, absolutePath);
    if (
      shouldIgnore(relativePath, context.ignorePatterns, dirent.isDirectory())
    ) {
      continue;
    }

    if (dirent.isSymbolicLink()) {
      const resolved = await safeRealpath(absolutePath);
      if (!resolved) {
        continue;
      }

      if (!isWithinRoot(rootPath, resolved)) {
        continue;
      }

      const stats = await fs.stat(resolved);
      if (stats.isDirectory()) {
        await walkDirectory(rootPath, resolved, entries, context);
      } else if (stats.isFile()) {
        await addFileEntry(rootPath, resolved, stats.size, entries, context);
      }
      continue;
    }

    if (dirent.isDirectory()) {
      await walkDirectory(rootPath, absolutePath, entries, context);
      continue;
    }

    if (dirent.isFile()) {
      const stats = await fs.stat(absolutePath);
      await addFileEntry(rootPath, absolutePath, stats.size, entries, context);
    }
  }
}

async function addFileEntry(
  rootPath: string,
  absolutePath: string,
  sizeBytes: number,
  entries: FileEntry[],
  context: WalkContext,
): Promise<void> {
  if (sizeBytes > context.maxFileSize) {
    return;
  }

  const relativePath = toRelativePosix(rootPath, absolutePath);
  if (shouldIgnore(relativePath, context.ignorePatterns, false)) {
    return;
  }

  const category = classifyFile(relativePath);
  entries.push({
    absolutePath,
    relativePath,
    sizeBytes,
    category,
  });
}

async function loadIgnorePatterns(
  rootPath: string,
  ignoreFileNames: readonly string[],
): Promise<IgnorePattern[]> {
  const patterns: IgnorePattern[] = [];

  for (const pattern of DEFAULT_IGNORE_PATTERNS) {
    const parsed = parseIgnorePattern(pattern);
    if (parsed) {
      patterns.push(parsed);
    }
  }

  for (const ignoreFileName of ignoreFileNames) {
    const filePath = path.join(rootPath, ignoreFileName);
    let contents: string | null = null;
    try {
      contents = await fs.readFile(filePath, "utf8");
    } catch {
      contents = null;
    }

    if (!contents) {
      continue;
    }

    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      const parsed = parseIgnorePattern(line);
      if (parsed) {
        patterns.push(parsed);
      }
    }
  }

  return patterns;
}

function parseIgnorePattern(raw: string): IgnorePattern | null {
  if (!raw || raw === "/") {
    return null;
  }

  const negated = raw.startsWith("!");
  const trimmed = negated ? raw.slice(1) : raw;
  if (!trimmed) {
    return null;
  }

  const anchored = trimmed.startsWith("/");
  const normalized = anchored ? trimmed.slice(1) : trimmed;
  const directoryOnly = normalized.endsWith("/");
  const pattern = directoryOnly ? normalized.slice(0, -1) : normalized;
  const hasSlash = pattern.includes("/");

  const regex = buildPatternRegex(pattern, {
    anchored,
    directoryOnly,
  });

  return {
    raw,
    negated,
    anchored,
    directoryOnly,
    hasSlash,
    pattern,
    regex,
  };
}

function buildPatternRegex(
  pattern: string,
  options: { anchored: boolean; directoryOnly: boolean },
): RegExp | null {
  if (!pattern) {
    return null;
  }

  const escaped = globToRegexSource(pattern);
  if (!escaped) {
    return null;
  }

  const prefix = options.anchored ? "^" : "(?:^|.*/)";
  const cleanedPrefix = prefix;
  const suffix = options.directoryOnly ? "(?:/.*)?$" : "$";
  return new RegExp(`${cleanedPrefix}${escaped}${suffix}`);
}

function globToRegexSource(pattern: string): string {
  let regex = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (!char) {
      continue;
    }
    if (char === "*") {
      const next = pattern[i + 1];
      if (next === "*") {
        regex += ".*";
        i += 1;
      } else {
        regex += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    regex += escapeRegex(char);
  }
  return regex;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldIgnore(
  relativePath: string,
  patterns: readonly IgnorePattern[],
  isDirectory: boolean,
): boolean {
  let ignored = false;
  for (const pattern of patterns) {
    if (pattern.directoryOnly && !isDirectory) {
      continue;
    }

    if (!matchesPattern(relativePath, pattern)) {
      continue;
    }

    ignored = !pattern.negated;
  }
  return ignored;
}

function matchesPattern(relativePath: string, pattern: IgnorePattern): boolean {
  const normalized = relativePath.split(path.sep).join(path.posix.sep);
  if (!pattern.regex) {
    return false;
  }

  if (!pattern.hasSlash && !pattern.anchored) {
    const base = path.posix.basename(normalized);
    if (pattern.directoryOnly) {
      return base === pattern.pattern;
    }
    return pattern.regex.test(base);
  }

  return pattern.regex.test(normalized);
}

function toRelativePosix(rootPath: string, absolutePath: string): string {
  const relative = path.relative(rootPath, absolutePath);
  return relative.split(path.sep).join(path.posix.sep);
}

function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function safeRealpath(targetPath: string): Promise<string | null> {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return null;
  }
}

export function isTextCategory(category: FileCategory): boolean {
  return category !== FileCategory.Other;
}
