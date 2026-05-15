import { Suspense, lazy, useEffect, useState } from "react";
import type { CreateResponse, JoinResponse } from "@pinochle/shared";
import { useAuth } from "../auth/AuthContext.tsx";
import { postAuth, ApiError } from "../api/client.ts";
import { Loading } from "../ui/Loading.tsx";
import { BrandHeader, Button, TextInput, RulesDrawer } from "../ui";
import styles from "./LobbyPage.module.css";

// RoomPage transitively pulls in the game surface (cards, phase components,
// reducer). MyGamesPage is only opened on demand. Both are lazy so the lobby
// chunk stays small. See issue #14.
const RoomPage = lazy(() =>
  import("../room/RoomPage.tsx").then((m) => ({ default: m.RoomPage })),
);
const MyGamesPage = lazy(() =>
  import("../game/MyGamesPage.tsx").then((m) => ({ default: m.MyGamesPage })),
);
const ReplayPage = lazy(() =>
  import("../game/ReplayPage.tsx").then((m) => ({ default: m.ReplayPage })),
);
const AchievementsPage = lazy(() =>
  import("../game/AchievementsPage.tsx").then((m) => ({ default: m.AchievementsPage })),
);

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

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");

  const [showMyGames, setShowMyGames] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [replayRoomCode, setReplayRoomCode] = useState<string | null>(null);

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

  async function handlePlayVsAI() {
    setAiLoading(true);
    setAiError("");
    try {
      const data = await postAuth<CreateResponse>(
        "/games/create-vs-ai",
        { hints_enabled: true },
        token!,
      );
      enterRoom(data.room_code);
    } catch (err) {
      setAiError(
        err instanceof ApiError ? err.detail : "Failed to start AI game",
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    if (!/^[A-Z]{4}$/.test(code)) {
      setJoinError("Room code must be 4 letters");
      return;
    }
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
      <Suspense fallback={<Loading />}>
        <RoomPage roomCode={roomCode} onLeave={leaveRoom} />
      </Suspense>
    );
  }

  if (replayRoomCode) {
    return (
      <Suspense fallback={<Loading />}>
        <ReplayPage
          roomCode={replayRoomCode}
          onBack={() => setReplayRoomCode(null)}
        />
      </Suspense>
    );
  }

  if (showMyGames) {
    return (
      <Suspense fallback={<Loading />}>
        <MyGamesPage
          onBack={() => setShowMyGames(false)}
          onOpenGame={(code) => {
            setShowMyGames(false);
            enterRoom(code);
          }}
          onReplay={(code) => {
            setShowMyGames(false);
            setReplayRoomCode(code);
          }}
        />
      </Suspense>
    );
  }

  if (showAchievements) {
    return (
      <Suspense fallback={<Loading />}>
        <AchievementsPage onBack={() => setShowAchievements(false)} />
      </Suspense>
    );
  }

  return (
    <div className={styles.container}>
      <BrandHeader
        userName={user!.first_name}
        onLogout={logout}
        extras={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowRules(true)}>
              Rules
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowMyGames(true)}>
              My Games
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAchievements(true)}>
              Achievements
            </Button>
          </>
        }
      />

      <main className={styles.main}>
        <p className={styles.welcome}>Welcome back.</p>

        <div className={styles.sections}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Create Room</h2>
            <Button
              onClick={handleCreate}
              disabled={createLoading}
              block
            >
              {createLoading ? "Creating..." : "Create Room"}
            </Button>
            {createError && (
              <p className="alert alert--error" role="alert">
                {createError}
              </p>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Practice</h2>
            <Button
              onClick={handlePlayVsAI}
              disabled={aiLoading}
              block
            >
              {aiLoading ? "Starting..." : "Practice vs AI"}
            </Button>
            <p className={styles.practiceSubtitle}>Play against bots with hints to help you learn</p>
            {aiError && (
              <p className="alert alert--error" role="alert">
                {aiError}
              </p>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Join Room</h2>
            <div className={styles.joinRow}>
              <label className={styles.srOnly} htmlFor="joinCodeInput">
                Room code
              </label>
              <TextInput
                id="joinCodeInput"
                type="text"
                placeholder="ROOM"
                maxLength={4}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
              />
              <Button
                onClick={handleJoin}
                disabled={joinLoading || !joinCode.trim()}
              >
                {joinLoading ? "Joining..." : "Join"}
              </Button>
            </div>
            {joinError && (
              <p className="alert alert--error" role="alert">
                {joinError}
              </p>
            )}
          </section>
        </div>
      </main>
      <RulesDrawer open={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
}
