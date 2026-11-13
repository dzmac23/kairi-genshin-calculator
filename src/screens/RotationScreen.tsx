import { useState } from 'react';
import { NumberField, Segmented } from '../components/Fields';
import type { BuildResult } from '../config/build';
import { MAX_ENEMIES, type SimSettings } from '../config/settings';
import type { RotationText, TeamMember, Turn } from '../rotation/notation';
import { DEFAULT_TOKEN_TABLE } from '../rotation/tokens';

type Props = {
  rotation: RotationText;
  onRotationChange: (rotation: RotationText) => void;
  settings: SimSettings;
  onSettingsChange: (s: SimSettings) => void;
  tokenTable: string;
  onTokenTableChange: (text: string) => void;
  members: TeamMember[];
  built?: BuildResult;
  onGoToRun: () => void;
  onGoToTeam: () => void;
};

const EXAMPLES = {
  opener: 'For example: Skirk hE',
  loop: 'For example: Furina E D Q > Escoffier E Q > Shenhe hE Q tE? > Skirk tE N5 Q N5 D N3 C N3 W',
};

export default function RotationScreen(props: Props) {
  const { rotation, onRotationChange, settings, onSettingsChange, tokenTable, onTokenTableChange, members, built } = props;
  const set = (patch: Partial<SimSettings>) => onSettingsChange({ ...settings, ...patch });

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
        <h2>Rotation</h2>
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
          <p className="warn small">
            Your team is empty. <button className="link" onClick={props.onGoToTeam}>Add characters on the Team screen</button> first.
          </p>
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
            <TranslationPreview turns={turns.filter((t) => t.section === section)} />
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Fight settings</h2>
        <div className="stat-grid">
          <NumberField label="Fight length" suffix="s" value={settings.duration} onChange={(v) => set({ duration: v ?? 90 })} />
          <NumberField label="Enemy level" suffix="" value={settings.enemyLevel} onChange={(v) => set({ enemyLevel: v ?? 100 })} />
          <NumberField label="Enemy resistance" suffix="%" value={settings.enemyResist} onChange={(v) => set({ enemyResist: v ?? 10 })} />
        </div>
        <Segmented
          label="Number of enemies"
          value={settings.enemies}
          values={Array.from({ length: MAX_ENEMIES }, (_, i) => i + 1)}
          onChange={(enemies) => set({ enemies })}
        />
        {settings.enemies > 1 && (
          <p className="muted small">
            Extra enemies stand in a line beside the first, 4.1 m apart, so they don't overlap. Small area attacks may not
            reach all of them.
          </p>
        )}
        <label className="toggle">
          <input type="checkbox" checked={settings.randomEnergy} onChange={(e) => set({ randomEnergy: e.target.checked })} />
          <span>
            Random energy particles
            <span className="muted small"> (1 particle every 8 to 12 s, like enemies dropping energy)</span>
          </span>
        </label>
      </section>

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
          <p>Ready. Your team and rotation will be checked by gcsim when you press Run.</p>
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

function TranslationPreview({ turns }: { turns: Turn[] }) {
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
        </li>
      ))}
    </ol>
  );
}
