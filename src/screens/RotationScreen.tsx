import { useState, type ReactNode } from 'react';
import type { BuildResult } from '../config/build';
import type { Special } from '../data/gameData';
import type { Check } from '../rotation/checks';
import { rotationBoxes, rotationName, type RotationText, type TeamMember, type Turn } from '../rotation/notation';
import { DEFAULT_TOKEN_TABLE } from '../rotation/tokens';
import { Confirm } from './SavedTeams';

type Props = {
  rotation: RotationText;
  onRotationChange: (rotation: RotationText) => void;
  /** Empties the Start of fight and the rotations (and unlinks the saved rotation). */
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
  alternate: 'For example: Furina E D > Escoffier E Q > Shenhe hE Q > Skirk tE N5 Q N5 D N3 C',
};
/** How many rotations can take turns. */
const MAX_ROTATIONS = 6;

/** A box: the Start of fight, or a rotation (0 = A). */
type Box = 'opener' | number;

export default function RotationScreen(props: Props) {
  const { rotation, onRotationChange, tokenTable, onTokenTableChange, members, built } = props;
  const [confirmClear, setConfirmClear] = useState(false);

  // Name chips add to whichever box was used last (Rotation A to begin with).
  const [box, setBox] = useState<Box>(0);
  const boxes = rotationBoxes(rotation);
  const textOf = (b: Box) => (b === 'opener' ? rotation.opener : (boxes[b] ?? ''));
  const setText = (b: Box, text: string) => {
    if (b === 'opener') return onRotationChange({ ...rotation, opener: text });
    if (b === 0) return onRotationChange({ ...rotation, loop: text });
    const alternates = [...(rotation.alternates ?? [])];
    alternates[b - 1] = text;
    onRotationChange({ ...rotation, alternates });
  };
  const addRotation = () => {
    onRotationChange({ ...rotation, alternates: [...(rotation.alternates ?? []), ''] });
    setBox(boxes.length);
  };
  const removeRotation = (b: number) => {
    const alternates = (rotation.alternates ?? []).filter((_, i) => i !== b - 1);
    onRotationChange({ ...rotation, alternates });
    setBox(0);
  };
  const addName = (name: string) => {
    const trimmed = textOf(box).trimEnd();
    const sep = trimmed === '' ? '' : trimmed.endsWith('>') ? ' ' : ' > ';
    setText(box, `${trimmed}${sep}${name.split(' (')[0]} `);
  };
  const boxLabel = (b: Box) => (b === 'opener' ? 'the Start of fight' : boxes.length > 1 ? rotationName(b) : 'the Rotation');
  const [openerOpen, setOpenerOpen] = useState(!!rotation.opener.trim());
  const turns = built?.translation.turns ?? [];

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Rotation</h2>
          {(rotation.opener.trim() || boxes.some((b) => b.trim())) && (
            <button className="secondary small-button" onClick={() => (props.clearNeedsConfirm ? setConfirmClear(true) : props.onClear())}>
              Clear current rotation
            </button>
          )}
        </div>
        {confirmClear && (
          <Confirm
            text="Clear the Start of fight and every rotation? Your unsaved changes to this rotation would be lost. The team stays."
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
          (any word of it is enough), then their moves. The <strong>Rotation</strong> repeats until the fight ends. When
          your rotations differ (for example, someone bursts every other rotation), add an alternate rotation: they take
          turns, A, B, A, B…
        </p>
        <NotationHelp />
        {members.length > 0 ? (
          <div className="name-chips" aria-label={`Add a team member's name to ${boxLabel(box)}`}>
            {members.map((m) => (
              <button key={m.name} type="button" className="chip" onClick={() => addName(m.name)}>
                + {m.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="warn small">Your team is empty. Add characters above first.</p>
        )}
        <details className="rotation-box opener-box" open={openerOpen} onToggle={(e) => setOpenerOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="field-label">Start of fight (optional, runs once){rotation.opener.trim() && !openerOpen ? ': ' + rotation.opener.trim().split('\n')[0] : ''}</summary>
          <p className="muted small">Moves done only once, before the rotation starts repeating: for example the first round of bursts.</p>
          <RotationInput
            id="rotation-opener"
            label="Start of fight"
            value={rotation.opener}
            placeholder={EXAMPLES.opener}
            short
            onFocus={() => setBox('opener')}
            onChange={(t) => setText('opener', t)}
          />
          <TranslationPreview turns={turns.filter((t) => t.section === 'opener')} checks={(built?.checks ?? []).filter((c) => c.section === 'opener')} />
        </details>
        {boxes.map((text, b) => {
          const label = boxes.length > 1 ? rotationName(b) : 'Rotation';
          const loopTurns = turns.filter((t) => t.section === 'loop' && (t.rotation ?? 0) === b);
          const indexes = new Set(loopTurns.map((t) => t.index));
          return (
            <div key={b} className="rotation-box">
              <div className="rotation-box-head">
                <label className="field-label" htmlFor={`rotation-${b}`}>
                  {label} {boxes.length > 1 ? <span className="muted small">(takes turns with the others)</span> : <span className="muted small">(repeats)</span>}
                </label>
                {b > 0 && (
                  <button type="button" className="link small" onClick={() => removeRotation(b)}>
                    Remove
                  </button>
                )}
              </div>
              <RotationInput
                id={`rotation-${b}`}
                label={label}
                value={text}
                placeholder={b === 0 ? EXAMPLES.loop : EXAMPLES.alternate}
                onFocus={() => setBox(b)}
                onChange={(t) => setText(b, t)}
              />
              <TranslationPreview turns={loopTurns} checks={(built?.checks ?? []).filter((c) => c.section === 'loop' && indexes.has(c.index))} />
            </div>
          );
        })}
        {boxes.length < MAX_ROTATIONS && (
          <button type="button" className="secondary small-button" onClick={addRotation}>
            + Add alternate rotation ({rotationName(boxes.length)})
          </button>
        )}
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

function RotationInput(p: { id: string; label: string; value: string; placeholder: string; short?: boolean; onFocus: () => void; onChange: (text: string) => void }) {
  return (
    <textarea
      id={p.id}
      className={`config rotation-input${p.short ? ' short-input' : ''}`}
      value={p.value}
      onFocus={p.onFocus}
      onChange={(e) => p.onChange(e.target.value)}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      placeholder={p.placeholder}
      aria-label={p.label}
    />
  );
}

function NotationHelp() {
  return (
    <details className="notation-help">
      <summary>Notation guide</summary>
      <table className="table">
        <tbody>
          <tr><td><code>E</code> <code>tE</code> <code>hE</code> <code>fE</code></td><td>skill: tap, tap, hold, full hold</td></tr>
          <tr><td><code>Q</code></td><td>burst</td></tr>
          <tr><td><code>N5</code> <code>C</code> <code>N2C</code></td><td>5 normal attacks, charged attack, 2 normals then a charged</td></tr>
          <tr><td><code>P</code> <code>lP</code></td><td>plunge, low plunge</td></tr>
          <tr><td><code>D</code> <code>J</code> <code>W</code> <code>Aim</code></td><td>dash, jump, walk, aimed shot</td></tr>
          <tr><td><code>E2</code> <code>EE</code></td><td>skill twice</td></tr>
          <tr><td><code>Q?</code></td><td>burst <strong>only if ready</strong>, otherwise skip it</td></tr>
          <tr><td><code>Q/E</code> <code>Q/N3</code></td><td><code>/</code> means <strong>otherwise</strong>: burst if ready, otherwise skill (or 3 normal attacks)</td></tr>
          <tr><td><code>Fill</code></td><td>Kinich, Zibai, Mualani: keep going until the special move is ready (<code>Kinich E Fill E</code>, <code>Mualani E Fill N</code>)</td></tr>
        </tbody>
      </table>
      <p className="muted small">
        Upper or lower case doesn't matter. The small letter in front says how: <strong>t</strong>ap,{' '}
        <strong>h</strong>old, <strong>f</strong>ull hold, <strong>s</strong>hort hold, <strong>l</strong>ow. Different
        moves in different rotations? Use <strong>+ Add alternate rotation</strong>: Rotations A, B… take turns.
      </p>
      <details>
        <summary>Holds and character options</summary>
        <table className="table">
          <tbody>
            <tr><td><code>hE(1.5s)</code></td><td>hold for a time (Nahida, Navia, Skirk, Jean, Kirara, Sayu, Lan Yan…). <code>fE</code> is the longest hold; for Bennett, Yun Jin and Sigewinne it's level 2.</td></tr>
            <tr><td><code>sE</code></td><td>short hold: Kirara, Sayu, Dahlia, Traveler (Geo)</td></tr>
            <tr><td><code>sC</code></td><td>Neuvillette's ordinary (short) Charged Attack</td></tr>
            <tr><td><code>hC</code> <code>fC</code></td><td>Nefer's held Charged Attack (Slither), also with a time: <code>hC(1s)</code></td></tr>
            <tr><td><code>F</code></td><td>Mavuika's Finisher: ends her bike Charged Attack chain (<code>Mavuika hE C3 F</code>). Stopping the chain without it also ends in the Finisher, a moment later.</td></tr>
            <tr><td><code>C(beams=2)</code> <code>E(recast=1)</code></td><td>other gcsim options by name: Sandrone's beams, Fischl's or Mavuika's recast, Neuvillette's <code>C(ticks=5)</code>, Yun Jin's <code>E(perfect=1)</code>…</td></tr>
          </tbody>
        </table>
        <p className="muted small">
          Kinich and Zibai: you can also write exact attacks, like <code>Kinich E N4 E</code>. If the bar isn't full yet
          when you press E, the app adds attacks until it is, and Results says how often that happened.
        </p>
      </details>
      <details>
        <summary>Advanced</summary>
        <table className="table">
          <tbody>
            <tr><td><code>! …</code></td><td>a line in gcsim's own language, used exactly as written</td></tr>
            <tr><td><code>attack:3</code> <code>skill[hold=1]</code></td><td>gcsim actions, used as written</td></tr>
          </tbody>
        </table>
        <p className="muted small">
          If none of a turn's moves happen (all of them under <code>?</code>), the whole turn is skipped, swap included.
          Careful with moves that depend on a skipped one: in <code>Kazuha tE? P</code>, if the skill is skipped Kazuha
          isn't in the air, and gcsim stops with "can only be used while airborne". The codes themselves are in the
          shorthand table below, which you can edit.
        </p>
      </details>
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
            <span className="turn-index muted small">{turn.position}</span>
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
