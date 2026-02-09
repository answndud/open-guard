export const enum FileCategory {
  Shell = "shell",
  JavaScript = "javascript",
  TypeScript = "typescript",
  Json = "json",
  Yaml = "yaml",
  Markdown = "markdown",
  GitHubAction = "github-action",
  Other = "other",
}

export interface FileEntry {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly category: FileCategory;
}

export interface FileDiscoveryOptions {
  readonly maxFileSizeBytes?: number;
  readonly ignoreFileNames?: readonly string[];
}

export interface RepoContext {
  readonly rootPath: string;
  readonly files: readonly FileEntry[];
  readonly source: "local" | "git";
  readonly repoUrl?: string;
  readonly cleanup?: () => Promise<void>;
}
