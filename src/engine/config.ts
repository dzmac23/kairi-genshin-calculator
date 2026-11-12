// Small helpers for working with gcsim config text.

/**
 * Returns the config with its iteration count set to n.
 * gcsim reads the count from the `options` line, for example `options iteration=500 duration=90;`.
 * If there is no iteration setting, one is added; if there is no options line, one is added at the top.
 */
export function setIterations(config: string, n: number): string {
  const count = Math.max(1, Math.floor(n));
  const optionsLine = /\boptions\b[^;]*;/;
  const match = config.match(optionsLine);
  if (!match) return `options iteration=${count};\n${config}`;

  const line = match[0];
  const updated = /\biteration\s*=\s*\d+/.test(line)
    ? line.replace(/\biteration\s*=\s*\d+/, `iteration=${count}`)
    : line.replace(/\boptions\b/, `options iteration=${count}`);
  return config.replace(line, updated);
}

/**
 * How many sim workers to use, the same rule gcsim's own web UI uses: one per processor core,
 * minus one for the aggregator and one for the page, at least 3. Each worker holds its own copy
 * of the engine (about 40 to 50 MB), so devices that report less than 8 GB of memory, or don't
 * report it (Safari, Firefox), are limited to 4.
 */
export function defaultWorkerCount(cores: number | undefined, memoryGB: number | undefined): number {
  if (!cores || (memoryGB != null && memoryGB < 4)) return 3;
  const max = memoryGB != null && memoryGB >= 8 ? 8 : 4;
  return Math.min(Math.max(cores - 2, 3), max);
}
