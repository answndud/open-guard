import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import readline from "node:readline/promises";
import { runScanCommand } from "./scan-command.js";
import { runPolicyGenerate } from "./policy-command.js";
import { runServerCommand } from "./server-command.js";
import { runSignCommand } from "./sign-command.js";
import { runVerifyCommand } from "./verify-command.js";

const program = new Command();
const toolVersion = await loadVersion();

program
  .name("openguard")
  .version(toolVersion)
  .option("--verbose", "Verbose output")
  .option("--quiet", "Suppress non-essential output")
  .option("--no-color", "Disable colored output")
  .option("--no-interactive", "Disable interactive menu");

program
  .command("scan")
  .argument("<target>", "Path or git URL")
  .option("--format <format>", "Output format (json|md|sarif)", "md")
  .option("--out <file>", "Write report to file")
  .option("--diff-base <gitref>", "Show only new findings vs base")
  .option("--rules <path>", "Custom rules directory")
  .option("--policy <path>", "Existing policy to validate against")
  .option("--threshold <number>", "Exit with error if score >= threshold")
  .option("--save-run", "Persist scan output for the local dashboard")
  .option("--data-dir <path>", "Dashboard data directory")
  .option("--show <section>", "Output sections (summary|findings|all)", "all")
  .option("--max-findings <number>", "Limit findings in output")
  .option("--show-evidence", "Include evidence snippets")
  .action(async (target: string, options) => {
    try {
      const result = await runScanCommand(
        {
          target,
          format: parseFormat(options.format),
          out: options.out,
          diffBase: options.diffBase,
          rulesDir: options.rules,
          policyPath: options.policy,
          threshold: options.threshold ? Number(options.threshold) : undefined,
          saveRun: Boolean(options.saveRun),
          dataDir: options.dataDir,
          show: options.show,
          maxFindings: options.maxFindings
            ? Number(options.maxFindings)
            : undefined,
          showEvidence: Boolean(options.showEvidence),
        },
        toolVersion,
      );

      if (!options.out) {
        await writeStdout(result.output + "\n");
      }

      if (
        typeof options.threshold === "string" &&
        result.report.summary.total_score >= Number(options.threshold)
      ) {
        process.exitCode = 2;
      }
    } catch (error) {
      await writeError(error);
      process.exitCode = 1;
    }
  });

const policyCommand = program.command("policy");
policyCommand
  .command("generate")
  .argument("<target>", "Path or git URL")
  .option("--out <file>", "Write policy to file")
  .option("--merge <file>", "Merge with existing policy")
  .option("--rules <path>", "Custom rules directory")
  .option("--save-run", "Persist policy output for the local dashboard")
  .option("--data-dir <path>", "Dashboard data directory")
  .action(async (target: string, options) => {
    try {
      const output = await runPolicyGenerate({
        target,
        out: options.out,
        merge: options.merge,
        rulesDir: options.rules,
        saveRun: Boolean(options.saveRun),
        dataDir: options.dataDir,
        toolVersion,
      });
      if (!options.out) {
        await writeStdout(output + "\n");
      }
    } catch (error) {
      await writeError(error);
      process.exitCode = 1;
    }
  });

program
  .command("server")
  .option("--port <number>", "Server port", "8787")
  .option("--data-dir <path>", "Dashboard data directory")
  .action(async (options) => {
    try {
      const result = await runServerCommand({
        port: Number(options.port),
        dataDir: options.dataDir,
      });
      await writeStdout(
        `OpenGuard dashboard running at http://localhost:${result.port}\n`,
      );
    } catch (error) {
      await writeError(error);
      process.exitCode = 1;
    }
  });

program
  .command("sign")
  .argument("<artifact>", "Path to artifact")
  .requiredOption("--key <path>", "Path to private key")
  .option("--out <path>", "Output signature + metadata")
  .action(async (artifact: string, options) => {
    try {
      await runSignCommand({
        artifact,
        key: options.key,
        out: options.out,
        toolVersion,
      });
    } catch (error) {
      await writeError(error);
      process.exitCode = 1;
    }
  });

program
  .command("verify")
  .argument("<artifact>", "Path to artifact")
  .requiredOption("--pub <path>", "Path to public key")
  .option("--sig <path>", "Path to signature file")
  .option("--strict", "Fail on any metadata mismatch")
  .action(async (artifact: string, options) => {
    try {
      await runVerifyCommand({
        artifact,
        pub: options.pub,
        signature: options.sig,
        strict: options.strict,
      });
    } catch (error) {
      await writeError(error);
      process.exitCode = 1;
    }
  });

