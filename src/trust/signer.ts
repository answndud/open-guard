import fs from "node:fs/promises";
import { sign } from "@noble/ed25519";
import "./ed25519.js";
import type { ProvenanceMetadata, Result, SignatureEnvelope } from "./types.js";
import { hashArtifact } from "./artifact-hash.js";
import { loadPrivateKey } from "./key-loader.js";

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
    const key = await loadPrivateKey(input.privateKeyPath);
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
