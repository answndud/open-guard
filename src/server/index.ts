import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.js";

export interface ServerOptions {
  readonly port?: number;
  readonly dataDir?: string;
}

export interface ServerHandle {
  readonly port: number;
  readonly close: () => Promise<void>;
}

const UI_ROOT = "ui";

export async function startServer(
  options: ServerOptions = {},
): Promise<ServerHandle> {
  const server = http.createServer(async (req, res) => {
    const handled = await handleApi(req, res, { dataDir: options.dataDir });
    if (handled) {
      return;
    }
    await handleStatic(req, res);
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    server.listen(options.port ?? 8787, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind server port"));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function handleStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = await resolveUiPath(pathname);

  if (!filePath) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    res.statusCode = 200;
    res.setHeader("content-type", contentTypeFor(pathname));
    res.end(content);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.statusCode = 500;
    res.end("Server error");
  }
}

async function resolveUiPath(requestPath: string): Promise<string | null> {
  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const uiDir = path.join(baseDir, UI_ROOT);
  const safePath = requestPath.replace(/\.\./g, "");
  const candidate = path.join(uiDir, safePath);
  if (!candidate.startsWith(uiDir)) {
    return null;
  }
  return candidate;
}

function contentTypeFor(pathname: string): string {
  if (pathname.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (pathname.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (pathname.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  return "application/octet-stream";
}
