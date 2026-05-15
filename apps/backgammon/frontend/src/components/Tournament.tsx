/**
 * Tournament component — lists tournaments, lets players create/register,
 * and displays a single-elimination bracket visualization.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Player, Tournament as TournamentType, TournamentBracket, TournamentMatch } from "../types/game";
import {
  listTournaments,
  createTournament,
  getTournament,
  registerForTournament,
  startTournament,
  startMatchTable,
} from "../services/api";
import "./styles/Tournament.css";

// How often to refresh the bracket while a participant has an active match.
// Polling is paused when the tab is hidden and stops once the user's tournament
// run is over.
//
// TODO(follow-up): replace polling with a tournament-scoped WebSocket channel
// (e.g. /ws/tournament/{id}) that pushes `match_started` / `match_completed`
// events from tournament_routes.py. Polling is a pragmatic band-aid at current
// scale but costs O(participants) requests per interval.
const TOURNAMENT_POLL_MS = 4000;

// ---------------------------------------------------------------------------
// Tournament List View
// ---------------------------------------------------------------------------

interface TournamentListProps {
  player: Player;
  embedded?: boolean;
}

export function TournamentList({ player, embedded }: TournamentListProps) {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<TournamentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createMaxPlayers, setCreateMaxPlayers] = useState(8);
  const [createMatchPoints, setCreateMatchPoints] = useState(3);
  const [creating, setCreating] = useState(false);

  const loadTournaments = useCallback(async () => {
    try {
      const data = await listTournaments();
      setTournaments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tournaments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const tournament = await createTournament(createName.trim(), createMaxPlayers, createMatchPoints);
      navigate(`/tournament/${tournament.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tournament");
    } finally {
      setCreating(false);
    }
  };

  const statusLabel = (status: string) => {
    if (status === "registering") return <span className="tournament-status registering">Open</span>;
    if (status === "in_progress") return <span className="tournament-status in-progress">In Progress</span>;
    return <span className="tournament-status completed">Completed</span>;
  };

  if (loading) return <div className="tournament-loading">Loading tournaments…</div>;

  return (
    <div className={`tournament-list-page${embedded ? " tournament-list-page--embedded" : ""}`}>
      {!embedded && (
        <div className="tournament-list-header">
          <h2>Tournaments</h2>
          {!player.is_guest && (
            <button className="btn-primary" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Cancel" : "Create Tournament"}
            </button>
          )}
        </div>
      )}
      {embedded && !player.is_guest && (
        <div className="tournament-list-header tournament-list-header--embedded">
          <button className="btn-primary" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "Create Tournament"}
          </button>
        </div>
      )}

      {showCreate && (
        <form className="tournament-create-form" onSubmit={handleCreate}>
          <h3>New Tournament</h3>
          <div className="form-row">
            <label htmlFor="t-name">Name</label>
            <input
              id="t-name"
              type="text"
              maxLength={100}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Sunday Open"
              required
            />
          </div>
          <div className="form-row">
            <label htmlFor="t-max">Max Players</label>
            <select id="t-max" value={createMaxPlayers} onChange={(e) => setCreateMaxPlayers(Number(e.target.value))}>
              {[4, 8, 16, 32].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="t-pts">Match Points</label>
            <select id="t-pts" value={createMatchPoints} onChange={(e) => setCreateMatchPoints(Number(e.target.value))}>
              {[1, 3, 5, 7].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? "Creating…" : "Create"}
          </button>
        </form>
      )}

      {error && <div className="tournament-error">{error}</div>}

      {tournaments.length === 0 ? (
        <p className="tournament-empty">No tournaments yet. Create one to get started!</p>
      ) : (
        <ul className="tournament-items">
          {tournaments.map((t) => (
            <li key={t.id} className="tournament-item" onClick={() => navigate(`/tournament/${t.id}`)}>
              <div className="tournament-item-name">{t.name}</div>
              <div className="tournament-item-meta">
                {statusLabel(t.status)}
                <span className="tournament-item-players">
                  {t.player_count}/{t.max_players} players
                </span>
                <span className="tournament-item-points">Match to {t.match_points}</span>
              </div>
              {t.winner_nickname && (
                <div className="tournament-item-winner">🏆 {t.winner_nickname}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match-ready banner
// ---------------------------------------------------------------------------

interface MatchReadyBannerProps {
  match: TournamentMatch;
  viewerId: string;
  onJoin: (tableId: string) => void;
}

function MatchReadyBanner({ match, viewerId, onJoin }: MatchReadyBannerProps) {
  const opponentName =
    match.player1_id === viewerId ? match.player2_nickname : match.player1_nickname;
  return (
    <div className="tournament-match-ready-banner" role="status">
      <span>
        Your match vs <strong>{opponentName || "opponent"}</strong> is ready.
      </span>
      <button
        className="btn-primary"
        onClick={() => match.table_id && onJoin(match.table_id)}
      >
        Join Now
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tournament Detail / Bracket View
// ---------------------------------------------------------------------------

interface TournamentDetailProps {
  player: Player;
}

export function TournamentDetail({ player }: TournamentDetailProps) {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const navigate = useNavigate();
  const [bracket, setBracket] = useState<TournamentBracket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const data = await getTournament(tournamentId);
      setBracket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tournament");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll only when the viewer is a participant with an active match (pending
  // or playing) — so spectators don't drive needless traffic, and polling stops
  // once the user's tournament run is over. Also pauses when the tab is hidden.
  const shouldPoll = useMemo(() => {
    if (!bracket || bracket.tournament.status !== "in_progress") return false;
    return bracket.matches.some(
      (m) =>
        (m.player1_id === player.id || m.player2_id === player.id) &&
        (m.status === "pending" || m.status === "playing"),
    );
  }, [bracket, player.id]);

  useEffect(() => {
    if (!shouldPoll) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (id === null) id = setInterval(load, TOURNAMENT_POLL_MS); };
    const stop = () => { if (id !== null) { clearInterval(id); id = null; } };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [shouldPoll, load]);

  const handleRegister = async () => {
    if (!tournamentId) return;
    setActionLoading(true);
    setError(null);
    try {
      const data = await registerForTournament(tournamentId);
      setBracket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = async () => {
    if (!tournamentId) return;
    setActionLoading(true);
    setError(null);
    try {
      const data = await startTournament(tournamentId);
      setBracket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start tournament");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePlayMatch = async (match: TournamentMatch) => {
    if (!tournamentId) return;
    setActionLoading(true);
    setError(null);
    try {
      const result = await startMatchTable(tournamentId, match.id);
      navigate(`/game/${result.table_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start match");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="tournament-loading">Loading tournament…</div>;
  if (!bracket) return <div className="tournament-error">{error || "Tournament not found"}</div>;

  const { tournament, entries, matches, total_rounds } = bracket;

  const myLiveMatch = matches.find(
    (m) =>
      m.status === "playing" &&
      m.table_id &&
      (m.player1_id === player.id || m.player2_id === player.id),
  );

  const isRegistered = entries.some((e) => e.player_id === player.id);
  const isCreator = tournament.created_by === player.id;
  const canRegister = tournament.status === "registering" && !isRegistered && !player.is_guest;
  const canStart = isCreator && tournament.status === "registering" && entries.length >= 2;

  // Group matches by round
  const matchesByRound: Record<number, TournamentMatch[]> = {};
  for (let r = 1; r <= total_rounds; r++) {
    matchesByRound[r] = matches.filter((m) => m.round_number === r);
  }

  const roundLabel = (round: number, total: number) => {
    if (round === total) return "Final";
    if (round === total - 1) return "Semi-Final";
    if (round === total - 2) return "Quarter-Final";
    return `Round ${round}`;
  };

  const matchStatusIcon = (status: string) => {
    if (status === "completed") return "✓";
    if (status === "bye") return "—";
    if (status === "playing") return "⚡";
    return "";
  };

  return (
    <div className="tournament-detail-page">
      <button className="btn-back" onClick={() => navigate("/tournament")}>
        ← Tournaments
      </button>

      <div className="tournament-detail-header">
        <h2>{tournament.name}</h2>
        <div className="tournament-detail-meta">
          <span>Match to {tournament.match_points}</span>
          <span>{tournament.player_count}/{tournament.max_players} players</span>
          {tournament.status === "registering" && (
            <span className="tournament-status registering">Registration Open</span>
          )}
          {tournament.status === "in_progress" && (
            <span className="tournament-status in-progress">In Progress</span>
          )}
          {tournament.status === "completed" && (
            <span className="tournament-status completed">Completed</span>
          )}
        </div>
      </div>

      {tournament.winner_nickname && (
        <div className="tournament-winner-banner">
          🏆 Tournament Winner: <strong>{tournament.winner_nickname}</strong>
        </div>
      )}

      {error && <div className="tournament-error">{error}</div>}

      {myLiveMatch && (
        <MatchReadyBanner
          match={myLiveMatch}
          viewerId={player.id}
          onJoin={(tableId) => navigate(`/game/${tableId}`)}
        />
      )}

      <div className="tournament-actions">
        {canRegister && (
          <button className="btn-primary" onClick={handleRegister} disabled={actionLoading}>
            {actionLoading ? "Registering…" : "Register"}
          </button>
        )}
        {canStart && (
          <button className="btn-primary" onClick={handleStart} disabled={actionLoading}>
            {actionLoading ? "Starting…" : "Start Tournament"}
          </button>
        )}
        {tournament.status === "registering" && isRegistered && (
          <span className="registered-badge">✓ Registered</span>
        )}
      </div>

      {/* Registration list */}
      {tournament.status === "registering" && entries.length > 0 && (
        <div className="tournament-entrants">
          <h3>Registered Players ({entries.length}/{tournament.max_players})</h3>
          <ul>
            {entries.map((e) => (
              <li key={e.id} className={e.player_id === player.id ? "self" : ""}>
                {e.player_nickname}
                {e.player_id === player.id && <span className="self-tag"> (you)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bracket visualization */}
      {total_rounds > 0 && (
        <div className="bracket-container">
          <h3>Bracket</h3>
          <div className="bracket" style={{ gridTemplateColumns: `repeat(${total_rounds}, 1fr)` }}>
            {Array.from({ length: total_rounds }, (_, i) => i + 1).map((round) => (
              <div key={round} className="bracket-round">
                <div className="bracket-round-label">{roundLabel(round, total_rounds)}</div>
                {(matchesByRound[round] || []).map((match) => {
                  const isMyMatch =
                    (match.player1_id === player.id || match.player2_id === player.id) &&
                    match.status === "pending" &&
                    match.player1_id !== null &&
                    match.player2_id !== null;

                  return (
                    <div
                      key={match.id}
                      className={`bracket-match ${match.status} ${isMyMatch ? "my-match" : ""}`}
                    >
                      <div className={`bracket-player ${match.winner_id === match.player1_id && match.winner_id ? "winner" : ""}`}>
                        {match.player1_nickname || <span className="tbd">TBD</span>}
                      </div>
                      <div className="bracket-vs">vs {matchStatusIcon(match.status)}</div>
                      <div className={`bracket-player ${match.winner_id === match.player2_id && match.winner_id ? "winner" : ""}`}>
                        {match.player2_nickname || <span className="tbd">TBD</span>}
                      </div>
                      {isMyMatch && (
                        <button
                          className="btn-play-match"
                          onClick={() => handlePlayMatch(match)}
                          disabled={actionLoading}
                        >
                          Play
                        </button>
                      )}
                      {match.status === "playing" && match.table_id && (
                        <button
                          className="btn-play-match watching"
                          onClick={() => navigate(`/game/${match.table_id}`)}
                        >
                          {match.player1_id === player.id || match.player2_id === player.id
                            ? "Join Game"
                            : "Watch"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
