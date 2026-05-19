import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./GameErrorBoundary.module.css";
import { logService } from "../logservice";

interface Props {
  children: ReactNode;
  roomCode?: string;
  onLeave: () => void;
}

interface State {
  error: Error | null;
}

// React error boundaries must be class components — there is no hook equivalent
// as of React 19. Keeping this scoped to the game surface so a crash in a phase
// component doesn't white-screen the whole app.
export class GameErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logService.error(error.message, {
      error_type: error.name,
      stack_trace: error.stack,
      context: {
        roomCode: this.props.roomCode,
        componentStack: info.componentStack,
      },
    });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleLeave = (): void => {
    this.setState({ error: null });
    this.props.onLeave();
  };

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className={styles.container} role="alert">
        <div className={styles.card}>
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.message}>
            The game hit an unexpected error. You can return to the lobby or
            reload to try again.
          </p>
          <pre className={styles.details}>{this.state.error.message}</pre>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={this.handleLeave}
            >
              Return to lobby
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={this.handleReload}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
