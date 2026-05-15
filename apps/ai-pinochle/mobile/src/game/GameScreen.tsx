import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import type { Phase, UseGameStateApi, MoonOutcome } from "@pinochle/shared";
import {
  CARDS_PER_PLAYER,
  TEAM_FOR_SEAT,
  detectMoonOutcome,
  getTableOrder,
} from "@pinochle/shared";
import { MoonCelebration } from "./MoonCelebration";
import { HandDisplay } from "./HandDisplay";
import { BiddingPhase } from "./BiddingPhase";
import { TrumpPhase } from "./TrumpPhase";
import { MeldPhase } from "./MeldPhase";
import { TrickPhase } from "./TrickPhase";
import { PassCardsPhase } from "./PassCardsPhase";
import { HandResult } from "./HandResult";
import { GameOverScreen } from "./GameOverScreen";
import { PlayerAvatar } from "./PlayerAvatar";
import { OtherPlayerHand } from "./OtherPlayerHand";

type SendMessage = (msg: Record<string, unknown>) => boolean | void;

interface Props {
  sendMessage: SendMessage;
  connected: boolean;
  game: UseGameStateApi;
  mySeat: string;
  seatPlayers: Record<string, string | null>;
  onLeave: () => void;
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

export function GameScreen({
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

  // Moon-shot celebration: edge-detect HAND_COMPLETE with moon flag set.
  // Mirrors the web GamePage pattern; see web/src/game/GamePage.tsx.
  const moonOutcome = detectMoonOutcome(game.state);
  const prevMoonKindRef = useRef<MoonOutcome["kind"]>("none");
  const [activeMoon, setActiveMoon] = useState<
    Extract<MoonOutcome, { kind: "success" } | { kind: "fail" }> | null
  >(null);
  useEffect(() => {
    const prev = prevMoonKindRef.current;
    prevMoonKindRef.current = moonOutcome.kind;
    if (prev !== "none") return;
    if (moonOutcome.kind === "success" || moonOutcome.kind === "fail") {
      setActiveMoon(moonOutcome);
    }
  }, [moonOutcome]);

  // Lock to landscape on mount, restore portrait on unmount.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

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
    return Math.max(
      0,
      CARDS_PER_PLAYER - completedTricks - (playedThisTrick ? 1 : 0),
    );
  }

  return (
    <SafeAreaView style={styles.table}>
      {activeMoon && (
        <MoonCelebration
          outcome={activeMoon}
          onDismiss={() => setActiveMoon(null)}
        />
      )}
      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.phaseLabel}>{phaseLabel(phase)}</Text>
        <View
          style={[
            styles.connectionDot,
            connected ? styles.dotConnected : styles.dotDisconnected,
          ]}
        />
        {/* TODO: Add navigation blocking to warn the user before leaving a game mid-play (requires React Navigation's beforeRemove event or a similar mechanism). */}
        <TouchableOpacity onPress={onLeave}>
          <Text style={styles.leaveText}>Leave</Text>
        </TouchableOpacity>
      </View>

      {/* Top area - partner */}
      <View style={styles.topArea}>
        <OtherPlayerHand position="top" cardCount={getOtherCardCount(top)} />
        {topPlayer && <PlayerAvatar username={topPlayer} />}
      </View>

      {/* Middle row: left, center, right */}
      <View style={styles.middleRow}>
        {/* Left area */}
        <View style={styles.sideArea}>
          {leftPlayer && <PlayerAvatar username={leftPlayer} />}
          <OtherPlayerHand
            position="left"
            cardCount={getOtherCardCount(left)}
          />
        </View>

        {/* Center area */}
        <View style={styles.centerArea}>
          {error && <Text style={styles.error}>{error}</Text>}

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
        </View>

        {/* Right area */}
        <View style={styles.sideArea}>
          <OtherPlayerHand
            position="right"
            cardCount={getOtherCardCount(right)}
          />
          {rightPlayer && <PlayerAvatar username={rightPlayer} />}
        </View>
      </View>

      {/* Bottom area - player's hand */}
      <View style={styles.bottomArea}>
        {bottomPlayer && <PlayerAvatar username={bottomPlayer} />}
        {phase !== "PASSING_CARDS" && (
          <HandDisplay
            cards={hand}
            trumpSuit={trumpSuit}
            onCardClick={isMyTurn ? playCard : undefined}
            legalCards={isMyTurn ? legalCards : undefined}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  table: {
    flex: 1,
    backgroundColor: "#1a3a1a",
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  phaseLabel: {
    color: "#ccc",
    fontSize: 13,
    flex: 1,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotConnected: {
    backgroundColor: "#4caf50",
  },
  dotDisconnected: {
    backgroundColor: "#f44336",
  },
  leaveText: {
    color: "#f44336",
    fontSize: 13,
  },
  topArea: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 6,
  },
  middleRow: {
    flex: 1,
    flexDirection: "row",
  },
  sideArea: {
    width: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  centerArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  bottomArea: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 8,
    gap: 6,
  },
  error: {
    color: "#f44336",
    fontSize: 13,
    backgroundColor: "rgba(244,67,54,0.15)",
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
});
