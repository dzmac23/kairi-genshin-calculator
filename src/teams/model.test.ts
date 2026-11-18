import { describe, expect, it } from 'vitest';
import { emptySlot } from '../team/model';
import { cleanSavedTeam, mainRotation, removeRotation, rotationsMainFirst, unsavedWork, type LoadedState, type SavedTeam } from './model';

const rot = (id: string, loop = `${id} loop`) => ({ id, label: id.toUpperCase(), rotation: { opener: '', loop } });
const team = (extra: Partial<SavedTeam> = {}): SavedTeam => ({
  id: 't1',
  name: 'Skirk Freeze',
  team: [{ ...emptySlot(), character: 'Skirk' }, emptySlot(), emptySlot(), emptySlot()],
  rotations: [rot('a'), rot('b'), rot('c')],
  createdAt: '2026-11-18T00:00:00.000Z',
  updatedAt: '2026-11-18T00:00:00.000Z',
  ...extra,
});

describe('main rotation', () => {
  it('makes the oldest rotation main for teams saved before main rotations existed', () => {
    expect(cleanSavedTeam(team()).mainRotationId).toBe('a');
  });
  it('keeps a valid main rotation, and repairs one that points to a missing rotation', () => {
    expect(cleanSavedTeam(team({ mainRotationId: 'c' })).mainRotationId).toBe('c');
    expect(cleanSavedTeam(team({ mainRotationId: 'gone' })).mainRotationId).toBe('a');
  });
  it('leaves a team without rotations without a main one', () => {
    const t = cleanSavedTeam(team({ rotations: [] }));
    expect(t.mainRotationId).toBeUndefined();
    expect(mainRotation(t)).toBeUndefined();
    expect(rotationsMainFirst(t)).toEqual([]);
  });
  it('lists the main rotation first, the rest in saved order', () => {
    expect(rotationsMainFirst(team({ mainRotationId: 'b' })).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
  it('refuses to delete the main rotation but deletes the others', () => {
    const t = team({ mainRotationId: 'b' });
    expect(removeRotation(t, 'b').rotations).toHaveLength(3);
    expect(removeRotation(t, 'a').rotations.map((r) => r.id)).toEqual(['b', 'c']);
  });
});

describe('unsavedWork (what switching would lose)', () => {
  const saved = team({ mainRotationId: 'a' });
  const state = (extra: Partial<LoadedState> = {}): LoadedState => ({
    activeTeam: saved,
    activeRotation: saved.rotations[0],
    teamDirty: false,
    rotationDirty: false,
    hasTeam: true,
    hasRotation: true,
    ...extra,
  });

  it('finds nothing when the loaded team and rotation are unchanged', () => {
    expect(unsavedWork(state(), false)).toBeUndefined();
  });
  it('offers saving for edits to a loaded team or rotation', () => {
    expect(unsavedWork(state({ teamDirty: true }), false)).toEqual({ savable: true, text: 'You have changes to the team "Skirk Freeze".' });
    expect(unsavedWork(state({ teamDirty: true, rotationDirty: true }), false)?.text).toBe(
      'You have changes to the team "Skirk Freeze" and changes to the rotation "A".',
    );
  });
  it('ignores team edits when only switching rotation within the loaded team', () => {
    expect(unsavedWork(state({ teamDirty: true }), true)).toBeUndefined();
    expect(unsavedWork(state({ teamDirty: true, rotationDirty: true }), true)?.text).toBe('You have changes to the rotation "A".');
  });
  it('warns, without offering to save, about a team or rotation that was never saved', () => {
    expect(unsavedWork(state({ activeTeam: undefined, activeRotation: undefined }), false)).toEqual({
      savable: false,
      text: 'You have a team that isn’t saved and a rotation that isn’t saved.',
    });
    expect(unsavedWork(state({ activeRotation: undefined }), true)).toEqual({ savable: false, text: 'You have a rotation that isn’t saved.' });
  });
  it('finds nothing to lose on an empty Setup screen', () => {
    expect(unsavedWork(state({ activeTeam: undefined, activeRotation: undefined, hasTeam: false, hasRotation: false }), false)).toBeUndefined();
  });
});
