import { NumberField, Segmented } from '../components/Fields';
import type { BuildResult } from '../config/build';
import { MAX_ENEMIES, type SimSettings } from '../config/settings';
import type { TeamMember } from '../rotation/notation';
import { DEFAULT_TOKEN_TABLE } from '../rotation/tokens';

type Props = {
  rotation: string;
  onRotationChange: (text: string) => void;
  settings: SimSettings;
  onSettingsChange: (s: SimSettings) => void;
  tokenTable: string;
  onTokenTableChange: (text: string) => void;
  members: TeamMember[];
  built?: BuildResult;
  onGoToRun: () => void;
  onGoToTeam: () => void;
};

const EXAMPLE = 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2';

export default function RotationScreen(props: Props) {
  const { rotation, onRotationChange, settings, onSettingsChange, tokenTable, onTokenTableChange, members, built } = props;
  const set = (patch: Partial<SimSettings>) => onSettingsChange({ ...settings, ...patch });

  const addName = (name: string) => {
    const trimmed = rotation.trimEnd();
    const sep = trimmed === '' ? '' : trimmed.endsWith('>') ? ' ' : ' > ';
    onRotationChange(`${trimmed}${sep}${name.split(' (')[0]} `);
  };

  return (
    <>
      <section className="card">
        <h2>Rotation</h2>
        <p className="muted small">
          One turn per character, separated by <code>&gt;</code> or new lines. Start each turn with the character's name
          (any word of it is enough), then their moves: <code>E</code> skill, <code>hE</code> hold skill, <code>Q</code> burst,{' '}
          <code>N5</code> 5 normal attacks, <code>C</code> charged attack, <code>P</code> plunge, <code>d</code> dash, <code>j</code>{' '}
          jump. The rotation repeats until the fight ends.
        </p>
        {members.length > 0 ? (
          <div className="name-chips" aria-label="Add a team member's name">
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
        <textarea
          className="config rotation-input"
          value={rotation}
          onChange={(e) => onRotationChange(e.target.value)}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder={`For example: ${EXAMPLE}`}
          aria-label="Rotation"
        />
        {built && built.translation.turns.length > 0 && <TranslationPreview built={built} />}
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

function TranslationPreview({ built }: { built: BuildResult }) {
  return (
    <ol className="turns" aria-label="Translation preview">
      {built.translation.turns.map((turn, i) => (
        <li key={i} className={turn.error ? 'turn bad' : 'turn'}>
          <div className="turn-tokens">
            <span className={turn.member ? 'turn-name' : 'turn-name bad-token'}>{turn.member?.name ?? turn.text.split(/\s+/)[0]}</span>
            {turn.tokens.map((t, j) => (
              <span key={j} className={t.error ? 'token bad-token' : 'token'}>
                {t.text}
              </span>
            ))}
          </div>
          {turn.gcsim && <code className="turn-gcsim">{turn.gcsim}</code>}
          {turn.error && <p className="warn small">{turn.error}</p>}
          {turn.note && <p className="muted small">{turn.note}</p>}
        </li>
      ))}
    </ol>
  );
}
