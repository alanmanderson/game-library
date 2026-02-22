import { useState } from "react";
import { useAuth } from "../auth/AuthContext.tsx";
import { postAuth, ApiError } from "../api/client.ts";
import styles from "./LobbyPage.module.css";

interface CreateResponse {
  room_code: string;
}

interface JoinResponse {
  room_code: string;
  seats: Record<string, string | null>;
}

export function LobbyPage() {
  const { user, token, logout } = useAuth();

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdCode, setCreatedCode] = useState("");

  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinResult, setJoinResult] = useState<JoinResponse | null>(null);

  async function handleCreate() {
    setCreateLoading(true);
    setCreateError("");
    setCreatedCode("");
    try {
      const data = await postAuth<CreateResponse>(
        "/games/create",
        {},
        token!,
      );
      setCreatedCode(data.room_code);
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
    setJoinResult(null);
    try {
      const data = await postAuth<JoinResponse>(
        `/games/${code}/join`,
        {},
        token!,
      );
      setJoinResult(data);
    } catch (err) {
      setJoinError(
        err instanceof ApiError ? err.detail : "Failed to join room",
      );
    } finally {
      setJoinLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <p className={styles.header}>Welcome, {user!.email ?? user!.username}!</p>

      <div className={styles.sections}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Create Room</h2>
          <button
            className={styles.button}
            onClick={handleCreate}
            disabled={createLoading}
          >
            {createLoading ? "Creating..." : "Create Room"}
          </button>
          {createError && <p className={styles.error}>{createError}</p>}
          {createdCode && (
            <p className={styles.success}>
              Room created:{" "}
              <span className={styles.roomCode}>{createdCode}</span>
            </p>
          )}
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Join Room</h2>
          <div className={styles.joinRow}>
            <input
              className={styles.input}
              type="text"
              placeholder="Room code"
              maxLength={4}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <button
              className={styles.button}
              onClick={handleJoin}
              disabled={joinLoading || !joinCode.trim()}
            >
              {joinLoading ? "Joining..." : "Join"}
            </button>
          </div>
          {joinError && <p className={styles.error}>{joinError}</p>}
          {joinResult && (
            <p className={styles.success}>
              Joined room{" "}
              <span className={styles.roomCode}>{joinResult.room_code}</span>
            </p>
          )}
        </div>
      </div>

      <button className={styles.logoutButton} onClick={logout}>
        Log out
      </button>
    </div>
  );
}
