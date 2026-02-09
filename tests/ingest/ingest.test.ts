import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverFiles } from "../../src/ingest/file-discovery.js";
import { loadTarget } from "../../src/ingest/repo-loader.js";
import { FileCategory } from "../../src/ingest/types.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-test-"));
});

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe("ingest", () => {
  it("discovers and classifies files", async () => {
    await mkdir(path.join(tempDir, ".github", "workflows"));
    await mkdir(path.join(tempDir, "src"));

    await writeText(path.join(tempDir, "script.sh"), "echo hi\n");
    await writeText(path.join(tempDir, "src", "index.ts"), "export {}\n");
    await writeText(path.join(tempDir, "config.yml"), "name: demo\n");
    await writeText(path.join(tempDir, "README.md"), "# Demo\n");
    await writeText(
      path.join(tempDir, ".github", "workflows", "ci.yml"),
      "name: ci\n",
    );

    const files = await discoverFiles(tempDir);
    const byPath = new Map(files.map((file) => [file.relativePath, file]));

    expect(byPath.get("script.sh")?.category).toBe(FileCategory.Shell);
    expect(byPath.get("src/index.ts")?.category).toBe(FileCategory.TypeScript);
    expect(byPath.get("config.yml")?.category).toBe(FileCategory.Yaml);
    expect(byPath.get("README.md")?.category).toBe(FileCategory.Markdown);
    expect(byPath.get(".github/workflows/ci.yml")?.category).toBe(
      FileCategory.GitHubAction,
    );
  });

  it("respects ignore files", async () => {
    await writeText(path.join(tempDir, ".gitignore"), "ignored.txt\n");
    await writeText(path.join(tempDir, ".openguardignore"), "secret/\n");
    await writeText(path.join(tempDir, "ignored.txt"), "ignore me\n");
    await mkdir(path.join(tempDir, "secret"));
    await writeText(path.join(tempDir, "secret", "hidden.ts"), "export {}\n");

    const files = await discoverFiles(tempDir);
    const paths = files.map((file) => file.relativePath);

    expect(paths).not.toContain("ignored.txt");
    expect(paths).not.toContain("secret/hidden.ts");
  });

  it("skips large files", async () => {
    const largePath = path.join(tempDir, "large.bin");
    await fs.writeFile(largePath, Buffer.alloc(1_000_001, 0));

    const files = await discoverFiles(tempDir);
    const paths = files.map((file) => file.relativePath);

    expect(paths).not.toContain("large.bin");
  });

  it("skips symlink targets outside root", async () => {
    const outsideDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "openguard-out-"),
    );
    const outsideFile = path.join(outsideDir, "outside.txt");
    await writeText(outsideFile, "outside\n");

    const linkPath = path.join(tempDir, "outside-link");
    await fs.symlink(outsideFile, linkPath);

    const files = await discoverFiles(tempDir);
    const paths = files.map((file) => file.relativePath);

    expect(paths).not.toContain("outside-link");

    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it("loads local targets", async () => {
    await writeText(path.join(tempDir, "hello.js"), "console.log('hi')\n");

    const context = await loadTarget(tempDir);
    const paths = context.files.map((file) => file.relativePath);

    expect(context.rootPath).toBe(path.resolve(tempDir));
    expect(context.source).toBe("local");
    expect(paths).toContain("hello.js");
  });
});

async function mkdir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeText(filePath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, "utf8");
}
