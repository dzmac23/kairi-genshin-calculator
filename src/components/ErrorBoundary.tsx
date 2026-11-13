// If a screen hits an unexpected error (for example from damaged saved data), show a short message
// instead of a blank page. Switching tabs gives the screen a fresh start.

import { Component, type ReactNode } from 'react';

type State = { error?: Error };

export default class ErrorBoundary extends Component<{ children: ReactNode; screen: string }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`The ${this.props.screen} screen hit an error:`, error);
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
        <button onClick={() => this.setState({ error: undefined })}>Try again</button>
      </section>
    );
  }
}
