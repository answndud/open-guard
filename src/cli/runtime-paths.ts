import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function resolveRulesDirectory(
  customRulesDir?: string,
): Promise<string> {
  if (customRulesDir) {
    return path.resolve(customRulesDir);
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const bundledRulesDir = path.resolve(moduleDir, "..", "..", "rules");
  if (await existsDirectory(bundledRulesDir)) {
    return bundledRulesDir;
  }

  const cwdRulesDir = path.resolve(process.cwd(), "rules");
  if (await existsDirectory(cwdRulesDir)) {
    return cwdRulesDir;
  }

  throw new Error(
    "Unable to find built-in rules directory. Pass --rules <path> to use a custom rules directory.",
  );
}

async function existsDirectory(targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
