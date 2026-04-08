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
      commit: "1234567890abcdef1234567890abcdef12345678",
      builder: "openguard-cli/0.1.0",
      timestamp: "2026-02-09T00:00:00.000Z",
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

  it("rejects malformed private key input", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKeyPath = path.join(tempDir, "private.key");
    await fs.writeFile(privateKeyPath, "not-a-valid-key@@", "utf8");

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

    expect(signed.ok).toBe(false);
    if (signed.ok) {
      return;
    }
    expect(signed.error.message).toContain("hex or base64");
  });

  it("accepts base64-encoded keys", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKey = Buffer.alloc(32, 7);
    const publicKey = await getPublicKey(privateKey);
    const privateKeyPath = path.join(tempDir, "private.key");
    const publicKeyPath = path.join(tempDir, "public.key");
    await fs.writeFile(privateKeyPath, Buffer.from(privateKey).toString("base64"));
    await fs.writeFile(publicKeyPath, Buffer.from(publicKey).toString("base64"));

    const metadata = await createMetadata({
      version: "0.1.0",
      commit: "1234567890abcdef1234567890abcdef12345678",
      builder: "openguard-cli/0.1.0",
      timestamp: "2026-02-09T00:00:00.000Z",
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
    });
    expect(verified.ok).toBe(true);
  });

  it("rejects empty private key input", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKeyPath = path.join(tempDir, "private.key");
    await fs.writeFile(privateKeyPath, "   \n", "utf8");

    const metadata = await createMetadata({
      version: "0.1.0",
      commit: "1234567890abcdef1234567890abcdef12345678",
      builder: "openguard-cli/0.1.0",
      timestamp: "2026-02-09T00:00:00.000Z",
    });

    const signed = await signArtifact({
      artifactPath,
      privateKeyPath,
      metadata,
    });
    expect(signed.ok).toBe(false);
    if (signed.ok) {
      return;
    }
    expect(signed.error.message).toContain("Key file is empty");
  });

  it("supports base64-encoded key material", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKey = Buffer.alloc(32, 7);
    const publicKey = await getPublicKey(privateKey);
    const privateKeyPath = path.join(tempDir, "private-base64.key");
    const publicKeyPath = path.join(tempDir, "public-base64.key");
    await fs.writeFile(
      privateKeyPath,
      Buffer.from(privateKey).toString("base64"),
      "utf8",
    );
    await fs.writeFile(
      publicKeyPath,
      Buffer.from(publicKey).toString("base64"),
      "utf8",
    );

    const metadata = await createMetadata({
      version: "0.1.0",
      commit: "1234567890abcdef1234567890abcdef12345678",
      builder: "openguard-cli/0.1.0",
      timestamp: "2026-02-09T00:00:00.000Z",
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
    });
    expect(verified.ok).toBe(true);
  });

  it("rejects empty private key files", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKeyPath = path.join(tempDir, "private-empty.key");
    await fs.writeFile(privateKeyPath, "   \n", "utf8");

    const metadata = await createMetadata({
      version: "0.1.0",
      commit: "1234567890abcdef1234567890abcdef12345678",
      builder: "openguard-cli/0.1.0",
      timestamp: "2026-02-09T00:00:00.000Z",
    });

    const signed = await signArtifact({
      artifactPath,
      privateKeyPath,
      metadata,
    });
    expect(signed.ok).toBe(false);
    if (signed.ok) {
      return;
    }
    expect(signed.error.message).toContain("Key file is empty");
  });

  it("rejects public key with wrong length", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKey = Buffer.alloc(32, 3);
    const publicKey = await getPublicKey(privateKey);
    const privateKeyPath = path.join(tempDir, "private.key");
    const badPublicKeyPath = path.join(tempDir, "public.key");
    await fs.writeFile(
      privateKeyPath,
      Buffer.from(privateKey).toString("hex"),
      "utf8",
    );
    await fs.writeFile(
      badPublicKeyPath,
      Buffer.from(publicKey).subarray(0, 31).toString("hex"),
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
      publicKeyPath: badPublicKeyPath,
    });
    expect(verified.ok).toBe(false);
    if (verified.ok) {
      return;
    }
    expect(verified.error.message).toContain("expected 32 bytes");
  });

  it("rejects unsupported payload type", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKey = Buffer.alloc(32, 4);
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
      commit: "1234567890abcdef1234567890abcdef12345678",
      builder: "openguard-cli/0.1.0",
      timestamp: "2026-02-09T00:00:00.000Z",
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

    const tampered = {
      ...signed.value,
      payload_type: "application/vnd.invalid.payload.v1",
    };
    const sigPath = path.join(tempDir, "artifact.sig.json");
    await fs.writeFile(sigPath, JSON.stringify(tampered, null, 2), "utf8");

    const verified = await verifyArtifact({
      artifactPath,
      signaturePath: sigPath,
      publicKeyPath,
    });
    expect(verified.ok).toBe(false);
    if (verified.ok) {
      return;
    }
    expect(verified.error.message).toContain("Unsupported payload type");
  });

  it("rejects malformed signature envelopes", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKey = Buffer.alloc(32, 8);
    const publicKey = await getPublicKey(privateKey);
    const publicKeyPath = path.join(tempDir, "public.key");
    const sigPath = path.join(tempDir, "artifact.sig.json");
    await fs.writeFile(
      publicKeyPath,
      Buffer.from(publicKey).toString("hex"),
      "utf8",
    );
    await fs.writeFile(sigPath, JSON.stringify({ signature: "abc" }), "utf8");

    const verified = await verifyArtifact({
      artifactPath,
      signaturePath: sigPath,
      publicKeyPath,
    });
    expect(verified.ok).toBe(false);
    if (verified.ok) {
      return;
    }
    expect(verified.error.message).toContain("Invalid signature envelope");
  });

  it("fails strict verification for non-SHA commit metadata", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKey = Buffer.alloc(32, 5);
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
      commit: "unknown",
      builder: "openguard-cli/0.1.0",
      timestamp: "2026-02-09T00:00:00.000Z",
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
    expect(verified.ok).toBe(false);
    if (verified.ok) {
      return;
    }
    expect(verified.error.message).toContain(
      "commit must be a 7-40 character git SHA",
    );
  });

  it("fails strict verification for non-canonical timestamp", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKey = Buffer.alloc(32, 6);
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
      commit: "1234567890abcdef1234567890abcdef12345678",
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
    expect(verified.ok).toBe(false);
    if (verified.ok) {
      return;
    }
    expect(verified.error.message).toContain(
      "timestamp must use canonical ISO-8601 UTC format",
    );
  });

  it("rejects invalid signature envelopes", async () => {
    const artifactPath = path.join(tempDir, "artifact.txt");
    await fs.writeFile(artifactPath, "demo", "utf8");

    const privateKey = Buffer.alloc(32, 8);
    const publicKey = await getPublicKey(privateKey);
    const publicKeyPath = path.join(tempDir, "public.key");
    const sigPath = path.join(tempDir, "artifact.sig.json");
    await fs.writeFile(
      publicKeyPath,
      Buffer.from(publicKey).toString("hex"),
      "utf8",
    );
    await fs.writeFile(sigPath, JSON.stringify({ payload_hash: "sha256:test" }));

    const verified = await verifyArtifact({
      artifactPath,
      signaturePath: sigPath,
      publicKeyPath,
    });
    expect(verified.ok).toBe(false);
    if (verified.ok) {
      return;
    }
    expect(verified.error.message).toContain("Invalid signature envelope");
  });
});
