import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getPublicKey } from "@noble/ed25519";
import "../../src/trust/ed25519.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMetadata } from "../../src/trust/metadata.js";
import { signArtifact, writeSignature } from "../../src/trust/signer.js";
import { verifyArtifact } from "../../src/trust/verifier.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openguard-trust-"));
});

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe("trust signing", () => {
  it("signs and verifies artifacts", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKey = Buffer.alloc(32, 1);
    const publicKey = await getPublicKey(privateKey);
    const privateKeyPath = path.join(tempDir, "private.key");
    const publicKeyPath = path.join(tempDir, "public.key");
    await fs.writeFile(
      privateKeyPath,
      Buffer.from(privateKey).toString("hex"),
      "utf8",
    );
    await fs.writeFile(
      publicKeyPath,
      Buffer.from(publicKey).toString("hex"),
      "utf8",
    );

    const metadata = await createMetadata({
      version: "0.1.0",
      commit: "test-commit",
      builder: "openguard-cli/0.1.0",
      timestamp: "2026-02-09T00:00:00Z",
    });

    const signed = await signArtifact({
      artifactPath,
      privateKeyPath,
      metadata,
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) {
      return;
    }

    const sigPath = path.join(tempDir, "artifact.sig.json");
    await writeSignature(sigPath, signed.value);

    const verified = await verifyArtifact({
      artifactPath,
      signaturePath: sigPath,
      publicKeyPath,
      strict: true,
    });
    expect(verified.ok).toBe(true);
  });

  it("fails when artifact changes", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKey = Buffer.alloc(32, 2);
    const publicKey = await getPublicKey(privateKey);
    const privateKeyPath = path.join(tempDir, "private.key");
    const publicKeyPath = path.join(tempDir, "public.key");
    await fs.writeFile(
      privateKeyPath,
      Buffer.from(privateKey).toString("hex"),
      "utf8",
    );
    await fs.writeFile(
      publicKeyPath,
      Buffer.from(publicKey).toString("hex"),
      "utf8",
    );

    const metadata = await createMetadata({
      version: "0.1.0",
      commit: "test-commit",
      builder: "openguard-cli/0.1.0",
      timestamp: "2026-02-09T00:00:00Z",
    });

    const signed = await signArtifact({
      artifactPath,
      privateKeyPath,
      metadata,
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) {
      return;
    }

    const sigPath = path.join(tempDir, "artifact.sig.json");
    await writeSignature(sigPath, signed.value);

    await fs.writeFile(artifactPath, "changed", "utf8");
    const verified = await verifyArtifact({
      artifactPath,
      signaturePath: sigPath,
      publicKeyPath,
    });
    expect(verified.ok).toBe(false);
  });
});
