import { startServer } from "../server/index.js";

export interface ServerOptions {
  readonly port?: number;
  readonly dataDir?: string;
}

export async function runServerCommand(
  options: ServerOptions,
): Promise<{ port: number }> {
  const handle = await startServer({
    port: options.port,
    dataDir: options.dataDir,
  });
  return { port: handle.port };
}
