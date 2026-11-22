// The Library: every character, weapon and artifact set in the app's data, to browse and read.
// Pick a kind, search or filter, then tap one to read it (Back returns to the list).

import { useMemo, useState } from 'react';
import { useGameData, type ArtifactSet, type Character, type Weapon } from '../data/gameData';
import { CharacterDetails, SetDetails, WeaponDetails } from '../library/Details';
import { useLibrary } from '../library/library';

type Kind = 'characters' | 'weapons' | 'sets';
const KINDS: { id: Kind; label: string }[] = [
  { id: 'characters', label: 'Characters' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'sets', label: 'Artifact sets' },
];
const ELEMENTS = ['Pyro', 'Hydro', 'Electro', 'Cryo', 'Anemo', 'Geo', 'Dendro'];
const WEAPON_TYPES = ['Sword', 'Claymore', 'Polearm', 'Bow', 'Catalyst'];

/** What's open: a kind and a name. */
export type LibraryItem = { kind: Kind; name: string };

export default function LibraryScreen({ open, onOpen }: { open?: LibraryItem; onOpen: (item?: LibraryItem) => void }) {
  const data = useGameData();
  const lib = useLibrary();
  const [kind, setKind] = useState<Kind>(open?.kind ?? 'characters');
  const [query, setQuery] = useState('');
  const [element, setElement] = useState<string>();
  const [weaponType, setWeaponType] = useState<string>();
  const [rarity, setRarity] = useState<number>();

  const items = useMemo(() => {
    if (!data || !lib) return [];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w));
    if (kind === 'characters') {
      return data.characters.filter(
        (c) =>
          matches(`${c.name} ${c.element} ${c.weapon_type} ${lib.characters[c.name]?.region ?? ''}`) &&
          (!element || c.element === element) &&
          (!weaponType || c.weapon_type === weaponType) &&
          (!rarity || c.rarity === rarity),
      );
    }
    if (kind === 'weapons') {
      return data.weapons.filter(
        (w) => matches(`${w.name} ${w.type} ${w.substat ?? ''}`) && (!weaponType || w.type === weaponType) && (!rarity || w.rarity === rarity),
      );
    }
    return lib.sets.filter((s) => matches(`${s.name} ${s.two_piece} ${s.four_piece}`));
  }, [data, lib, kind, query, element, weaponType, rarity]);

  if (!data || !lib) {
    return (
      <section className="card">
        <h2>Library</h2>
        <p className="muted">Loading the library…</p>
      </section>
    );
  }

  if (open) {
    const character = open.kind === 'characters' ? data.character.get(open.name) : undefined;
    const weapon = open.kind === 'weapons' ? data.weapon.get(open.name) : undefined;
    const set = open.kind === 'sets' ? lib.sets.find((s) => s.name === open.name) : undefined;
    return (
      <>
        <button className="link back-link" onClick={() => onOpen(undefined)}>
          ← Library
        </button>
        <section className="card">
          {character && <CharacterDetails key={character.name} character={character} data={data} lib={lib} />}
          {weapon && <WeaponDetails key={weapon.name} weapon={weapon} lib={lib} />}
          {set && <SetDetails set={set} />}
          {!character && !weapon && !set && <p className="muted">“{open.name}” isn't in the library.</p>}
        </section>
      </>
    );
  }

  const rarities = kind === 'characters' ? [5, 4] : kind === 'weapons' ? [5, 4, 3] : [];
  return (
    <section className="card">
      <h2>Library</h2>
      <div className="segmented library-kinds" role="tablist" aria-label="What to browse">
        {KINDS.map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={kind === k.id}
            className={kind === k.id ? 'selected' : ''}
            onClick={() => {
              setKind(k.id);
              setElement(undefined);
              setRarity(undefined);
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={kind === 'sets' ? 'Search by name or effect (e.g. "Elemental Mastery")' : 'Search by name'}
        aria-label="Search the library"
      />
      {kind !== 'sets' && (
        <details className="library-filter-fold">
          <summary className="small">
            Filter{[element, weaponType, rarity].filter(Boolean).length ? ` (${[element, weaponType, rarity].filter(Boolean).length} on)` : ''}
          </summary>
        <div className="library-filters">
          {kind === 'characters' && <Chips label="Element" options={ELEMENTS} value={element} onChange={setElement} />}
          <Chips label="Weapon" options={WEAPON_TYPES} value={weaponType} onChange={setWeaponType} />
          <Chips label="Rarity" options={rarities.map((r) => `${r}★`)} value={rarity ? `${rarity}★` : undefined} onChange={(v) => setRarity(v ? Number(v[0]) : undefined)} />
        </div>
        </details>
      )}
      <p className="muted small">
        {items.length} {kind === 'sets' ? 'artifact sets' : kind}
      </p>
      <ul className="library-grid">
        {items.map((item) => (
          <li key={item.name}>
            <button className="library-item" onClick={() => onOpen({ kind, name: item.name })}>
              <ItemSummary kind={kind} item={item} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Chips({ label, options, value, onChange }: { label: string; options: string[]; value?: string; onChange: (v?: string) => void }) {
  return (
    <div className="chip-row" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} className={`chip${value === o ? ' selected' : ''}`} aria-pressed={value === o} onClick={() => onChange(value === o ? undefined : o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

function ItemSummary({ kind, item }: { kind: Kind; item: Character | Weapon | ArtifactSet }) {
  if (kind === 'characters') {
    const c = item as Character;
    return (
      <>
        <strong>{c.name}</strong>
        <span className="muted small">
          <span className="rarity">{'★'.repeat(c.rarity)}</span> {c.element} · {c.weapon_type}
        </span>
        {!c.gcsim_key && <span className="badge warn-badge">Not in gcsim yet</span>}
        {c.gcsim_patch && <span className="badge gold">Experimental</span>}
      </>
    );
  }
  if (kind === 'weapons') {
    const w = item as Weapon;
    return (
      <>
        <strong>{w.name}</strong>
        <span className="muted small">
          <span className="rarity">{'★'.repeat(w.rarity)}</span> {w.type}
          {w.substat ? ` · ${w.substat}` : ''}
        </span>
        {!w.gcsim_key && <span className="badge warn-badge">Not in gcsim yet</span>}
        {w.gcsim_patch && <span className="badge gold">Experimental</span>}
      </>
    );
  }
  const s = item as ArtifactSet;
  return (
    <>
      <strong>{s.name}</strong>
      <span className="muted small library-item-effect">{s.two_piece ? `2-piece: ${s.two_piece}` : s.four_piece}</span>
      {!s.gcsim_key && <span className="badge warn-badge">Not in gcsim</span>}
    </>
  );
}
