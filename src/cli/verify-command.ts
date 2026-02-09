import path from "node:path";
import { verifyArtifact } from "../trust/verifier.js";

export interface VerifyOptions {
  readonly artifact: string;
  readonly pub: string;
  readonly signature?: string;
  readonly strict?: boolean;
}

export async function runVerifyCommand(options: VerifyOptions): Promise<void> {
  const signaturePath =
    options.signature ?? defaultSignaturePath(options.artifact);
  const result = await verifyArtifact({
    artifactPath: options.artifact,
    signaturePath,
    publicKeyPath: options.pub,
    strict: options.strict,
  });

  if (!result.ok) {
    throw result.error;
  }
}

function defaultSignaturePath(artifactPath: string): string {
  return path.resolve(`${artifactPath}.sig.json`);
}
