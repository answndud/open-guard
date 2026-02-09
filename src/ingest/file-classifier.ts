import path from "node:path";
import { FileCategory } from "./types.js";

const SHELL_EXTENSIONS = new Set([".sh", ".bash", ".zsh", ".fish", ".ps1"]);
const JS_EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);
const TS_EXTENSIONS = new Set([".ts", ".cts", ".mts"]);
const YAML_EXTENSIONS = new Set([".yml", ".yaml"]);

export function classifyFile(relativePath: string): FileCategory {
  const normalized = relativePath.split(path.sep).join(path.posix.sep);
  const lowerPath = normalized.toLowerCase();
  const ext = path.posix.extname(lowerPath);

  if (isGitHubActionFile(lowerPath, ext)) {
    return FileCategory.GitHubAction;
  }

  if (SHELL_EXTENSIONS.has(ext)) {
    return FileCategory.Shell;
  }

  if (TS_EXTENSIONS.has(ext)) {
    return FileCategory.TypeScript;
  }

  if (JS_EXTENSIONS.has(ext)) {
    return FileCategory.JavaScript;
  }

  if (ext === ".json") {
    return FileCategory.Json;
  }

  if (YAML_EXTENSIONS.has(ext)) {
    return FileCategory.Yaml;
  }

  if (ext === ".md" || ext === ".markdown") {
    return FileCategory.Markdown;
  }

  return FileCategory.Other;
}

function isGitHubActionFile(lowerPath: string, ext: string): boolean {
  if (ext !== ".yml" && ext !== ".yaml") {
    return false;
  }

  return lowerPath.startsWith(".github/workflows/");
}
