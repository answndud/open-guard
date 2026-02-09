import path from "node:path";
import { createMetadata } from "../trust/metadata.js";
import { signArtifact, writeSignature } from "../trust/signer.js";

export interface SignOptions {
  readonly artifact: string;
  readonly key: string;
  readonly out?: string;
  readonly toolVersion: string;
}

export async function runSignCommand(options: SignOptions): Promise<void> {
  const metadata = await createMetadata({ version: options.toolVersion });
  const result = await signArtifact({
    artifactPath: options.artifact,
    privateKeyPath: options.key,
    metadata,
  });

  if (!result.ok) {
    throw result.error;
  }

  const outputPath = options.out ?? defaultSignaturePath(options.artifact);
  await writeSignature(outputPath, result.value);
}

function defaultSignaturePath(artifactPath: string): string {
  return path.resolve(`${artifactPath}.sig.json`);
}
