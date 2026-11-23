import { engineUrl } from './pool';

/** patches: the patches/ files the engine was built with (scripts/build-gcsim.sh). */
export type EngineVersion = { gcsimTag: string; gcsimCommit: string; goVersion: string; patches?: string[] };

let loading: Promise<EngineVersion | undefined> | undefined;

/** The gcsim version in this build (public/gcsim/version.json), or undefined if it's missing. */
export function getEngineVersion(): Promise<EngineVersion | undefined> {
  loading ??= fetch(`${engineUrl}version.json`)
    .then((r) => (r.ok ? (r.json() as Promise<EngineVersion>) : undefined))
    .catch(() => undefined);
  return loading;
}
