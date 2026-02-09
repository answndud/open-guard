import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { sign } from "@noble/ed25519";
import "./ed25519.js";
import type { ProvenanceMetadata, Result, SignatureEnvelope } from "./types.js";

const PAYLOAD_TYPE = "application/vnd.openguard.skill.v1";

export interface SignInput {
  readonly artifactPath: string;
  readonly privateKeyPath: string;
  readonly metadata: ProvenanceMetadata;
}

export async function signArtifact(
  input: SignInput,
): Promise<Result<SignatureEnvelope>> {
  try {
    const payloadHash = await hashArtifact(input.artifactPath);
    const payload = createPayload(payloadHash, input.metadata);
    const key = await loadKey(input.privateKeyPath);
    const signatureBytes = await sign(payload, key);
    const signature = Buffer.from(signatureBytes).toString("base64");

    return {
      ok: true,
      value: {
        payload_hash: payloadHash,
        payload_type: PAYLOAD_TYPE,
        metadata: input.metadata,
        signature,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error("Sign failed"),
    };
  }
}

export async function writeSignature(
  outputPath: string,
  envelope: SignatureEnvelope,
): Promise<void> {
  const json = JSON.stringify(envelope, null, 2);
  await fs.writeFile(outputPath, json, "utf8");
}

export function createPayload(
  payloadHash: string,
  metadata: ProvenanceMetadata,
): Uint8Array {
  const payload = {
    payload_hash: payloadHash,
    payload_type: PAYLOAD_TYPE,
    metadata: {
      timestamp: metadata.timestamp,
      version: metadata.version,
      commit: metadata.commit,
      builder: metadata.builder,
    },
  };
  const json = JSON.stringify(payload);
  return new TextEncoder().encode(json);
}

async function hashArtifact(artifactPath: string): Promise<string> {
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

  const files = await listFiles(artifactPath, artifactPath);
  for (const file of files) {
    hash.update(`file:${file.relativePath}\n`);
    const data = await fs.readFile(file.absolutePath);
    hash.update(data);
    hash.update("\n");
  }

  return `sha256:${hash.digest("hex")}`;
}

interface FileEntry {
  readonly absolutePath: string;
  readonly relativePath: string;
}

async function listFiles(root: string, current: string): Promise<FileEntry[]> {
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
        const nested = await listFiles(root, resolved);
        results.push(...nested);
      } else if (stats.isFile()) {
        results.push({ absolutePath: resolved, relativePath });
      }
      continue;
    }

    if (entry.isDirectory()) {
      const nested = await listFiles(root, absolutePath);
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

async function loadKey(keyPath: string): Promise<Uint8Array> {
  const raw = (await fs.readFile(keyPath, "utf8")).trim();
  if (!raw) {
    throw new Error("Key file is empty");
  }

  if (/^[0-9a-fA-F]+$/.test(raw)) {
    return Uint8Array.from(Buffer.from(raw, "hex"));
  }

  try {
    return Uint8Array.from(Buffer.from(raw, "base64"));
  } catch {
    throw new Error("Key must be hex or base64 encoded");
  }
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
