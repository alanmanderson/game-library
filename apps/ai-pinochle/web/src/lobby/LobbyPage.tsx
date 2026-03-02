import { useEffect, useState } from "react";
import type { CreateResponse, JoinResponse } from "@pinochle/shared";
import { useAuth } from "../auth/AuthContext.tsx";
import { postAuth, ApiError } from "../api/client.ts";
import { RoomPage } from "../room/RoomPage.tsx";
import { MyGamesPage } from "../game/MyGamesPage.tsx";
import styles from "./LobbyPage.module.css";

function extractRoomCode(pathname: string): string {
  const match = pathname.match(/^\/([A-Z]{4})$/);
  return match ? match[1] : "";
}

export function LobbyPage() {
  const { user, token, logout } = useAuth();

  const [roomCode, setRoomCode] = useState(() => {
    const pathCode = extractRoomCode(window.location.pathname);
    if (pathCode) return pathCode;
    return sessionStorage.getItem("roomCode") ?? "";
  });

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");

  const [showMyGames, setShowMyGames] = useState(false);

  async function handleCreate() {
    setCreateLoading(true);
    setCreateError("");
    try {
      const data = await postAuth<CreateResponse>(
        "/games/create",
        {},
        token!,
      );
      enterRoom(data.room_code);
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
      const data = await postAuth<JoinResponse>(
        `/games/${code}/join`,
        {},
        token!,
      );
      enterRoom(data.room_code);
    } catch (err) {
      setJoinError(
        err instanceof ApiError ? err.detail : "Failed to join room",
      );
    } finally {
      setJoinLoading(false);
    }
  }

  function enterRoom(code: string) {
    sessionStorage.setItem("roomCode", code);
    setRoomCode(code);
    window.history.pushState(null, "", `/${code}`);
  }

  function leaveRoom() {
    sessionStorage.removeItem("roomCode");
    setRoomCode("");
    window.history.pushState(null, "", "/");
  }

  // Handle browser back/forward navigation
  useEffect(() => {
    function handlePopState() {
      const code = extractRoomCode(window.location.pathname);
      if (code) {
        sessionStorage.setItem("roomCode", code);
        setRoomCode(code);
      } else {
        sessionStorage.removeItem("roomCode");
        setRoomCode("");
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Sync URL when restoring from sessionStorage
  useEffect(() => {
    const urlCode = extractRoomCode(window.location.pathname);
    if (roomCode && !urlCode) {
      window.history.replaceState(null, "", `/${roomCode}`);
    }
  }, []);

  if (roomCode) {
    return (
      <RoomPage roomCode={roomCode} onLeave={leaveRoom} />
    );
  }

  if (showMyGames) {
    return (
      <MyGamesPage
        onBack={() => setShowMyGames(false)}
        onOpenGame={(code) => {
          setShowMyGames(false);
          enterRoom(code);
        }}
      />
    );
  }

  return (
    <div className={styles.container}>
      <p className={styles.header}>Welcome, {user!.first_name}!</p>

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
        </div>
      </div>

      <button className={styles.myGamesButton} onClick={() => setShowMyGames(true)}>
        My Games
      </button>

      <button className={styles.logoutButton} onClick={logout}>
        Log out
      </button>
    </div>
  );
}
