export const enum ScoreCategory {
  Shell = "shell",
  Network = "network",
  Filesystem = "filesystem",
  Credentials = "credentials",
}

export const SEVERITY_POINTS: Readonly<Record<string, number>> = {
  critical: 30,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

export const CONFIDENCE_WEIGHTS: Readonly<Record<string, number>> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

export const CATEGORY_WEIGHTS: Readonly<Record<ScoreCategory, number>> = {
  [ScoreCategory.Shell]: 0.3,
  [ScoreCategory.Network]: 0.25,
  [ScoreCategory.Filesystem]: 0.2,
  [ScoreCategory.Credentials]: 0.25,
};

export const CATEGORY_MAP: Readonly<Record<string, ScoreCategory>> = {
  shell: ScoreCategory.Shell,
  obfuscation: ScoreCategory.Shell,
  network: ScoreCategory.Network,
  "supply-chain": ScoreCategory.Network,
  filesystem: ScoreCategory.Filesystem,
  macos: ScoreCategory.Filesystem,
  windows: ScoreCategory.Filesystem,
  credentials: ScoreCategory.Credentials,
  gha: ScoreCategory.Shell,
};
