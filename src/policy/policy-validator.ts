import fs from "node:fs/promises";
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

const APPROVAL_CATEGORIES = new Set<string>([
  ApprovalCategory.ShellExec,
  ApprovalCategory.NewDomain,
  ApprovalCategory.CredentialPaths,
  ApprovalCategory.FileWrite,
  ApprovalCategory.ElevatedPrivilege,
]);

const APPROVAL_MODES = new Set<string>([
  ApprovalMode.Auto,
  ApprovalMode.Prompt,
  ApprovalMode.TwoStep,
  ApprovalMode.Deny,
]);

const METADATA_KEYS = new Set(["name", "description", "created", "author"]);
const DEFAULTS_KEYS = new Set(["action", "require_approval_for"]);
const ALLOW_KEYS = new Set(["commands", "paths", "network"]);
const ALLOW_PATH_KEYS = new Set(["read", "write"]);
const ALLOW_NETWORK_KEYS = new Set(["domains", "ports"]);
const DENY_KEYS = new Set(["commands", "paths", "network"]);
const DENY_NETWORK_KEYS = new Set(["domains"]);
const COMMAND_RULE_KEYS = new Set(["cmd", "args", "description"]);
const DENY_COMMAND_RULE_KEYS = new Set(["cmd", "args"]);
const APPROVALS_KEYS = new Set([
  "shell_exec",
  "new_domain",
  "credential_paths",
  "file_write",
  "elevated_privilege",
]);
const APPROVAL_CONFIG_KEYS = new Set(["mode", "except_allowlisted"]);

/**
 * Validate and normalize a policy object.
 */
export async function validatePolicy(policy: unknown): Promise<Policy> {
  const errors: string[] = [];
  const normalized = parsePolicy(policy, errors);
  if (errors.length > 0) {
    throw new Error(`Invalid policy: ${errors.join("; ")}`);
  }
  return normalized;
}

export async function loadPolicySchema(schemaPath: string): Promise<string> {
  return await fs.readFile(schemaPath, "utf8");
}

function parsePolicy(input: unknown, errors: string[]): Policy {
  if (!isRecord(input)) {
    errors.push("policy must be an object");
    return emptyPolicy();
  }

  assertNoExtraKeys(
    input,
    new Set(["version", "metadata", "defaults", "allow", "deny", "approvals"]),
    "policy",
    errors,
  );

  const version = input.version;
  if (version !== "v1") {
    errors.push("policy.version must be 'v1'");
  }

  const metadata = input.metadata
    ? parseMetadata(input.metadata, errors)
    : undefined;
  const defaults = parseDefaults(input.defaults, errors);
  const allow = parseAllow(input.allow, errors);
  const deny = parseDeny(input.deny, errors);
  const approvals = parseApprovals(input.approvals, errors);

  return {
    version: "v1",
    metadata,
    defaults,
    allow,
    deny,
    approvals,
  };
}

function parseMetadata(input: unknown, errors: string[]): PolicyMetadata {
  if (!isRecord(input)) {
    errors.push("metadata must be an object");
    return {};
  }
  assertNoExtraKeys(input, METADATA_KEYS, "metadata", errors);
  const metadata: {
    name?: string;
    description?: string;
    created?: string;
    author?: string;
  } = {};
  for (const key of METADATA_KEYS) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "string") {
      errors.push(`metadata.${key} must be a string`);
      continue;
    }
    metadata[key as keyof typeof metadata] = value;
  }
  return metadata;
}

function parseDefaults(input: unknown, errors: string[]): PolicyDefaults {
  if (!isRecord(input)) {
    errors.push("defaults must be an object");
    return {
      action: "deny",
      require_approval_for: [],
    };
  }
  assertNoExtraKeys(input, DEFAULTS_KEYS, "defaults", errors);

  const action = input.action;
  if (action !== "deny" && action !== "allow") {
    errors.push("defaults.action must be 'deny' or 'allow'");
  }

  const approvalCategories = parseStringArray(
    input.require_approval_for,
    "defaults.require_approval_for",
    errors,
  )
    .filter((value) => {
      if (!APPROVAL_CATEGORIES.has(value)) {
        errors.push(
          `defaults.require_approval_for includes invalid category '${value}'`,
        );
        return false;
      }
      return true;
    })
    .map((value) => value as ApprovalCategory);

  return {
    action: action === "allow" ? "allow" : "deny",
    require_approval_for: approvalCategories,
  };
}