async function loadVersion(): Promise<string> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const rootPath = path.resolve(dir, "..", "..");
  const raw = await fs.readFile(path.join(rootPath, "package.json"), "utf8");
  const json = JSON.parse(raw) as { version?: string };
  return json.version ?? "0.0.0";
}

function parseFormat(value: string): "json" | "md" | "sarif" {
  if (value === "json" || value === "md" || value === "sarif") {
    return value;
  }
  throw new Error(`Unsupported format: ${value}`);
}

async function writeStdout(message: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(message, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function writeError(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await new Promise<void>((resolve) => {
    process.stderr.write(message + "\n", () => resolve());
  });
}

function shouldLaunchInteractive(argv: string[]): boolean {
  const args = argv.slice(2);
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    return false;
  }
  if (args.includes("--no-interactive")) {
    return false;
  }
  if (args.includes("--help") || args.includes("-h")) {
    return false;
  }
  if (args.includes("--version") || args.includes("-V")) {
    return false;
  }
  return args.length === 0;
}

const RECENT_INPUT_FILE = ".openguard/interactive.json";

interface InteractiveState {
  scan: {
    target: string;
    format: string;
    show: string;
    maxFindings: string;
    showEvidence: boolean;
    saveRun: boolean;
    dataDir: string;
  };
  policy: {
    target: string;
    merge: string;
    out: string;
    saveRun: boolean;
    dataDir: string;
  };
  server: {
    port: string;
    dataDir: string;
  };
  sign: {
    artifact: string;
    key: string;
    out: string;
  };
  verify: {
    artifact: string;
    pub: string;
    sig: string;
    strict: boolean;
  };
}

async function runInteractiveMenu(toolVersion: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const state = await loadInteractiveState();
    let exit = false;
    while (!exit) {
      await writeStdout(renderLogo());
      await writeStdout("\n");
      await writeStdout(renderMenu());
      const choice = (await rl.question("Select an option: "))
        .trim()
        .toUpperCase();
      await writeStdout("\n");
      switch (choice) {
        case "A":
          exit = await handleInteractiveScan(rl, toolVersion, state);
          break;
        case "R":
          exit = await handleInteractiveRerun(rl, toolVersion, state);
          break;
        case "B":
          exit = await handleInteractivePolicy(rl, toolVersion, state);
          break;
        case "C":
          exit = await handleInteractiveServer(rl, state);
          break;
        case "D":
          exit = await handleInteractiveSign(rl, toolVersion, state);
          break;
        case "E":
          exit = await handleInteractiveVerify(rl, state);
          break;
        case "H":
          exit = await handleInteractiveHelp(rl);
          break;
        case "X":
          exit = await handleInteractiveReset(rl, state);
          break;
        case "Q":
          await writeStdout("Goodbye.\n");
          exit = true;
          break;
        default:
          await writeStdout("Unknown option.\n");
          break;
      }
      if (!exit) {
        await writeStdout("\n");
      }
    }
  } finally {
    rl.close();
  }
}

function renderLogo(): string {
  return [
    "  ____                  _____                     _ ",
    " / __ \\____  ___  ____/ ___/____ ___  ____ _____(_) ",
    "/ / / / __ \\\/ _ \\\/ __ \\__ \\/ __ `__ \\/ __ `/ __/ ",
    "/ /_/ / /_/ /  __/ /_/ /__/ / / / / / / /_/ / /_   ",
    "\\____/ .___/\\___/ .___/____/_/ /_/ /_/\\__,_/\\__/   ",
    "    /_/         /_/                                   ",
  ].join("\n");
}

function renderMenu(): string {
  return [
    "[A] Scan",
    "[R] Rerun Last Scan",
    "[B] Policy Generate",
    "[C] Open Local Dashboard",
    "[D] Sign Artifact",
    "[E] Verify Artifact",
    "[H] Help (How to Read Results)",
    "[X] Reset Saved Inputs",
    "[Q] Quit",
  ].join("\n");
}

async function handleInteractiveScan(
  rl: readline.Interface,
  toolVersion: string,
  state: InteractiveState,
): Promise<boolean> {
  const last = state.scan;
  const target = await promptText(rl, "Scan target", last.target);
  const format = await promptText(rl, "Format (md/json)", last.format);
  const show = await promptText(rl, "Show (summary/findings/all)", last.show);
  const maxFindings = await promptOptionalNumber(
    rl,
    "Max findings",
    last.maxFindings,
  );
  const showEvidence = await promptYesNo(
    rl,
    "Include evidence",
    last.showEvidence,
  );
  const saveRun = await promptYesNo(rl, "Save run for dashboard", last.saveRun);
  const dataDir = saveRun
    ? await promptText(rl, "Data dir (default: ./.openguard)", last.dataDir)
    : "";

  const result = await runScanCommand(
    {
      target,
      format: parseFormat(format),
      show: normalizeShow(show),
      maxFindings: maxFindings ?? undefined,
      showEvidence,
      saveRun,
      dataDir: dataDir || undefined,
    },
    toolVersion,
  );

  await writeStdout(result.output + "\n");
  updateInteractiveState(state, {
    scan: {
      target,
      format,
      show,
      maxFindings: maxFindings ? String(maxFindings) : "",
      showEvidence,
      saveRun,
      dataDir,
    },
  });
  await saveInteractiveState(state);
  return await promptContinue(rl);
}

