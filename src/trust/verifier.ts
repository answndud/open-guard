import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { verify } from "@noble/ed25519";
import "./ed25519.js";
import type { Result, SignatureEnvelope } from "./types.js";
import { createPayload } from "./signer.js";

export interface VerifyInput {
  readonly artifactPath: string;
  readonly signaturePath: string;
  readonly publicKeyPath: string;
  readonly strict?: boolean;
}

export async function verifyArtifact(
  input: VerifyInput,
): Promise<Result<SignatureEnvelope>> {
  try {
    const envelope = await loadEnvelope(input.signaturePath);
    const payload = createPayload(envelope.payload_hash, envelope.metadata);
    const key = await loadKey(input.publicKeyPath);
    const signature = Buffer.from(envelope.signature, "base64");
    const validSignature = await verify(signature, payload, key);
    if (!validSignature) {
      return { ok: false, error: new Error("Signature verification failed") };
    }

    const payloadHash = await hashArtifact(input.artifactPath);
    if (payloadHash !== envelope.payload_hash) {
      return { ok: false, error: new Error("Payload hash mismatch") };
    }

    if (input.strict) {
      if (!envelope.metadata.timestamp || !envelope.metadata.commit) {
        return {
          ok: false,
          error: new Error("Metadata missing required fields"),
        };
      }
    }

    return { ok: true, value: envelope };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error("Verify failed"),
    };
  }
}

async function loadEnvelope(signaturePath: string): Promise<SignatureEnvelope> {
  const raw = await fs.readFile(signaturePath, "utf8");
  const json = JSON.parse(raw) as SignatureEnvelope;
  if (!json.payload_hash || !json.signature || !json.metadata) {
    throw new Error("Invalid signature envelope");
  }
  return json;
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
