import fs from "node:fs/promises";
import { verify } from "@noble/ed25519";
import "./ed25519.js";
import type { Result, SignatureEnvelope } from "./types.js";
import { createPayload, PAYLOAD_TYPE } from "./signer.js";
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
    if (envelope.payload_type !== PAYLOAD_TYPE) {
      return { ok: false, error: new Error("Unsupported payload type") };
    }

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
      const strictError = validateStrictMetadata(envelope);
      if (strictError) {
        return {
          ok: false,
          error: new Error(strictError),
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
  if (
    !json.payload_hash ||
    !json.payload_type ||
    !json.signature ||
    !json.metadata
  ) {
    throw new Error("Invalid signature envelope");
  }
  return json;
}

function validateStrictMetadata(envelope: SignatureEnvelope): string | null {
  const { metadata } = envelope;
  if (
    !metadata.timestamp ||
    !metadata.commit ||
    !metadata.version ||
    !metadata.builder
  ) {
    return "Metadata missing required fields";
  }

  const parsedTime = new Date(metadata.timestamp);
  if (Number.isNaN(parsedTime.getTime())) {
    return "Metadata timestamp must be a valid ISO-8601 timestamp";
  }

  if (parsedTime.toISOString() !== metadata.timestamp) {
    return "Metadata timestamp must use canonical ISO-8601 UTC format";
  }

  if (!/^[0-9a-f]{7,40}$/i.test(metadata.commit)) {
    return "Metadata commit must be a 7-40 character git SHA";
  }

  if (!/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(metadata.version)) {
    return "Metadata version must be semver-like (for example: 1.2.3)";
  }

  return null;
}