async function handleInteractiveRerun(
  rl: readline.Interface,
  toolVersion: string,
  state: InteractiveState,
): Promise<boolean> {
  const last = state.scan;
  const maxFindings = last.maxFindings ? Number(last.maxFindings) : undefined;
  const result = await runScanCommand(
    {
      target: last.target,
      format: parseFormat(last.format),
      show: normalizeShow(last.show),
      maxFindings: Number.isFinite(maxFindings) ? maxFindings : undefined,
      showEvidence: last.showEvidence,
      saveRun: last.saveRun,
      dataDir: last.dataDir || undefined,
    },
    toolVersion,
  );
  await writeStdout(result.output + "\n");
  return await promptContinue(rl);
}

async function handleInteractivePolicy(
  rl: readline.Interface,
  toolVersion: string,
  state: InteractiveState,
): Promise<boolean> {
  const last = state.policy;
  const target = await promptText(rl, "Policy target", last.target);
  const merge = await promptText(rl, "Merge with policy (path)", last.merge);
  const out = await promptText(rl, "Output file (blank for stdout)", last.out);
  const saveRun = await promptYesNo(rl, "Save run for dashboard", last.saveRun);
  const dataDir = saveRun
    ? await promptText(rl, "Data dir (default: ./.openguard)", last.dataDir)
    : "";

  const output = await runPolicyGenerate({
    target,
    out: out || undefined,
    merge: merge || undefined,
    saveRun,
    dataDir: dataDir || undefined,
    toolVersion,
  });

  if (!out) {
    await writeStdout(output + "\n");
  }
  updateInteractiveState(state, {
    policy: { target, merge, out, saveRun, dataDir },
  });
  await saveInteractiveState(state);
  return await promptContinue(rl);
}

async function handleInteractiveServer(
  rl: readline.Interface,
  state: InteractiveState,
): Promise<boolean> {
  const last = state.server;
  const portInput = await promptText(rl, "Server port", last.port);
  const dataDir = await promptText(
    rl,
    "Data dir (default: ./.openguard)",
    last.dataDir,
  );
  const port = Number(portInput);
  const result = await runServerCommand({
    port: Number.isFinite(port) ? port : 8787,
    dataDir: dataDir || undefined,
  });
  await writeStdout(
    `OpenGuard dashboard running at http://localhost:${result.port}\n`,
  );
  updateInteractiveState(state, { server: { port: portInput, dataDir } });
  await saveInteractiveState(state);
  return await promptContinue(rl);
}

async function handleInteractiveSign(
  rl: readline.Interface,
  toolVersion: string,
  state: InteractiveState,
): Promise<boolean> {
  const last = state.sign;
  const artifact = await promptText(rl, "Artifact path", last.artifact);
  const key = await promptText(rl, "Private key path", last.key);
  const out = await promptText(rl, "Output signature path", last.out);

  await runSignCommand({
    artifact,
    key,
    out: out || undefined,
    toolVersion,
  });
  await writeStdout("Signature created.\n");
  updateInteractiveState(state, { sign: { artifact, key, out } });
  await saveInteractiveState(state);
  return await promptContinue(rl);
}

async function handleInteractiveVerify(
  rl: readline.Interface,
  state: InteractiveState,
): Promise<boolean> {
  const last = state.verify;
  const artifact = await promptText(rl, "Artifact path", last.artifact);
  const pub = await promptText(rl, "Public key path", last.pub);
  const sig = await promptText(rl, "Signature path (optional)", last.sig);
  const strict = await promptYesNo(rl, "Strict mode", last.strict);

  await runVerifyCommand({
    artifact,
    pub,
    signature: sig || undefined,
    strict,
  });
  await writeStdout("Verification succeeded.\n");
  updateInteractiveState(state, { verify: { artifact, pub, sig, strict } });
  await saveInteractiveState(state);
  return await promptContinue(rl);
}

async function handleInteractiveReset(
  rl: readline.Interface,
  state: InteractiveState,
): Promise<boolean> {
  const confirm = await promptYesNo(rl, "Reset saved inputs", false);
  if (!confirm) {
    return await promptContinue(rl);
  }
  await fs.rm(RECENT_INPUT_FILE, { force: true });
  const defaults = defaultInteractiveState();
  updateInteractiveState(state, defaults);
  await writeStdout("Saved inputs cleared.\n");
  return await promptContinue(rl);
}

