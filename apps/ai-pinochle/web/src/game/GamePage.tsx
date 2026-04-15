import { useEffect } from "react";
import type { Phase, UseGameStateApi } from "@pinochle/shared";
import {
  CARDS_PER_PLAYER,
  TEAM_FOR_SEAT,
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
import { PlayerAvatar } from "./PlayerAvatar.tsx";
import { OtherPlayerHand } from "./OtherPlayerHand.tsx";
import styles from "./GamePage.module.css";

type SendMessage = (msg: Record<string, unknown>) => boolean | void;

interface Props {
  sendMessage: SendMessage;
  connected: boolean;
  game: UseGameStateApi;
  mySeat: string;
  seatPlayers: Record<string, string | null>;
  onLeave: () => void;
}

export function GamePage({
  sendMessage,
  connected,
  game,
  mySeat,
  seatPlayers,
  onLeave,
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

  // Warn before closing the tab while a game is active.
  useEffect(() => {
    const isActiveGame = phase !== "LOBBY_WAITING" && phase !== "GAME_OVER";
    if (!isActiveGame) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
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
    <div className={styles.table}>
      {!connected && (
        <div className={styles.disconnectOverlay} role="status" aria-live="polite">
          <div className={styles.disconnectMessage}>
            Connection lost. Reconnecting...
          </div>
        </div>
      )}
      <div className={styles.statusBar}>
        <span className={styles.phaseLabel}>{phaseLabel(phase)}</span>
        <span
          className={`${styles.connectionDot} ${connected ? styles.dotConnected : styles.dotDisconnected}`}
          aria-label={connected ? "Connected" : "Disconnected"}
          role="status"
        />
        <button className={styles.leaveButton} onClick={onLeave}>
          Leave
        </button>
      </div>

      <div className={styles.topArea}>
        <OtherPlayerHand position="top" cardCount={getOtherCardCount(top)} seatLabel={topPlayer ?? undefined} />
        {topPlayer && <PlayerAvatar username={topPlayer} />}
      </div>

      <div className={styles.leftArea}>
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
          />
        )}

        {phase === "NAMING_TRUMP" && biddingResult && (
          <TrumpPhase
            biddingResult={biddingResult}
            isBidWinner={biddingResult.winning_seat === mySeat}
            sendMessage={sendMessage}
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

      <div className={styles.rightArea}>
        <OtherPlayerHand position="right" cardCount={getOtherCardCount(right)} seatLabel={rightPlayer ?? undefined} />
        {rightPlayer && <PlayerAvatar username={rightPlayer} />}
      </div>

      <div className={styles.bottomArea}>
        {bottomPlayer && <PlayerAvatar username={bottomPlayer} />}
        {phase !== "PASSING_CARDS" && (
          <HandDisplay
            cards={hand}
            trumpSuit={trumpSuit}
            onCardClick={isMyTurn ? playCard : undefined}
            legalCards={isMyTurn ? legalCards : undefined}
          />
        )}
      </div>
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
