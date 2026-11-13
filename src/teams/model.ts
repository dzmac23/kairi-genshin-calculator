// Saved teams: four builds plus any number of labelled rotations ("Standard", "Double Q"…).
// Fight settings are not part of a saved team (they change from test to test).

import type { RotationText } from '../rotation/notation';
import { cleanSlot, emptySlot, type Team } from '../team/model';

export type SavedRotation = { id: string; label: string; rotation: RotationText };

export type SavedTeam = {
  id: string;
  name: string;
  team: Team;
  rotations: SavedRotation[];
  createdAt: string;
  updatedAt: string;
};

/** Which saved team and rotation the Team and Rotation screens were last loaded from. */
export type ActiveSaved = { teamId?: string; rotationId?: string };

const normaliseTeam = (team: Team) => JSON.stringify(team.map((s) => ({ ...emptySlot(), ...s })));

/** True when two teams have the same builds (used to tell whether the current team was edited). */
export function sameTeam(a: Team, b: Team): boolean {
  return normaliseTeam(a) === normaliseTeam(b);
}

export function sameRotation(a: RotationText, b: RotationText): boolean {
  return a.opener.trim() === b.opener.trim() && a.loop.trim() === b.loop.trim();
}

export function teamCharacterNames(team: Team): string[] {
  return team.map((s) => s.character).filter((c): c is string => !!c);
}

export function isSavedTeam(x: unknown): x is SavedTeam {
  const t = x as SavedTeam;
  return (
    !!t &&
    typeof t.id === 'string' &&
    typeof t.name === 'string' &&
    Array.isArray(t.team) &&
    t.team.length === 4 &&
    Array.isArray(t.rotations) &&
    t.rotations.every((r) => r && typeof r.id === 'string' && typeof r.label === 'string' && typeof r.rotation?.loop === 'string')
  );
}

/** Repairs a saved team read from storage or a file (fills in fields added in later versions). */
export function cleanSavedTeam(t: SavedTeam): SavedTeam {
  return {
    ...t,
    team: t.team.map(cleanSlot),
    rotations: t.rotations.map((r) => ({ ...r, rotation: { opener: String(r.rotation.opener ?? ''), loop: String(r.rotation.loop ?? '') } })),
  };
}

/**
 * The saved-team part of a run's name: the team name if the current team is that saved team
 * unchanged, plus the rotation label if the rotation is that saved rotation unchanged.
 */
export function savedNames(
  saved: SavedTeam | undefined,
  active: ActiveSaved,
  team: Team,
  rotation: RotationText,
): { teamName?: string; rotationLabel?: string } {
  if (!saved || !sameTeam(saved.team, team)) return {};
  const rot = saved.rotations.find((r) => r.id === active.rotationId);
  return { teamName: saved.name, rotationLabel: rot && sameRotation(rot.rotation, rotation) ? rot.label : undefined };
}
