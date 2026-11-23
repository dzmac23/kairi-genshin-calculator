// If a screen hits an unexpected error (for example from damaged saved data), show a short message
// instead of a blank page. Switching tabs gives the screen a fresh start.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { addProblem } from '../problems/log';
import { ProblemActions } from '../problems/ProblemActions';

type State = { error?: Error; problemId?: string };

export default class ErrorBoundary extends Component<{ children: ReactNode; screen: string }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`The ${this.props.screen} screen hit an error:`, error);
    // Kept in the problem log, so it can be sent as a report (Home → Problem reports).
    void addProblem({
      kind: 'screen',
      where: `${this.props.screen} screen`,
      message: error.message,
      details: [error.stack, info.componentStack && `Where in the screen:${info.componentStack}`].filter(Boolean).join('\n'),
    }).then((problemId) => this.setState({ problemId }));
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="card">
        <h2>Something went wrong on this screen</h2>
        <p className="small">
          The {this.props.screen} screen hit an unexpected error. Your saved teams, runs and settings are not affected.
          Try again, or switch to another tab and back.
        </p>
        <p className="small muted">Details: {this.state.error.message}</p>
        <button onClick={() => this.setState({ error: undefined, problemId: undefined })}>Try again</button>
        <p className="small muted">A report was kept on this device. To help fix it, send it along:</p>
        <ProblemActions id={this.state.problemId} />
      </section>
    );
  }
}
