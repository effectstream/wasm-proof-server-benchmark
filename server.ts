/**
 * Minimal Deno HTTP server for the ZK proof benchmark page.
 *
 * Run with: deno run --allow-read --allow-net server.ts
 *
 * Serves static files with required COOP/COEP headers for SharedArrayBuffer
 * support (needed by the WASM prover thread pool).
 */

const PORT = 1180;

// Directory-prefix routes: URL prefix → local directory
const DIR_ROUTES: [string, string][] = [
  ["/prover/", "public/prover/"],
  ["/midnight-prover/", "public/midnight-prover/"],
  ["/keys/", "output-dir/keys/"],
  ["/zkir/", "output-dir/zkir/"],
  ["/txs/", "public/txs/"],
];

// Exact-file routes: exact URL path → local file path
const FILE_ROUTES: Record<string, string> = {
  "/": "public/index.html",
  "/index.html": "public/index.html",
  "/worker.js": "public/worker.js",
  "/tailwind.js": "public/tailwind.js",
  // workerHelpers.js resolves import('../../..') → /prover/ (bare directory).
  // Map it to the main WASM JS module so Rayon thread workers can self-spawn.
  "/prover/": "public/prover/midnight_wasm_prover.js",
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".json": "application/json; charset=utf-8",
  "": "application/octet-stream", // BLS param files have no extension
};

function getMime(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  const ext = dot === -1 ? "" : filePath.slice(dot);
  return MIME[ext] ?? "application/octet-stream";
}

async function serveFile(localPath: string, headers: Headers): Promise<Response> {
  try {
    const data = await Deno.readFile(localPath);
    headers.set("Content-Type", getMime(localPath));
    return new Response(data, { status: 200, headers });
  } catch {
    return new Response("404 Not Found\n", { status: 404, headers });
  }
}

function baseHeaders(): Headers {
  return new Headers({
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Access-Control-Allow-Origin": "*",
  });
}

async function handler(req: Request): Promise<Response> {
  const pathname = new URL(req.url).pathname;
  const headers = baseHeaders();

  // Exact file matches first
  if (pathname in FILE_ROUTES) {
    return serveFile(FILE_ROUTES[pathname], headers);
  }

  // Directory prefix routes
  for (const [prefix, localDir] of DIR_ROUTES) {
    if (pathname.startsWith(prefix)) {
      const relative = pathname.slice(prefix.length);
      // Prevent path traversal
      if (relative.includes("..")) {
        return new Response("403 Forbidden\n", { status: 403, headers });
      }
      return serveFile(localDir + relative, headers);
    }
  }

  return new Response("404 Not Found\n", { status: 404, headers });
}

console.log(`ZK Proof Benchmark server → http://localhost:${PORT}`);
Deno.serve({ port: PORT }, handler);
