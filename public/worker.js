/**
 * ES Module web worker that initializes the midnight WASM prover and handles
 * proof generation requests from the main benchmark page.
 *
 * Loaded as: new Worker('/worker.js', { type: 'module' })
 */

import init, {
  CostModel,
  MidnightWasmParamsProvider,
  Rng,
  WasmProver,
  WasmResolver,
  initThreadPool,
} from "/prover/midnight_wasm_prover.js";

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Guard against SPA/server returning HTML instead of binary
  if (bytes.length >= 2 && bytes[0] === 0x3c && bytes[1] === 0x21) {
    throw new Error(`Server returned HTML instead of binary for: ${url}`);
  }
  return bytes;
}

let prover = null;
let rng = null;
// Keyed by k value (string); true = available, false = missing.
const blsCache = new Map();

async function checkBls(k) {
  if (blsCache.has(k)) return blsCache.get(k);
  const res = await fetch(`/midnight-prover/bls_midnight_2p${k}`, { method: "HEAD" });
  blsCache.set(k, res.ok);
  return res.ok;
}

async function initialize() {
  // Initialize WASM module with explicit path so it resolves correctly
  await init("/prover/midnight_wasm_prover_bg.wasm");

  // Initialize multi-threaded Rayon pool
  const threads = Math.max(1, navigator.hardwareConcurrency ?? 2);
  await initThreadPool(threads);

  rng = Rng.new();

  const resolver = WasmResolver.newWithFetchers(
    (circuitId) => fetchBytes(`/keys/${circuitId}.prover`),
    (circuitId) => fetchBytes(`/keys/${circuitId}.verifier`),
    (circuitId) => fetchBytes(`/zkir/${circuitId}.bzkir`),
  );

  const paramsProvider = MidnightWasmParamsProvider.newWithFetcher(
    (k) => fetchBytes(`/midnight-prover/bls_midnight_2p${k}`),
  );

  prover = WasmProver.new(resolver, paramsProvider);
  postMessage({ type: "ready", threads });
}

self.onmessage = async ({ data }) => {
  if (data.type !== "prove") return;
  const { circuitId } = data;

  try {
    const k = circuitId.match(/\d+$/)?.[0];
    if (k && !await checkBls(k)) {
      postMessage({ type: "skipped", circuitId });
      return;
    }
    const txBytes = await fetchBytes(`/txs/${circuitId}.bin`);
    const t0 = performance.now();
    await prover.prove(rng, txBytes, CostModel.initialCostModel());
    const ms = performance.now() - t0;
    postMessage({ type: "result", circuitId, ms });
  } catch (err) {
    postMessage({ type: "error", circuitId, message: err.message });
  }
};

// Start initialization immediately
initialize().catch((err) => {
  postMessage({ type: "init-error", message: err.message });
});
