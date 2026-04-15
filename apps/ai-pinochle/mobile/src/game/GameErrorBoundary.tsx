import React, { Component, type ErrorInfo, type ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";

interface Props {
  children: ReactNode;
  roomCode?: string;
  onLeave: () => void;
}

interface State {
  error: Error | null;
}

// React error boundaries must be class components. Scoped to the game surface
// so a crash in a phase component shows a fallback instead of crashing the
// root and dropping the user back to a blank screen.
export class GameErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // TODO: wire Sentry here (see issue #35).
    console.error("[GameErrorBoundary] Uncaught error in game surface", {
      roomCode: this.props.roomCode,
      error,
      componentStack: info.componentStack,
    });
  }

  handleTryAgain = (): void => {
    this.setState({ error: null });
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
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            The game hit an unexpected error. You can leave the game or try
            again.
          </Text>
          <Text style={styles.details}>{this.state.error.message}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.primary]}
              onPress={this.handleLeave}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Leave game</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondary]}
              onPress={this.handleTryAgain}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a3a1a",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    maxWidth: 480,
    width: "100%",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 8,
  },
  title: {
    color: "#eee",
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    color: "#ccc",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  details: {
    color: "#ff9e9e",
    fontSize: 12,
    backgroundColor: "rgba(244,67,54,0.1)",
    padding: 8,
    borderRadius: 4,
    marginBottom: 16,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    borderWidth: 1,
  },
  primary: {
    backgroundColor: "#2e7d32",
    borderColor: "#2e7d32",
  },
  primaryText: {
    color: "#fff",
    fontSize: 14,
  },
  secondary: {
    backgroundColor: "transparent",
    borderColor: "#555",
  },
  secondaryText: {
    color: "#ddd",
    fontSize: 14,
  },
});
