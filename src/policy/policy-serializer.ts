import yaml from "js-yaml";
import type { Policy } from "./types.js";

export function serializePolicy(policy: Policy): string {
  return yaml.dump(policy, { lineWidth: 120, noRefs: true });
}
