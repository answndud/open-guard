import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashArtifact } from "../../src/trust/artifact-hash.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("artifact hash", () => {
  it("hashes single files deterministically", async () => {
    const root = await makeTempDir();
    const filePath = path.join(root, "artifact.txt");
    await fs.writeFile(filePath, "demo", "utf8");

    const one = await hashArtifact(filePath);
    const two = await hashArtifact(filePath);
    expect(one).toBe(two);
    expect(one.startsWith("sha256:")).toBe(true);
  });

  it("hashes directories and ignores broken/outside symlinks", async () => {
    const root = await makeTempDir();
    await fs.mkdir(path.join(root, "nested"), { recursive: true });
    await fs.writeFile(path.join(root, "nested", "a.txt"), "A", "utf8");

    const outsideDir = await makeTempDir();
    const outsideFile = path.join(outsideDir, "secret.txt");
    await fs.writeFile(outsideFile, "outside", "utf8");

    await fs.symlink(outsideFile, path.join(root, "outside-link.txt"));
    await fs.symlink(
      path.join(root, "missing-target"),
      path.join(root, "broken"),
    );

    const baseHash = await hashArtifact(root);

    await fs.writeFile(path.join(root, "nested", "b.txt"), "B", "utf8");
    const changedHash = await hashArtifact(root);

    expect(baseHash.startsWith("sha256:")).toBe(true);
    expect(changedHash.startsWith("sha256:")).toBe(true);
    expect(changedHash).not.toBe(baseHash);
  });

  it("throws for unsupported artifact types", async () => {
    if (process.platform === "win32") {
      return;
    }

    const root = await makeTempDir();
    const socketPath = path.join(root, "artifact.sock");
    const server = net.createServer();

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => resolve());
    });

    try {
      await expect(hashArtifact(socketPath)).rejects.toThrow(
        "Artifact must be a file or directory",
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-hash-"));
  tempDirs.push(dir);
  return dir;
}
