import { useEffect, useRef, useState } from "react";
import type { Phase, UseGameStateApi, MoonOutcome } from "@pinochle/shared";
import {
  CARDS_PER_PLAYER,
  TEAM_FOR_SEAT,
  detectMoonOutcome,
  getTableOrder,
} from "@pinochle/shared";
import { HandDisplay } from "./HandDisplay.tsx";
import { BiddingPhase } from "./BiddingPhase.tsx";
import { TrumpPhase } from "./TrumpPhase.tsx";
import { MeldPhase } from "./MeldPhase.tsx";
import { TrickPhase } from "./TrickPhase.tsx";
import { PassCardsPhase } from "./PassCardsPhase.tsx";
import { HandResult } from "./HandResult.tsx";
import { GameOverScreen } from "./GameOverScreen.tsx";
import { MoonCelebration } from "./MoonCelebration.tsx";
import { PlayerAvatar } from "./PlayerAvatar.tsx";
import { OtherPlayerHand } from "./OtherPlayerHand.tsx";
import { useHint } from "../hooks/useHint.ts";
import { MuteToggle, RulesDrawer } from "../ui";
import styles from "./GamePage.module.css";

type SendMessage = (msg: Record<string, unknown>) => boolean | void;

interface Props {
  sendMessage: SendMessage;
  connected: boolean;
  game: UseGameStateApi;
  mySeat: string;
  seatPlayers: Record<string, string | null>;
  onLeave: () => void;
  hintsEnabled: boolean;
  roomCode: string;
}

