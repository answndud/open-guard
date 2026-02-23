import fs from "node:fs/promises";
import { verify } from "@noble/ed25519";
import "./ed25519.js";
import type { Result, SignatureEnvelope } from "./types.js";
import { createPayload } from "./signer.js";
import { hashArtifact } from "./artifact-hash.js";
import { loadPublicKey } from "./key-loader.js";

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
    const key = await loadPublicKey(input.publicKeyPath);
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
