import { Component, type ReactNode } from "react";

interface State { error: Error | null }

/** Route-level boundary: a crash in one page never white-screens the app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="box box-error" role="alert">
        <strong>Something went wrong on this page.</strong>
        <p className="muted">{this.state.error.message}</p>
        <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
