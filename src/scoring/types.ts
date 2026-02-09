export interface Subscores {
  shell: number;
  network: number;
  filesystem: number;
  credentials: number;
}

export interface ScoreResult {
  readonly total: number;
  readonly subscores: Subscores;
  readonly hasCritical: boolean;
}
