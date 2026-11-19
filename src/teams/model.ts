// Saved teams: four builds plus any number of labelled rotations ("Standard", "Double Q"…).
// One rotation is the team's main rotation: it loads with the team. The first rotation saved is
// the main one until another is made main.
// Fight settings are not part of a saved team (they change from test to test).

import type { RotationText } from '../rotation/notation';
import { cleanSlot, emptySlot, type Team } from '../team/model';

export type SavedRotation = { id: string; label: string; rotation: RotationText };

export type SavedTeam = {
  id: string;
  name: string;
  team: Team;
  rotations: SavedRotation[];
  /** The rotation that loads with the team. Always one of `rotations` when there are any. */
  mainRotationId?: string;
  createdAt: string;
  updatedAt: string;
};

/** Which saved team and rotation the Setup screen was last loaded from. */
export type ActiveSaved = { teamId?: string; rotationId?: string };

// The baseline is saved working (gcsim's stats without artifacts), not something the person typed,
// so it doesn't count as a change.
const normaliseTeam = (team: Team) => JSON.stringify(team.map(({ baseline: _, ...s }) => ({ ...emptySlot(), ...s })));

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
// Teams saved before main rotations existed get their oldest rotation as the main one.
export function cleanSavedTeam(t: SavedTeam): SavedTeam {
  const rotations = t.rotations.map((r) => ({ ...r, rotation: { opener: String(r.rotation.opener ?? ''), loop: String(r.rotation.loop ?? '') } }));
  const main = rotations.some((r) => r.id === t.mainRotationId) ? t.mainRotationId : rotations[0]?.id;
  return { ...t, team: t.team.map(cleanSlot), rotations, mainRotationId: main };
}

/** The team's main rotation (undefined only for a team with no rotations). */
export function mainRotation(t: SavedTeam): SavedRotation | undefined {
  return t.rotations.find((r) => r.id === t.mainRotationId) ?? t.rotations[0];
}

/** The team's rotations with the main one first, the others in the order they were saved. */
export function rotationsMainFirst(t: SavedTeam): SavedRotation[] {
  const main = mainRotation(t);
  return main ? [main, ...t.rotations.filter((r) => r !== main)] : [];
}

/** Removes a rotation, unless it is the main one (another must be made main first). */
export function removeRotation(t: SavedTeam, rotationId: string): SavedTeam {
  if (mainRotation(t)?.id === rotationId) return t;
  return { ...t, rotations: t.rotations.filter((r) => r.id !== rotationId) };
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

/** What is loaded on the Setup screen, and whether it was edited. */
export type LoadedState = {
  activeTeam?: SavedTeam;
  activeRotation?: SavedRotation;
  /** The team was edited since it was loaded or saved. */
  teamDirty: boolean;
  /** The rotation was edited since it was loaded or saved. */
  rotationDirty: boolean;
  /** The current team has characters / the current rotation has a Loop. */
  hasTeam: boolean;
  hasRotation: boolean;
};

/**
 * What switching would lose. Switching to another team replaces the team and the rotation; switching
 * rotation within the loaded team keeps the team. `savable` is true when some of it can be saved
 * with "Save changes" (edits to a loaded saved team or rotation).
 */
export function unsavedWork(s: LoadedState, sameTeam: boolean): { savable: boolean; text: string } | undefined {
  const parts: string[] = [];
  let savable = false;
  if (!sameTeam) {
    if (s.activeTeam && s.teamDirty) {
      parts.push(`changes to the team "${s.activeTeam.name}"`);
      savable ||= s.hasTeam;
    } else if (!s.activeTeam && s.hasTeam) parts.push('a team that isn’t saved');
  }
  if (s.activeRotation && s.rotationDirty) {
    parts.push(`changes to the rotation "${s.activeRotation.label}"`);
    savable ||= s.hasRotation;
  } else if (!s.activeRotation && s.hasRotation) parts.push('a rotation that isn’t saved');
  if (!parts.length) return undefined;
  return { savable, text: `You have ${parts.join(' and ')}.` };
}
