// "ⓘ About …": a fold under a choice on the Setup screen that shows its Library entry, tailored to
// the build, without leaving Setup. The library text loads the first time a panel opens.

import { useState, type ReactNode } from 'react';
import { useLibrary, type Library, type LibraryItem } from './library';

export default function InfoPanel({
  item,
  render,
  onOpenLibrary,
}: {
  item: LibraryItem;
  /** The panel's content, once the library has loaded. */
  render: (lib: Library) => ReactNode;
  /** Opens the full entry in the Library tab. */
  onOpenLibrary?: (item: LibraryItem) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`info-panel${open ? ' open' : ''}`}>
      <button type="button" className="link small info-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        ⓘ {open ? 'Hide' : 'About'} {item.name}
      </button>
      {open && (
        <div className="info-body">
          <Loaded render={render} />
          {onOpenLibrary && (
            <button type="button" className="link small" onClick={() => onOpenLibrary(item)}>
              Open in Library →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Loaded({ render }: { render: (lib: Library) => ReactNode }) {
  const lib = useLibrary();
  return lib ? <>{render(lib)}</> : <p className="muted small">Loading…</p>;
}
