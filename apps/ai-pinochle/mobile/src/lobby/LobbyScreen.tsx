import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CreateResponse, JoinResponse } from "@pinochle/shared";
import { useAuth } from "../auth/AuthContext";
import { postAuth, ApiError } from "../api/client";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Lobby">;

export function LobbyScreen({ navigation }: Props) {
  const { user, token, logout } = useAuth();

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");

  async function handleCreate() {
    setCreateLoading(true);
    setCreateError("");
    try {
      const data = await postAuth<CreateResponse>(
        "/games/create",
        {},
        token!,
      );
      navigation.navigate("Room", { roomCode: data.room_code });
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.detail : "Failed to create room",
      );
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinLoading(true);
    setJoinError("");
    try {
      await postAuth<JoinResponse>(`/games/${code}/join`, {}, token!);
      navigation.navigate("Room", { roomCode: code });
    } catch (err) {
      setJoinError(
        err instanceof ApiError ? err.detail : "Failed to join room",
      );
    } finally {
      setJoinLoading(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.header}>
        Welcome, {user!.email ?? user!.username}!
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create Room</Text>
        <TouchableOpacity
          style={[styles.button, createLoading && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={createLoading}
        >
          <Text style={styles.buttonText}>
            {createLoading ? "Creating..." : "Create Room"}
          </Text>
        </TouchableOpacity>
        {createError !== "" && (
          <Text style={styles.error}>{createError}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Join Room</Text>
        <View style={styles.joinRow}>
          <TextInput
            style={styles.input}
            placeholder="Room code"
            placeholderTextColor="#888"
            maxLength={4}
            autoCapitalize="characters"
            value={joinCode}
            onChangeText={setJoinCode}
          />
          <TouchableOpacity
            style={[
              styles.button,
              styles.joinButton,
              (joinLoading || !joinCode.trim()) && styles.buttonDisabled,
            ]}
            onPress={handleJoin}
            disabled={joinLoading || !joinCode.trim()}
          >
            <Text style={styles.buttonText}>
              {joinLoading ? "Joining..." : "Join"}
            </Text>
          </TouchableOpacity>
        </View>
        {joinError !== "" && <Text style={styles.error}>{joinError}</Text>}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#fafafa",
  },
  header: {
    fontSize: 18,
    color: "#555",
    marginBottom: 32,
  },
  section: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#213547",
    marginBottom: 12,
  },
  joinRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    color: "#213547",
  },
  button: {
    backgroundColor: "#4a90d9",
    borderRadius: 6,
    padding: 14,
    alignItems: "center",
  },
  joinButton: {
    paddingHorizontal: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    color: "#d32f2f",
    fontSize: 13,
    marginTop: 8,
    backgroundColor: "#fce4ec",
    padding: 8,
    borderRadius: 4,
  },
  logoutButton: {
    marginTop: 16,
    padding: 12,
  },
  logoutText: {
    color: "#4a90d9",
    fontSize: 16,
  },
});
