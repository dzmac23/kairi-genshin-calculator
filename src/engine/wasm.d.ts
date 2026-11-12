// Types for what gcsim's wasm module and Go's wasm_exec.js put on the global object.
// See cmd/wasm/main.go in genshinsim/gcsim. Errors come back as a JSON string: {"error":"..."}.

declare class Go {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

declare function validateConfig(cfg: string): string;
declare function initializeWorker(cfg: string): string | null;
declare function simulate(): Uint8Array | string;
declare function initializeAggregator(cfg: string): string;
declare function aggregate(summary: Uint8Array): string | null;
declare function flush(): { result: string; hash: string } | string;
