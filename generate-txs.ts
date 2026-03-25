/**
 * One-time setup script: generates serialized unproven transaction bytes for each
 * benchmark circuit and saves them to public/txs/.
 *
 * Run with: deno run --allow-all generate-txs.ts
 *
 * Bypasses midnight-js-contracts (Effect.js) by calling compact-runtime circuit
 * execution and ledger-v8 transaction building directly.
 */

import {
  createCircuitContext,
  createConstructorContext,
  communicationCommitmentRandomness,
  sampleContractAddress,
} from "npm:@midnight-ntwrk/compact-runtime@0.15.0";
import {
  ContractState as LedgerContractState,
  LedgerParameters,
  PrePartitionContractCall,
  PreTranscript,
  QueryContext,
  Transaction,
  ZswapChainState,
  sampleCoinPublicKey,
} from "npm:@midnight-ntwrk/ledger-v8@8.0.3";
import { getNetworkId, setNetworkId } from "npm:@midnight-ntwrk/midnight-js-network-id@4.0.1";

// deno.json maps '@midnight-ntwrk/compact-runtime' → npm: for the compiled contract
const { Contract } = await import("./output-dir/contract/index.js");

const CIRCUITS = [
  "test_k5",
  "test_k6",
  "test_k7",
  "test_k8",
  "test_k9",
  "test_k10",
  "test_k11",
  "test_k12",
  "test_k13",
  "test_k14",
  "test_k15",
  "test_k16",
  "test_k17",
];

// Network ID is required by midnight-js-network-id before any tx building
setNetworkId("undeployed");

console.log("Initializing contract state...");

const coinPublicKey = sampleCoinPublicKey();
const constructorCtx = createConstructorContext(undefined, coinPublicKey);
const contract = new Contract({});
const { currentContractState: initialContractState } = contract.initialState(constructorCtx);

const contractAddress = sampleContractAddress();
const ledgerParameters = LedgerParameters.initialParameters();

// Convert compact-runtime ContractState → ledger-v8 ContractState (same binary format)
const ledgerContractState = LedgerContractState.deserialize(initialContractState.serialize());

await Deno.mkdir("public/txs", { recursive: true });

console.log(`Generating unproven TX bytes for ${CIRCUITS.length} circuits...\n`);

for (const circuitId of CIRCUITS) {
  process.stdout.write(`  ${circuitId}... `);
  try {
    // Run the circuit to capture the proof transcript (no ZK proving yet)
    const circuitCtx = createCircuitContext(contractAddress, coinPublicKey, initialContractState, {});
    const { proofData } = contract.circuits[circuitId](circuitCtx);
    const { input, output, publicTranscript, privateTranscriptOutputs } = proofData;

    // Build ledger query context with block fields (mirrors createUnprovenLedgerCallTx internals)
    const queryContext = new QueryContext(ledgerContractState.data, contractAddress);
    queryContext.block = {
      ...queryContext.block,
      balance: ledgerContractState.balance,
      ownAddress: contractAddress,
      secondsSinceEpoch: BigInt(Math.floor(Date.now() / 1_000)),
    };

    const op = ledgerContractState.operation(circuitId);
    if (!op) throw new Error(`No operation found for circuit '${circuitId}'`);

    const preTranscript = new PreTranscript(queryContext, publicTranscript);
    const call = new PrePartitionContractCall(
      contractAddress,
      circuitId,
      op,
      preTranscript,
      privateTranscriptOutputs,
      input,
      output,
      communicationCommitmentRandomness(),
      circuitId,
    );

    // No coin operations in these circuits, so guaranteed offer is undefined
    const ttl = new Date(Date.now() + 3_600_000);
    const unprovenTx = Transaction.fromPartsRandomized(getNetworkId(), undefined, undefined)
      .addCalls({ tag: "random" }, [call], ledgerParameters, ttl);

    const bytes = unprovenTx.serialize();
    await Deno.writeFile(`public/txs/${circuitId}.bin`, bytes);
    console.log(`✓  (${bytes.length} bytes)`);
  } catch (err) {
    console.log(`✗  ${(err as Error).message}`);
    console.error((err as Error).stack);
  }
}

console.log("\nDone. TX bytes saved to public/txs/");
