import { Component, type ReactNode } from "react";

type Props = {
  diffKey: string;
  children: ReactNode;
};

type State = { error: Error | null };

export class DiffViewBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.diffKey !== this.props.diffKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error) {
    console.warn(
      "[DiffView] render failed for",
      this.props.diffKey,
      "-",
      error.message,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="file-diff-error">
          Couldn&apos;t render this diff ({this.state.error.message}). Open the
          file externally to inspect.
        </div>
      );
    }
    return this.props.children;
  }
}
