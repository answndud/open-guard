import {
  ApprovalCategory,
  ApprovalMode,
  type AllowRules,
  type Approvals,
  type CommandRule,
  type DenyRules,
  type NetworkRules,
  type PathRules,
  type Policy,
  type PolicyDefaults,
  type PolicyMetadata,
} from "./types.js";

const APPROVAL_ORDER: Record<ApprovalMode, number> = {
  [ApprovalMode.Auto]: 0,
  [ApprovalMode.Prompt]: 1,
  [ApprovalMode.TwoStep]: 2,
  [ApprovalMode.Deny]: 3,
};

const APPROVAL_SORT = [
  ApprovalCategory.ShellExec,
  ApprovalCategory.NewDomain,
  ApprovalCategory.CredentialPaths,
  ApprovalCategory.FileWrite,
  ApprovalCategory.ElevatedPrivilege,
];

/**
 * Merge base and generated policies with deny-first semantics.
 */
export function mergePolicy(base: Policy, generated: Policy): Policy {
  const metadata = mergeMetadata(base.metadata, generated.metadata);
  const defaults = mergeDefaults(base.defaults, generated.defaults);
  const allow = mergeAllow(base.allow, generated.allow);
  const deny = mergeDeny(base.deny, generated.deny);
  const approvals = mergeApprovals(base.approvals, generated.approvals);

  const normalizedAllow = removeDeniedAllows(allow, deny);

  return {
    version: "v1",
    metadata,
    defaults,
    allow: normalizedAllow,
    deny,
    approvals,
  };
}

function mergeMetadata(
  base?: PolicyMetadata,
  generated?: PolicyMetadata,
): PolicyMetadata | undefined {
  if (base) {
    return base;
  }
  if (generated) {
    return generated;
  }
  return undefined;
}

function mergeDefaults(
  base: PolicyDefaults,
  generated: PolicyDefaults,
): PolicyDefaults {
  const action =
    base.action === "deny" || generated.action === "deny" ? "deny" : "allow";
  const categories = new Set<ApprovalCategory>();
  base.require_approval_for.forEach((category) => categories.add(category));
  generated.require_approval_for.forEach((category) =>
    categories.add(category),
  );

  return {
    action,
    require_approval_for: Array.from(categories).sort(sortByCategory),
  };
}

function mergeAllow(base: AllowRules, generated: AllowRules): AllowRules {
  return {
    commands: mergeCommandRules(base.commands, generated.commands),
    paths: mergePaths(base.paths, generated.paths),
    network: mergeNetwork(base.network, generated.network),
  };
}

function mergeDeny(base: DenyRules, generated: DenyRules): DenyRules {
  return {
    commands: mergeCommandRules(base.commands, generated.commands),
    paths: mergeStringArray(base.paths, generated.paths),
    network: {
      domains: mergeStringArray(
        base.network.domains,
        generated.network.domains,
      ),
    },
  };
}

function mergeApprovals(base: Approvals, generated: Approvals): Approvals {
  return {
    shell_exec: mergeApprovalConfig(base.shell_exec, generated.shell_exec),
    new_domain: mergeApprovalConfig(base.new_domain, generated.new_domain),
    credential_paths: mergeApprovalConfig(
      base.credential_paths,
      generated.credential_paths,
    ),
    file_write: mergeApprovalConfig(base.file_write, generated.file_write),
    elevated_privilege: mergeApprovalConfig(
      base.elevated_privilege,
      generated.elevated_privilege,
    ),
  };
}

function mergeApprovalConfig(
  base: { mode: ApprovalMode; except_allowlisted: boolean },
  generated: { mode: ApprovalMode; except_allowlisted: boolean },
): { mode: ApprovalMode; except_allowlisted: boolean } {
  const mode =
    APPROVAL_ORDER[base.mode] >= APPROVAL_ORDER[generated.mode]
      ? base.mode
      : generated.mode;
  const except_allowlisted =
    base.except_allowlisted && generated.except_allowlisted;
  return { mode, except_allowlisted };
}

function mergeCommandRules(
  base: readonly CommandRule[],
  generated: readonly CommandRule[],
): CommandRule[] {
  const map = new Map<string, CommandRule>();
  const addRule = (rule: CommandRule) => {
    const key = commandKey(rule);
    if (!map.has(key)) {
      map.set(key, rule);
    }
  };

  base.forEach(addRule);
  generated.forEach(addRule);

  return Array.from(map.values()).sort(compareCommandRules);
}

function mergePaths(base: PathRules, generated: PathRules): PathRules {
  return {
    read: mergeStringArray(base.read, generated.read),
    write: mergeStringArray(base.write, generated.write),
  };
}

function mergeNetwork(
  base: NetworkRules,
  generated: NetworkRules,
): NetworkRules {
  return {
    domains: mergeStringArray(base.domains, generated.domains),
    ports: mergeNumberArray(base.ports, generated.ports),
  };
}

function mergeStringArray(
  base: readonly string[],
  generated: readonly string[],
): string[] {
  const values = new Set<string>();
  base.forEach((value) => values.add(value));
  generated.forEach((value) => values.add(value));
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function mergeNumberArray(
  base: readonly number[],
  generated: readonly number[],
): number[] {
  const values = new Set<number>();
  base.forEach((value) => values.add(value));
  generated.forEach((value) => values.add(value));
  return Array.from(values).sort((a, b) => a - b);
}

function removeDeniedAllows(allow: AllowRules, deny: DenyRules): AllowRules {
  const deniedCommandKeys = new Set(
    deny.commands.map((rule) => commandKey(rule)),
  );
  const deniedPaths = new Set(deny.paths);
  const deniedDomains = new Set(deny.network.domains);

  return {
    commands: allow.commands
      .filter((rule) => !deniedCommandKeys.has(commandKey(rule)))
      .sort(compareCommandRules),
    paths: {
      read: allow.paths.read
        .filter((path) => !deniedPaths.has(path))
        .sort((a, b) => a.localeCompare(b)),
      write: allow.paths.write
        .filter((path) => !deniedPaths.has(path))
        .sort((a, b) => a.localeCompare(b)),
    },
    network: {
      domains: allow.network.domains
        .filter((domain) => !deniedDomains.has(domain))
        .sort((a, b) => a.localeCompare(b)),
      ports: allow.network.ports.slice().sort((a, b) => a - b),
    },
  };
}

function commandKey(rule: CommandRule): string {
  const args = rule.args ? rule.args.join("\u0000") : "";
  return `${rule.cmd}\u0000${args}`;
}

function compareCommandRules(a: CommandRule, b: CommandRule): number {
  const cmdCompare = a.cmd.localeCompare(b.cmd);
  if (cmdCompare !== 0) {
    return cmdCompare;
  }
  const aArgs = a.args ? a.args.join("\u0000") : "";
  const bArgs = b.args ? b.args.join("\u0000") : "";
  return aArgs.localeCompare(bArgs);
}

function sortByCategory(a: ApprovalCategory, b: ApprovalCategory): number {
  const aIndex = APPROVAL_SORT.indexOf(a);
  const bIndex = APPROVAL_SORT.indexOf(b);
  if (aIndex === -1 && bIndex === -1) {
    return a.localeCompare(b);
  }
  if (aIndex === -1) {
    return 1;
  }
  if (bIndex === -1) {
    return -1;
  }
  return aIndex - bIndex;
}