async function handleInteractiveHelp(rl: readline.Interface): Promise<boolean> {
  await writeStdout(renderHelpText());
  await writeStdout("\n");
  return await promptContinue(rl);
}

function renderHelpText(): string {
  return [
    "How to read results:",
    "- Risk Score: overall 0-100. Higher = riskier.",
    "- Risk Level: Low/Moderate/High/Very High/Critical.",
    "- Category Scores: where risk comes from (shell/network/filesystem/credentials).",
    "- Findings: each issue with severity + rule + file + line.",
    "- Evidence: snippet showing the matched pattern.",
    "",
    "Quick guidance:",
    "- 0-19: usually safe with normal caution.",
    "- 20-39: review findings before use.",
    "- 40-59: high risk; apply policy.",
    "- 60+: avoid or require strict approvals.",
    "",
    "Tip: use --show summary or --max-findings to keep output short.",
  ].join("\n");
}

function normalizeShow(value: string): "summary" | "findings" | "all" {
  if (value === "summary" || value === "findings" || value === "all") {
    return value;
  }
  return "all";
}

async function promptText(
  rl: readline.Interface,
  label: string,
  fallback: string,
): Promise<string> {
  const input = await rl.question(
    `${label}${fallback ? ` [${fallback}]` : ""}: `,
  );
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

async function promptYesNo(
  rl: readline.Interface,
  label: string,
  fallback: boolean,
): Promise<boolean> {
  const hint = fallback ? "Y/n" : "y/N";
  const input = await rl.question(`${label} (${hint}): `);
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  return trimmed === "y" || trimmed === "yes";
}

async function promptOptionalNumber(
  rl: readline.Interface,
  label: string,
  fallback: string,
): Promise<number | null> {
  const input = await rl.question(
    `${label}${fallback ? ` [${fallback}]` : ""}: `,
  );
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

async function promptContinue(rl: readline.Interface): Promise<boolean> {
  const input = await rl.question("Return to menu? (Y/n): ");
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }
  return trimmed === "n" || trimmed === "no";
}

function defaultInteractiveState(): InteractiveState {
  return {
    scan: {
      target: ".",
      format: "md",
      show: "all",
      maxFindings: "",
      showEvidence: false,
      saveRun: false,
      dataDir: "",
    },
    policy: {
      target: ".",
      merge: "",
      out: "",
      saveRun: false,
      dataDir: "",
    },
    server: {
      port: "8787",
      dataDir: "",
    },
    sign: {
      artifact: "",
      key: "",
      out: "",
    },
    verify: {
      artifact: "",
      pub: "",
      sig: "",
      strict: false,
    },
  };
}

async function loadInteractiveState(): Promise<InteractiveState> {
  try {
    const raw = await fs.readFile(RECENT_INPUT_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<InteractiveState>;
    return mergeInteractiveState(parsed);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return defaultInteractiveState();
    }
    return defaultInteractiveState();
  }
}

async function saveInteractiveState(state: InteractiveState): Promise<void> {
  await fs.mkdir(path.dirname(RECENT_INPUT_FILE), { recursive: true });
  await fs.writeFile(RECENT_INPUT_FILE, JSON.stringify(state, null, 2), "utf8");
}

function mergeInteractiveState(
  input: Partial<InteractiveState>,
): InteractiveState {
  const defaults = defaultInteractiveState();
  return {
    scan: { ...defaults.scan, ...input.scan },
    policy: { ...defaults.policy, ...input.policy },
    server: { ...defaults.server, ...input.server },
    sign: { ...defaults.sign, ...input.sign },
    verify: { ...defaults.verify, ...input.verify },
  };
}

function updateInteractiveState(
  state: InteractiveState,
  patch: Partial<InteractiveState>,
): void {
  if (patch.scan) {
    state.scan = { ...state.scan, ...patch.scan };
  }
  if (patch.policy) {
    state.policy = { ...state.policy, ...patch.policy };
  }
  if (patch.server) {
    state.server = { ...state.server, ...patch.server };
  }
  if (patch.sign) {
    state.sign = { ...state.sign, ...patch.sign };
  }
  if (patch.verify) {
    state.verify = { ...state.verify, ...patch.verify };
  }
}

const argv = [...process.argv];
const separatorIndex = argv.indexOf("--");
if (separatorIndex !== -1) {
  argv.splice(separatorIndex, 1);
}

if (shouldLaunchInteractive(argv)) {
  await runInteractiveMenu(toolVersion);
  process.exitCode = 0;
} else {
  await program.parseAsync(argv);
}