function parseAllow(input: unknown, errors: string[]): AllowRules {
  if (!isRecord(input)) {
    errors.push("allow must be an object");
    return emptyAllow();
  }
  assertNoExtraKeys(input, ALLOW_KEYS, "allow", errors);

  const commands = parseCommandRules(input.commands, "allow.commands", errors);
  const paths = parseAllowPaths(input.paths, errors);
  const network = parseAllowNetwork(input.network, errors);

  return { commands, paths, network };
}

function parseAllowPaths(input: unknown, errors: string[]): PathRules {
  if (!isRecord(input)) {
    errors.push("allow.paths must be an object");
    return { read: [], write: [] };
  }
  assertNoExtraKeys(input, ALLOW_PATH_KEYS, "allow.paths", errors);

  const read = parseStringArray(input.read, "allow.paths.read", errors);
  const write = parseStringArray(input.write, "allow.paths.write", errors);

  return { read, write };
}

function parseAllowNetwork(input: unknown, errors: string[]): NetworkRules {
  if (!isRecord(input)) {
    errors.push("allow.network must be an object");
    return { domains: [], ports: [] };
  }
  assertNoExtraKeys(input, ALLOW_NETWORK_KEYS, "allow.network", errors);

  const domains = parseStringArray(
    input.domains,
    "allow.network.domains",
    errors,
  );
  const ports = parseNumberArray(input.ports, "allow.network.ports", errors);

  return { domains, ports };
}

function parseDeny(input: unknown, errors: string[]): DenyRules {
  if (!isRecord(input)) {
    errors.push("deny must be an object");
    return emptyDeny();
  }
  assertNoExtraKeys(input, DENY_KEYS, "deny", errors);

  const commands = parseDenyCommandRules(
    input.commands,
    "deny.commands",
    errors,
  );
  const paths = parseStringArray(input.paths, "deny.paths", errors);
  const network = parseDenyNetwork(input.network, errors);

  return { commands, paths, network };
}

function parseDenyNetwork(
  input: unknown,
  errors: string[],
): { domains: string[] } {
  if (!isRecord(input)) {
    errors.push("deny.network must be an object");
    return { domains: [] };
  }
  assertNoExtraKeys(input, DENY_NETWORK_KEYS, "deny.network", errors);
  const domains = parseStringArray(
    input.domains,
    "deny.network.domains",
    errors,
  );
  return { domains };
}

function parseApprovals(input: unknown, errors: string[]): Approvals {
  if (!isRecord(input)) {
    errors.push("approvals must be an object");
    return emptyApprovals();
  }
  assertNoExtraKeys(input, APPROVALS_KEYS, "approvals", errors);

  return {
    shell_exec: parseApprovalConfig(
      input.shell_exec,
      "approvals.shell_exec",
      errors,
    ),
    new_domain: parseApprovalConfig(
      input.new_domain,
      "approvals.new_domain",
      errors,
    ),
    credential_paths: parseApprovalConfig(
      input.credential_paths,
      "approvals.credential_paths",
      errors,
    ),
    file_write: parseApprovalConfig(
      input.file_write,
      "approvals.file_write",
      errors,
    ),
    elevated_privilege: parseApprovalConfig(
      input.elevated_privilege,
      "approvals.elevated_privilege",
      errors,
    ),
  };
}

function parseApprovalConfig(
  input: unknown,
  path: string,
  errors: string[],
): { mode: ApprovalMode; except_allowlisted: boolean } {
  if (!isRecord(input)) {
    errors.push(`${path} must be an object`);
    return { mode: ApprovalMode.Deny, except_allowlisted: false };
  }
  assertNoExtraKeys(input, APPROVAL_CONFIG_KEYS, path, errors);
  const mode = input.mode;
  if (typeof mode !== "string" || !APPROVAL_MODES.has(mode)) {
    errors.push(`${path}.mode must be a valid approval mode`);
  }
  const exceptAllowlisted = input.except_allowlisted;
  if (
    exceptAllowlisted !== undefined &&
    typeof exceptAllowlisted !== "boolean"
  ) {
    errors.push(`${path}.except_allowlisted must be a boolean`);
  }
  return {
    mode: APPROVAL_MODES.has(String(mode))
      ? (mode as ApprovalMode)
      : ApprovalMode.Deny,
    except_allowlisted:
      typeof exceptAllowlisted === "boolean" ? exceptAllowlisted : true,
  };
}