export function GamePage({
  sendMessage,
  connected,
  game,
  mySeat,
  seatPlayers,
  onLeave,
  hintsEnabled,
  roomCode,
}: Props) {
  const {
    state: {
      phase,
      hand,
      biddingState,
      biddingResult,
      trumpSuit,
      meldData,
      acknowledgedSeats,
      error,
      trickNumber,
      currentTrick,
      nextToActSeat,
      legalCards,
      tricksTaken,
      trickScores,
      trickResult,
      handResult,
      handResultAckedSeats,
      passingState,
      gameScores,
      gameOver,
      rematchRequested,
      pendingRematchSeats,
    },
    playCard,
    requestRematch,
    acknowledgeHandResult,
    leaveToLobby,
  } = game;

  // Moon-shot celebration: edge-detect the HAND_COMPLETE transition where
  // `meldData.is_shoot_the_moon` is true. Same `useRef`-of-previous pattern
  // used by the card animations in PR #54. We hold the outcome in local
  // state so the overlay can outlive a state churn (e.g. an ack arriving
  // mid-celebration) and dismiss itself on its own timer.
  const moonOutcome = detectMoonOutcome(game.state);
  const prevMoonKindRef = useRef<MoonOutcome["kind"]>("none");
  const [activeMoon, setActiveMoon] = useState<
    Extract<MoonOutcome, { kind: "success" } | { kind: "fail" }> | null
  >(null);
  useEffect(() => {
    const prev = prevMoonKindRef.current;
    prevMoonKindRef.current = moonOutcome.kind;
    if (prev !== "none") return; // Already showing / shown for this hand.
    if (moonOutcome.kind === "success" || moonOutcome.kind === "fail") {
      setActiveMoon(moonOutcome);
    }
  }, [moonOutcome]);

  const [showRules, setShowRules] = useState(false);

  // Trick-play hint state lives here so we can pass suggestedCards to
  // HandDisplay (which is rendered in bottomArea, outside TrickPhase).
  const trickHint = useHint(roomCode, hintsEnabled);

  // Clear the trick hint when the trick number advances (new trick).
  const prevTrickRef = useRef(trickNumber);
  useEffect(() => {
    if (trickNumber !== prevTrickRef.current) {
      trickHint.clearHint();
      prevTrickRef.current = trickNumber;
    }
  }, [trickNumber, trickHint.clearHint]);

  const trickSuggestedCards: string[] =
    phase === "TRICK_PLAYING" && trickHint.hint?.suggestion?.card
      ? [trickHint.hint.suggestion.card as string]
      : [];

  // Warn before closing the tab while a game is active.
  useEffect(() => {
    const isActiveGame = phase !== "LOBBY_WAITING" && phase !== "GAME_OVER";
    if (!isActiveGame) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      // Per the HTML spec, calling preventDefault is sufficient in modern
      // browsers, but Chrome/Edge and some older engines still require a
      // non-empty returnValue to actually show the leave-site prompt.
      e.preventDefault();
      e.returnValue = "You are in an active game. Leave anyway?";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [phase]);

  const hasAcknowledged = acknowledgedSeats.includes(mySeat);
  const [bottom, left, top, right] = getTableOrder(mySeat);

  const bottomPlayer = seatPlayers[bottom];
  const leftPlayer = seatPlayers[left];
  const topPlayer = seatPlayers[top];
  const rightPlayer = seatPlayers[right];

  const isTrickPhase = phase === "TRICK_PLAYING" || phase === "HAND_COMPLETE";
  const isMyTurn = nextToActSeat === mySeat && phase === "TRICK_PLAYING";

  function getOtherCardCount(seatLower: string): number {
    if (!isTrickPhase) return CARDS_PER_PLAYER;
    const seatUpper = seatLower.toUpperCase();
    const completedTricks = trickNumber - 1;
    const playedThisTrick = currentTrick.some((c) => c.seat === seatUpper);
    return Math.max(0, CARDS_PER_PLAYER - completedTricks - (playedThisTrick ? 1 : 0));
  }

  return (
    <div className={`${styles.table} ${hintsEnabled ? styles.practiceMode : ""}`}>
      {activeMoon && (
        <MoonCelebration
          outcome={activeMoon}
          onDismiss={() => setActiveMoon(null)}
        />
      )}
      {!connected && (
        <div className={styles.disconnectOverlay} role="status" aria-live="polite">
          <div className={styles.disconnectMessage}>
            Connection lost. Reconnecting...
          </div>
        </div>
      )}
      <div className={styles.statusBar}>
        <span className={styles.phaseLabel}>{hintsEnabled ? `Practice \u2014 ${phaseLabel(phase)}` : phaseLabel(phase)}</span>
        <span
          className={`${styles.connectionDot} ${connected ? styles.dotConnected : styles.dotDisconnected}`}
          aria-label={connected ? "Connected" : "Disconnected"}
          role="status"
        />
        <MuteToggle />
        <button className={styles.leaveButton} onClick={() => setShowRules(true)}>
          Rules
        </button>
        <button className={styles.leaveButton} onClick={onLeave}>
          Leave
        </button>
      </div>

      <div className={styles.topArea} data-seat-origin="top">
        <span className={styles.deckMarker} data-deck-origin aria-hidden="true" />
        <OtherPlayerHand position="top" cardCount={getOtherCardCount(top)} seatLabel={topPlayer ?? undefined} />
        {topPlayer && <PlayerAvatar username={topPlayer} />}
      </div>

      <div className={styles.leftArea} data-seat-origin="left">
        {leftPlayer && <PlayerAvatar username={leftPlayer} />}
        <OtherPlayerHand position="left" cardCount={getOtherCardCount(left)} seatLabel={leftPlayer ?? undefined} />
      </div>

      <div className={styles.centerArea}>
        {error && <p className={styles.error}>{error}</p>}

        {phase === "BIDDING" && (
          <BiddingPhase
            biddingState={biddingState}
            mySeat={mySeat}
            sendMessage={sendMessage}
            hintsEnabled={hintsEnabled}
            roomCode={roomCode}
          />
        )}

        {phase === "NAMING_TRUMP" && biddingResult && (
          <TrumpPhase
            biddingResult={biddingResult}
            isBidWinner={biddingResult.winning_seat === mySeat}
            sendMessage={sendMessage}
            hintsEnabled={hintsEnabled}
            roomCode={roomCode}
          />
        )}

        {phase === "PASSING_CARDS" && passingState && (
          <PassCardsPhase
            hand={hand}
            mySeat={mySeat}
            biddingTeam={passingState.bidding_team}
            submittedSeats={passingState.submitted_seats}
            hasSubmitted={passingState.submitted_seats.includes(mySeat)}
            sendMessage={sendMessage}
            hintsEnabled={hintsEnabled}
            roomCode={roomCode}
          />
        )}

        {phase === "SHOWING_MELD" && meldData && (
          <MeldPhase
            meldData={meldData}
            acknowledgedSeats={acknowledgedSeats}
            hasAcknowledged={hasAcknowledged}
            seatPlayers={seatPlayers}
            sendMessage={sendMessage}
          />
        )}

        {phase === "TRICK_PLAYING" && (
          <TrickPhase
            trickNumber={trickNumber}
            currentTrick={currentTrick}
            nextToActSeat={nextToActSeat}
            tricksTaken={tricksTaken}
            trickScores={trickScores}
            trickResult={trickResult}
            mySeat={mySeat}
            trumpSuit={trumpSuit}
            gameScores={gameScores}
            hintsEnabled={hintsEnabled}
            hint={trickHint.hint}
            hintLoading={trickHint.loading}
            onRequestHint={trickHint.fetchHint}
          />
        )}

        {phase === "HAND_COMPLETE" && handResult && (
          <HandResult
            result={handResult}
            hasAcknowledged={handResultAckedSeats.includes(mySeat)}
            acknowledgedSeats={handResultAckedSeats}
            seatPlayers={seatPlayers}
            onAcknowledge={acknowledgeHandResult}
          />
        )}

        {phase === "GAME_OVER" && gameOver && (
          <GameOverScreen
            winnerTeam={gameOver.winner_team}
            finalScores={gameOver.final_scores}
            myTeam={TEAM_FOR_SEAT[mySeat] ?? "NS"}
            forfeitNote={gameOver.forfeit_note ?? null}
            rematchRequested={rematchRequested}
            pendingSeats={pendingRematchSeats}
            seatPlayers={seatPlayers}
            onRematch={requestRematch}
            onLeaveToLobby={leaveToLobby}
          />
        )}
      </div>

      <div className={styles.rightArea} data-seat-origin="right">
        <OtherPlayerHand position="right" cardCount={getOtherCardCount(right)} seatLabel={rightPlayer ?? undefined} />
        {rightPlayer && <PlayerAvatar username={rightPlayer} />}
      </div>

      <div className={styles.bottomArea} data-seat-origin="bottom">
        {bottomPlayer && <PlayerAvatar username={bottomPlayer} />}
        {phase !== "PASSING_CARDS" && (
          <HandDisplay
            cards={hand}
            trumpSuit={trumpSuit}
            onCardClick={isMyTurn ? playCard : undefined}
            legalCards={isMyTurn ? legalCards : undefined}
            currentTrick={currentTrick}
            suggestedCards={isTrickPhase ? trickSuggestedCards : undefined}
          />
        )}
      </div>
      <RulesDrawer open={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "LOBBY_WAITING":
      return "Waiting for Players";
    case "BIDDING":
      return "Bidding Phase";
    case "NAMING_TRUMP":
      return "Naming Trump";
    case "PASSING_CARDS":
      return "Passing Cards";
    case "SHOWING_MELD":
      return "Showing Melds";
    case "TRICK_PLAYING":
      return "Trick Play";
    case "HAND_COMPLETE":
      return "Hand Complete";
    case "GAME_OVER":
      return "Game Over";
  }
}
