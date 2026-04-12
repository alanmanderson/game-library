/**
 * Root application component.
 *
 * Sets up client-side routing and manages player identity persistence.
 * Supports JWT-based authentication with register/login, Google OAuth,
 * and guest mode. On mount, validates any existing token with /api/auth/me.
 */

import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import type { Player } from "./types/game";
import { getMe, getStoredToken, clearStoredToken } from "./services/api";
import { STORAGE_KEY } from "./constants";
import Home from "./components/Home";
import Game from "./components/Game";
import AuthModal from "./components/AuthModal";
import { TournamentList, TournamentDetail } from "./components/Tournament";

function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, try to restore the player from the JWT token
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const token = getStoredToken();
        if (!token) {
          setLoading(false);
          return;
        }

        // Validate the token with the backend
        const verified = await getMe();
        if (!cancelled) {
          setPlayer(verified);
          // Update localStorage player cache
          localStorage.setItem(STORAGE_KEY, JSON.stringify(verified));
        }
      } catch {
        // Token invalid or expired; clear and re-prompt
        clearStoredToken();
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    restore();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthenticated = (newPlayer: Player) => {
    setPlayer(newPlayer);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newPlayer));
  };

  if (loading) {
    return (
      <div className="app">
        <div className="landing">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {!player && <AuthModal onAuthenticated={handleAuthenticated} />}

      <Routes>
        <Route
          path="/"
          element={
            player ? (
              <Home player={player} />
            ) : (
              <div className="landing">
                <h1>Backgammon Online</h1>
                <p>Please sign in or continue as a guest to play.</p>
              </div>
            )
          }
        />
        <Route path="/game/:tableId" element={<Game key={player?.id} />} />
        <Route
          path="/tournament"
          element={
            player ? (
              <TournamentList player={player} />
            ) : (
              <div className="landing">
                <h1>Backgammon Online</h1>
                <p>Please sign in to view tournaments.</p>
              </div>
            )
          }
        />
        <Route
          path="/tournament/:tournamentId"
          element={
            player ? (
              <TournamentDetail player={player} />
            ) : (
              <div className="landing">
                <h1>Backgammon Online</h1>
                <p>Please sign in to view this tournament.</p>
              </div>
            )
          }
        />
      </Routes>
    </div>
  );
}

export default App;