function parseCommandRules(
  input: unknown,
  path: string,
  errors: string[],
): CommandRule[] {
  if (!Array.isArray(input)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  const rules: CommandRule[] = [];
  input.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${entryPath} must be an object`);
      return;
    }
    assertNoExtraKeys(entry, COMMAND_RULE_KEYS, entryPath, errors);
    const cmd = entry.cmd;
    if (typeof cmd !== "string" || cmd.length === 0) {
      errors.push(`${entryPath}.cmd must be a non-empty string`);
      return;
    }
    const args = entry.args;
    const parsedArgs =
      args === undefined
        ? undefined
        : parseStringArray(args, `${entryPath}.args`, errors);
    const description = entry.description;
    if (description !== undefined && typeof description !== "string") {
      errors.push(`${entryPath}.description must be a string`);
    }
    rules.push({
      cmd,
      args: parsedArgs,
      description: typeof description === "string" ? description : undefined,
    });
  });
  return rules;
}

function parseDenyCommandRules(
  input: unknown,
  path: string,
  errors: string[],
): CommandRule[] {
  if (!Array.isArray(input)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  const rules: CommandRule[] = [];
  input.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${entryPath} must be an object`);
      return;
    }
    assertNoExtraKeys(entry, DENY_COMMAND_RULE_KEYS, entryPath, errors);
    const cmd = entry.cmd;
    if (typeof cmd !== "string" || cmd.length === 0) {
      errors.push(`${entryPath}.cmd must be a non-empty string`);
      return;
    }
    const args = entry.args;
    const parsedArgs =
      args === undefined
        ? undefined
        : parseStringArray(args, `${entryPath}.args`, errors);
    rules.push({
      cmd,
      args: parsedArgs,
    });
  });
  return rules;
}

function parseStringArray(
  input: unknown,
  path: string,
  errors: string[],
): string[] {
  if (!Array.isArray(input)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  const values: string[] = [];
  input.forEach((entry, index) => {
    if (typeof entry !== "string") {
      errors.push(`${path}[${index}] must be a string`);
      return;
    }
    values.push(entry);
  });
  return values;
}

function parseNumberArray(
  input: unknown,
  path: string,
  errors: string[],
): number[] {
  if (!Array.isArray(input)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  const values: number[] = [];
  input.forEach((entry, index) => {
    if (!Number.isInteger(entry)) {
      errors.push(`${path}[${index}] must be an integer`);
      return;
    }
    if (entry < 1 || entry > 65535) {
      errors.push(`${path}[${index}] must be between 1 and 65535`);
      return;
    }
    values.push(entry);
  });
  return values;
}

function assertNoExtraKeys(
  input: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[],
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      errors.push(`${path} contains unsupported field '${key}'`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emptyPolicy(): Policy {
  return {
    version: "v1",
    defaults: { action: "deny", require_approval_for: [] },
    allow: emptyAllow(),
    deny: emptyDeny(),
    approvals: emptyApprovals(),
  };
}

function emptyAllow(): AllowRules {
  return {
    commands: [],
    paths: { read: [], write: [] },
    network: { domains: [], ports: [] },
  };
}

function emptyDeny(): DenyRules {
  return {
    commands: [],
    paths: [],
    network: { domains: [] },
  };
}

function emptyApprovals(): Approvals {
  return {
    shell_exec: { mode: ApprovalMode.Deny, except_allowlisted: false },
    new_domain: { mode: ApprovalMode.Deny, except_allowlisted: false },
    credential_paths: { mode: ApprovalMode.Deny, except_allowlisted: false },
    file_write: { mode: ApprovalMode.Deny, except_allowlisted: false },
    elevated_privilege: { mode: ApprovalMode.Deny, except_allowlisted: false },
  };
}
