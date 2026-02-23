import fs from "node:fs/promises";

const HEX_RE = /^[0-9a-fA-F]+$/;
const BASE64_RE =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export async function loadPrivateKey(keyPath: string): Promise<Uint8Array> {
  return await loadKey(keyPath, 32, "private");
}

export async function loadPublicKey(keyPath: string): Promise<Uint8Array> {
  return await loadKey(keyPath, 32, "public");
}

type KeyKind = "private" | "public";

async function loadKey(
  keyPath: string,
  expectedBytes: number,
  kind: KeyKind,
): Promise<Uint8Array> {
  const raw = (await fs.readFile(keyPath, "utf8")).trim();
  if (!raw) {
    throw new Error(`Key file is empty: ${kind} key`);
  }

  const decoded = decodeStrict(raw);
  if (!decoded) {
    throw new Error(
      `Key must be valid hex or base64 encoded: ${kind} key at ${keyPath}`,
    );
  }

  if (decoded.length !== expectedBytes) {
    throw new Error(
      `Invalid ${kind} key length: expected ${expectedBytes} bytes, got ${decoded.length}`,
    );
  }

  return Uint8Array.from(decoded);
}

function decodeStrict(raw: string): Buffer | null {
  if (HEX_RE.test(raw)) {
    if (raw.length % 2 !== 0) {
      return null;
    }
    return Buffer.from(raw, "hex");
  }

  if (!BASE64_RE.test(raw)) {
    return null;
  }

  const decoded = Buffer.from(raw, "base64");
  const normalizedInput = raw.replace(/=+$/, "");
  const normalizedDecoded = decoded.toString("base64").replace(/=+$/, "");
  if (normalizedDecoded !== normalizedInput) {
    return null;
  }
  return decoded;
}
