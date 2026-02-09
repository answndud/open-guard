import crypto from "node:crypto";
import { etc } from "@noble/ed25519";

if (!etc.sha512Sync) {
  etc.sha512Sync = (...messages: Uint8Array[]): Uint8Array => {
    const hash = crypto.createHash("sha512");
    for (const message of messages) {
      hash.update(message);
    }
    return new Uint8Array(hash.digest());
  };
}
