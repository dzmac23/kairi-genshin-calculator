// Smoke test for the gcsim browser engine (main.wasm + wasm_exec.js).
//
// It loads the engine in Node the same way a browser would, then:
//   1. validates a gcsim config with validateConfig,
//   2. runs a number of iterations with initializeWorker + simulate,
//   3. combines them with initializeAggregator + aggregate + flush,
//   4. prints team DPS and, if given, checks it is near an expected mean.
//
// Usage:
//   node scripts/wasm-smoke-test.mjs <engine dir> <config file> [iterations] [expected mean DPS]
//
// The engine dir must contain main.wasm and wasm_exec.js. The config normally used is the
// placeholder test team in reference/sample_gcsim_config.txt (builds chosen for testing, not
// real builds), whose known gcsim result is about 35,100 team DPS. Exits with a non-zero
// code if anything fails, so it can be used as a check in GitHub Actions.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [engineDir, configPath, iterArg = '50', expectedArg] = process.argv.slice(2);
if (!engineDir || !configPath) {
  console.error('Usage: node scripts/wasm-smoke-test.mjs <engine dir> <config file> [iterations] [expected mean DPS]');
  process.exit(2);
}
const iterations = Number(iterArg);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// gcsim reports errors as a JSON string like {"error":"..."}.
function checkError(value, step) {
  if (typeof value === 'string' && value.startsWith('{"error"')) {
    fail(`${step}: ${JSON.parse(value).error}`);
  }
  return value;
}

// wasm_exec.js defines globalThis.Go, the helper that runs Go-compiled wasm.
await import(pathToFileURL(resolve(engineDir, 'wasm_exec.js')).href);
const go = new globalThis.Go();
const wasmBytes = readFileSync(join(engineDir, 'main.wasm'));
const { instance } = await WebAssembly.instantiate(wasmBytes, go.importObject);
go.run(instance); // never resolves: the Go program waits forever so its functions stay available

for (const name of ['sample', 'validateConfig', 'initializeWorker', 'simulate', 'initializeAggregator', 'aggregate', 'flush']) {
  if (typeof globalThis[name] !== 'function') fail(`engine did not register ${name}()`);
}
console.log('OK: engine loaded and registered all 7 functions');

const config = readFileSync(configPath, 'utf8');
checkError(globalThis.validateConfig(config), 'validateConfig');
console.log('OK: config is valid');

checkError(globalThis.initializeAggregator(config), 'initializeAggregator');
checkError(globalThis.initializeWorker(config), 'initializeWorker');

const start = Date.now();
for (let i = 0; i < iterations; i++) {
  const summary = checkError(globalThis.simulate(), `simulate (iteration ${i + 1})`);
  checkError(globalThis.aggregate(summary), `aggregate (iteration ${i + 1})`);
}
const seconds = (Date.now() - start) / 1000;

const flushed = globalThis.flush();
checkError(flushed, 'flush');
const result = JSON.parse(flushed.result);
const dps = result.statistics.dps;
console.log(`OK: ${iterations} iterations in ${seconds.toFixed(1)} s`);
console.log(`Team DPS: mean ${dps.mean.toFixed(0)}, sd ${dps.sd.toFixed(0)}, min ${dps.min.toFixed(0)}, max ${dps.max.toFixed(0)}`);

if (expectedArg) {
  // A loose band: a small number of iterations has a lot of random spread.
  const expected = Number(expectedArg);
  const tolerance = 0.1;
  if (Math.abs(dps.mean - expected) > expected * tolerance) {
    fail(`mean DPS ${dps.mean.toFixed(0)} is more than ${tolerance * 100}% away from expected ${expected}`);
  }
  console.log(`OK: mean DPS is within ${tolerance * 100}% of expected ${expected}`);
}
process.exit(0);
