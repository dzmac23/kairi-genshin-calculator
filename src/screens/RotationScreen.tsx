import { useState, type ReactNode } from 'react';
import type { BuildResult } from '../config/build';
import type { Special } from '../data/gameData';
import type { Check } from '../rotation/checks';
import type { RotationText, TeamMember, Turn } from '../rotation/notation';
import { DEFAULT_TOKEN_TABLE } from '../rotation/tokens';
import { Confirm } from './SavedTeams';

type Props = {
  rotation: RotationText;
  onRotationChange: (rotation: RotationText) => void;
  /** Empties the Opener and Loop (and unlinks the saved rotation). */
  onClear: () => void;
  /** Clearing would lose unsaved work, so ask first. */
  clearNeedsConfirm: boolean;
  tokenTable: string;
  onTokenTableChange: (text: string) => void;
  members: TeamMember[];
  built?: BuildResult;
  onGoToRun: () => void;
  /** Team members with special rotation mechanics (data/special_mechanics.json). */
  specials?: { name: string; special: Special }[];
  /** Saved-rotation controls shown at the top of the Rotation section. */
  saveBar?: ReactNode;
};

const EXAMPLES = {
  opener: 'For example: Skirk hE',
  loop: 'For example: Furina E D Q > Escoffier E Q > Shenhe hE Q tE? > Skirk tE N5 Q N5 D N3 C N3 W',
};

