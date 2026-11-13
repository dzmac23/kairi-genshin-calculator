// For tests only: the placeholder test team (builds chosen for testing, not the owner's real
// builds), entered the way the Team screen stores it, matching reference/sample_gcsim_config.txt.

import type { GameData } from '../data/gameData';
import { emptySlot, type Slot, type Team } from './model';

export const byKey = <T extends { gcsim_key: string | null; name: string }>(list: T[], key: string) =>
  list.find((x) => x.gcsim_key === key)!.name;

export function placeholderTeam(data: GameData): Team {
  const slot = (character: string, weapon: string, refinement: number, set: string, artifacts: Slot['artifacts']): Slot => ({
    ...emptySlot(),
    character: byKey(data.characters, character),
    weapon: byKey(data.weapons, weapon),
    refinement,
    sets: { mode: '4pc', set: byKey(data.sets, set) },
    artifacts,
  });
  const shared = { 'atk%': 9.92, atk: 344.08, hp: 5287.88, 'def%': 12.4, def: 39.36 };
  return [
    slot('neuvillette', 'sacrificialjade', 1, 'marechausseehunter', {
      ...shared, 'hp%': 56.52, em: 39.64, cr: 33.1, cd: 128.4, er: 11.02, 'elem%': 46.6,
    }),
    slot('kaedeharakazuha', 'xiphosmoonlight', 1, 'viridescentvenerer', {
      ...shared, 'hp%': 9.92, em: 640.28, cr: 33.1, cd: 66.2, er: 22.04,
    }),
    slot('furina', 'fleuvecendreferryman', 5, 'goldentroupe', {
      ...shared, 'hp%': 103.12, em: 39.64, cr: 64.2, cd: 79.4, er: 22.04,
    }),
    slot('xilonen', 'theflute', 5, 'scrolloftheheroofcindercity', {
      ...shared, 'hp%': 9.92, 'def%': 187.3, em: 39.64, cr: 33.1, cd: 66.2, er: 22.04,
    }),
  ];
}
