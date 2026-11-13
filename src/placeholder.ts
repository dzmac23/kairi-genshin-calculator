// The placeholder test team: C0 Neuvillette, Kazuha, Furina and Xilonen with builds chosen
// for testing. They are NOT the owner's real builds. The app uses this team only as a test case
// to confirm it matches gcsim (reference/sample_gcsim_result.json has gcsim's own result for it,
// about 35,100 team DPS). It is never loaded as a default team.

import { setIterations } from './engine/config';
import placeholderConfig from '../reference/sample_gcsim_config.txt?raw';

export const PLACEHOLDER_CONFIG = placeholderConfig.trim();
export const PLACEHOLDER_LABEL = 'Placeholder test team';
export const PLACEHOLDER_NOTE =
  'Builds chosen for testing, not your real builds. Used to check the app matches gcsim (about 35,100 DPS expected).';

/** True if the config is the placeholder test team, whatever iteration count was chosen. */
export function isPlaceholderConfig(config: string): boolean {
  const normalise = (c: string) => setIterations(c.trim(), 1).replace(/\s+/g, ' ');
  return normalise(config) === normalise(PLACEHOLDER_CONFIG);
}