export default function RotationScreen(props: Props) {
  const { rotation, onRotationChange, tokenTable, onTokenTableChange, members, built } = props;
  const [confirmClear, setConfirmClear] = useState(false);

  // Name chips add to whichever box was used last (the Loop to begin with).
  const [box, setBox] = useState<keyof RotationText>('loop');
  const addName = (name: string) => {
    const trimmed = rotation[box].trimEnd();
    const sep = trimmed === '' ? '' : trimmed.endsWith('>') ? ' ' : ' > ';
    onRotationChange({ ...rotation, [box]: `${trimmed}${sep}${name.split(' (')[0]} ` });
  };
  const turns = built?.translation.turns ?? [];

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Rotation</h2>
          {(rotation.opener.trim() || rotation.loop.trim()) && (
            <button className="secondary small-button" onClick={() => (props.clearNeedsConfirm ? setConfirmClear(true) : props.onClear())}>
              Clear current rotation
            </button>
          )}
        </div>
        {confirmClear && (
          <Confirm
            text="Clear the Opener and Loop? Your unsaved changes to this rotation would be lost. The team stays."
            yes="Clear rotation"
            onYes={() => {
              props.onClear();
              setConfirmClear(false);
            }}
            onNo={() => setConfirmClear(false)}
          />
        )}
        {props.saveBar}
        <p className="muted small">
          One turn per character, separated by <code>&gt;</code> or new lines. Start each turn with the character's name
          (any word of it is enough), then their moves. The <strong>Opener</strong> runs once at the start; the{' '}
          <strong>Loop</strong> repeats until the fight ends.
        </p>
        <NotationHelp />
        {members.length > 0 ? (
          <div className="name-chips" aria-label={`Add a team member's name to the ${box === 'opener' ? 'Opener' : 'Loop'}`}>
            {members.map((m) => (
              <button key={m.name} type="button" className="chip" onClick={() => addName(m.name)}>
                + {m.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="warn small">Your team is empty. Add characters above first.</p>
        )}
        {(['opener', 'loop'] as const).map((section) => (
          <div key={section} className="rotation-box">
            <label className="field-label" htmlFor={`rotation-${section}`}>
              {section === 'opener' ? 'Opener (optional, runs once)' : 'Loop (repeats)'}
            </label>
            <textarea
              id={`rotation-${section}`}
              className={`config rotation-input${section === 'opener' ? ' short-input' : ''}`}
              value={rotation[section]}
              onFocus={() => setBox(section)}
              onChange={(e) => onRotationChange({ ...rotation, [section]: e.target.value })}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={EXAMPLES[section]}
              aria-label={section === 'opener' ? 'Opener' : 'Loop'}
            />
            <TranslationPreview turns={turns.filter((t) => t.section === section)} checks={(built?.checks ?? []).filter((c) => c.section === section)} />
          </div>
        ))}
      </section>

      {props.specials && props.specials.length > 0 && <SpecialCharacters specials={props.specials} checks={built?.checks ?? []} />}

      <section className="card">
        <h2>Shorthand table</h2>
        <details>
          <summary>Edit the shorthand moves</summary>
          <p className="muted small">
            One move per line: <code>code = gcsim action</code>. For one character only, start with their name:{' '}
            <code>Neuvillette: C = charge</code>. Codes are letters only; a number after a code repeats it.
          </p>
          <textarea
            className="config"
            value={tokenTable}
            onChange={(e) => onTokenTableChange(e.target.value)}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="Shorthand table"
          />
          <button className="secondary" onClick={() => onTokenTableChange(DEFAULT_TOKEN_TABLE)} disabled={tokenTable === DEFAULT_TOKEN_TABLE}>
            Reset to default
          </button>
        </details>
      </section>

      <section className="card">
        <h2>Ready to run?</h2>
        {!built ? (
          <p className="muted">Loading game data…</p>
        ) : built.problems.length ? (
          <ul className="problems">
            {built.problems.map((p) => (
              <li key={p} className="warn">
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <p>Ready. Choose the fight settings on the Run screen; gcsim checks everything when you press Run.</p>
        )}
        {built?.notes.map((n) => (
          <p key={n} className="muted small">
            {n}
          </p>
        ))}
        <button className="wide" onClick={props.onGoToRun} disabled={!built?.config}>
          Go to Run
        </button>
      </section>
    </>
  );
}

function NotationHelp() {
  return (
    <details className="notation-help">
      <summary>Notation guide</summary>
      <table className="table">
        <tbody>
          <tr><td><code>E</code> <code>tE</code> <code>hE</code></td><td>skill, tap skill, hold skill</td></tr>
          <tr><td><code>Q</code></td><td>burst</td></tr>
          <tr><td><code>N5</code> <code>C</code> <code>N2C</code></td><td>5 normal attacks, charged attack, 2 normals then a charged</td></tr>
          <tr><td><code>P</code> <code>lP</code></td><td>high plunge, low plunge</td></tr>
          <tr><td><code>D</code> <code>J</code> <code>W</code></td><td>dash, jump, walk</td></tr>
          <tr><td><code>EE</code> <code>E2</code></td><td>skill twice</td></tr>
          <tr><td><code>Q?</code></td><td>burst <strong>only if ready</strong>, otherwise skip it (skill and burst only)</td></tr>
          <tr><td><code>Q@1/2</code></td><td>only in loops 1, 3, 5… (<code>@2/2</code> = loops 2, 4, 6…; <code>@1/3</code> = 1, 4, 7…)</td></tr>
          <tr><td><code>Q@2+</code></td><td>from loop 2 onwards</td></tr>
          <tr><td><code>Q?|E</code></td><td>burst if ready, <strong>otherwise</strong> skill (combine: <code>Q?@1/2|E</code>)</td></tr>
          <tr><td><code>Aim</code></td><td>aimed shot (bows; Chasca, Lyney, Sethos…)</td></tr>
          <tr><td><code>hE(60)</code> <code>hE(2)</code></td><td>options: hold length in frames (Nahida, Navia, Skirk, Jean…) or hold level 2 (Bennett, Yun Jin, Sigewinne)</td></tr>
          <tr><td><code>C(beams=2)</code> <code>E(recast=1)</code></td><td>any gcsim option by name (Sandrone's beams, Fischl's or Mavuika's recast, Neuvillette's <code>C(ticks=5)</code>…)</td></tr>
          <tr><td><code>sE</code></td><td>short hold skill: Kirara, Sayu, Dahlia, Traveler (Geo)</td></tr>
          <tr><td><code>sC</code></td><td>Neuvillette's ordinary (short) Charged Attack</td></tr>
          <tr><td><code>L</code></td><td>Kinich: Loop Shot until his bar is full (<code>Kinich E L E</code>)</td></tr>
          <tr><td><code>M</code></td><td>Mualani: keep surfing until 3 Wave Momentum (<code>Mualani E M N</code>)</td></tr>
          <tr><td><code>! …</code></td><td>a line in gcsim's own language, used exactly as written</td></tr>
        </tbody>
      </table>
      <p className="muted small">
        Loop 1 is the first loop after the Opener. If none of a turn's moves happen in a loop, the whole turn is skipped,
        swap included. Careful with moves that depend on a skipped one: in <code>Kazuha tE? P</code>, if the skill is
        skipped Kazuha isn't in the air, and gcsim stops with "can only be used while airborne".
      </p>
    </details>
  );
}

const LEVEL_LABEL: Record<Check['level'], string> = { stop: 'Stops the run', wait: 'gcsim waits', tip: 'Tip' };

/** Special characters in this team: what's special, how to write it, what to watch out for. */
function SpecialCharacters({ specials, checks }: { specials: { name: string; special: Special }[]; checks: Check[] }) {
  return (
    <section className="card special-card">
      <h2>Special characters in this team</h2>
      <p className="muted small">
        These characters have moves that work differently. The rotation is checked as you type: warnings appear under the
        turn they belong to.
      </p>
      <ul className="special-list">
        {specials.map(({ name, special }) => {
          const mine = checks.filter((c) => c.character === name);
          return (
            <li key={name}>
              <div className="run-name">
                {name}
                {mine.length > 0 && <span className={`badge check-${mine.some((c) => c.level === 'stop') ? 'stop' : mine.some((c) => c.level === 'wait') ? 'wait' : 'tip'}`}> {mine.length} in this rotation</span>}
              </div>
              <p className="small">{special.special}</p>
              <p className="small">
                <strong>How to write it:</strong> <code>{special.howTo}</code>
              </p>
              {special.watch.length > 0 && (
                <ul className="small watch-list">
                  {special.watch.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TranslationPreview({ turns, checks }: { turns: Turn[]; checks: Check[] }) {
  if (turns.length === 0) return null;
  return (
    <ol className="turns" aria-label="Translation preview">
      {turns.map((turn) => (
        <li key={turn.index} className={turn.error ? 'turn bad' : 'turn'}>
          <div className="turn-tokens">
            <span className="turn-index muted small">{turn.index}</span>
            {turn.raw ? (
              <span className="token">gcsim line</span>
            ) : (
              <>
                <span className={turn.member ? 'turn-name' : 'turn-name bad-token'}>{turn.member?.name ?? turn.text.split(/\s+/)[0]}</span>
                {turn.tokens.map((t, j) => (
                  <span key={j} className={t.error ? 'token bad-token' : 'token'}>
                    {t.text}
                  </span>
                ))}
              </>
            )}
          </div>
          {turn.statements?.map((st, j) => (
            <code key={j} className="turn-gcsim">
              {st}
            </code>
          ))}
          {turn.error && <p className="warn small">{turn.error}</p>}
          {turn.note && <p className="muted small">{turn.note}</p>}
          {checks
            .filter((c) => c.index === turn.index)
            .map((c) => (
              <p key={c.message} className={`small check check-${c.level}`}>
                <strong>{LEVEL_LABEL[c.level]}:</strong> {c.message}
              </p>
            ))}
        </li>
      ))}
    </ol>
  );
}
