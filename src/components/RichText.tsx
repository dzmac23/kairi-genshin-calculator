// Text from the game data with **highlights** and line breaks, as paragraphs.
import { Fragment } from 'react';

export default function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`rich-text${className ? ` ${className}` : ''}`}>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {para.split('\n').map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {line.split('**').map((part, k) => (k % 2 ? <strong key={k}>{part}</strong> : <Fragment key={k}>{part}</Fragment>))}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
