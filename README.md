# WASM Proof Server Benchmark

Browser-side ZK proof generation benchmark for the Midnight network. Proves each of the 13 circuits in `contract.compact` (K=5 through K=17) sequentially in the browser using `@paima/midnight-wasm-prover` and displays the time taken per circuit.

## Prerequisites

- [Deno](https://deno.land/) v2+
- The compiled contract must already be in `output-dir/` (keys, ZKIR, and contract JS)

## Setup

### 1. Copy WASM prover assets

```bash
cp -r /path/to/node_modules/@paima/midnight-wasm-prover/ public/prover/
```

The directory must contain:
```
public/prover/
  midnight_wasm_prover.js
  midnight_wasm_prover_bg.wasm
  snippets/wasm-bindgen-rayon-38edf6e439f6d70d/src/workerHelpers.js
```

### 2. Copy BLS/KZG parameter files

The prover requires one parameter file per circuit size K:

```bash
mkdir -p public/midnight-prover
cp /path/to/midnight-prover/bls_midnight_2p{5..17} public/midnight-prover/
```

Missing files can be downloaded from the Midnight S3 bucket:

```bash
for k in 5 6 7 8 9 10 11 12 13 14 15 16 17; do
  curl -o public/midnight-prover/bls_midnight_2p${k} \
    https://midnight-s3-fileshare-dev-eu-west-1.s3.eu-west-1.amazonaws.com/bls_midnight_2p${k}
done
```

Circuits whose BLS file is absent are automatically skipped during the benchmark.

### 3. Generate unproven transaction bytes (one-time)

Runs the contract circuits locally to capture their proof transcripts and serializes them to `public/txs/`.

```bash
deno task generate-txs
```

Re-run this if `contract.compact` or `output-dir/` changes.

## Running

```bash
deno task serve
```

Open [http://localhost:8080](http://localhost:8080) and click **Run Benchmark**.

## How it works

```
generate-txs.ts          Runs each circuit via compact-runtime, builds an
                         UnprovenTransaction with ledger-v8, saves bytes to
                         public/txs/<circuit>.bin

server.ts                Minimal Deno HTTP server. Serves all static assets
                         with COOP/COEP headers required for SharedArrayBuffer
                         (needed by the WASM thread pool).

public/worker.js         ES Module web worker. Initializes the WASM prover
                         with a Rayon thread pool, then proves each circuit
                         sequentially on request from the main page.

public/index.html        Benchmark UI. Drives the worker circuit-by-circuit
                         and displays proof times in a live-updating table.
```

### Asset routes

| URL prefix | Served from |
|---|---|
| `/prover/` | `public/prover/` — WASM prover module |
| `/midnight-prover/` | `public/midnight-prover/` — BLS/KZG params |
| `/keys/` | `output-dir/keys/` — circuit prover/verifier keys |
| `/zkir/` | `output-dir/zkir/` — circuit ZKIR files |
| `/txs/` | `public/txs/` — pre-generated unproven TX bytes |
