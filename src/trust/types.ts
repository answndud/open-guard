export interface ProvenanceMetadata {
  readonly timestamp: string;
  readonly version: string;
  readonly commit: string;
  readonly builder: string;
}

export interface SignatureEnvelope {
  readonly payload_hash: string;
  readonly payload_type: string;
  readonly metadata: ProvenanceMetadata;
  readonly signature: string;
}

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
