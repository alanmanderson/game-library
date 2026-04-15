import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import type {
  Phase,
  WsEvent,
  WsAction,
  BiddingState,
  BiddingResult,
  MeldData,
  CardPlayed,
  TrickResult,
  HandResultData,
  PassingState,
} from "@pinochle/shared";
import { CARDS_PER_PLAYER, getTableOrder, sendAction } from "@pinochle/shared";
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
import { TEAM_FOR_SEAT } from "@pinochle/shared";

type SendMessage = (msg: Record<string, unknown>) => boolean | void;

interface Props {
  sendMessage: SendMessage;
  lastEvent: WsEvent | null;
  connected: boolean;
  roomCode: string;
  mySeat: string;
  initialHand: string[];
  seatPlayers: Record<string, string | null>;
  onLeave: () => void;
}

function send(sendMessage: SendMessage, action: WsAction): void {
  sendAction(sendMessage, action);
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
  lastEvent,
  connected,
  mySeat,
  initialHand,
  seatPlayers,
  onLeave,
}: Props) {
  const [phase, setPhase] = useState<Phase>("BIDDING");
  const [hand, setHand] = useState<string[]>(initialHand);
  const [biddingState, setBiddingState] = useState<BiddingState>({
    current_highest_bid: null,
    highest_bidder_seat: null,
    next_to_act_seat: "",
    minimum_valid_bid: 25,
  });
  const [biddingResult, setBiddingResult] = useState<BiddingResult | null>(
    null,
  );
  const [trumpSuit, setTrumpSuit] = useState<string | null>(null);
  const [meldData, setMeldData] = useState<MeldData | null>(null);
  const [acknowledgedSeats, setAcknowledgedSeats] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Trick play state
  const [trickNumber, setTrickNumber] = useState(1);
  const [currentTrick, setCurrentTrick] = useState<CardPlayed[]>([]);
  const [nextToActSeat, setNextToActSeat] = useState<string | null>(null);
  const [legalCards, setLegalCards] = useState<string[]>([]);
  const [tricksTaken, setTricksTaken] = useState<Record<string, number>>({
    NS: 0,
    EW: 0,
  });
  const [trickScores, setTrickScores] = useState<Record<string, number>>({
    NS: 0,
    EW: 0,
  });
  const [trickResult, setTrickResult] = useState<TrickResult | null>(null);
  const [handResult, setHandResult] = useState<HandResultData | null>(null);
  const [handResultAckedSeats, setHandResultAckedSeats] = useState<string[]>(
    [],
  );
  const [passingState, setPassingState] = useState<PassingState | null>(null);
  const [gameScores, setGameScores] = useState<Record<string, number>>({ NS: 0, EW: 0 });
  const [gameOver, setGameOver] = useState<{ winner_team: string; final_scores: Record<string, number>; forfeit_note?: string } | null>(null);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [pendingRematchSeats, setPendingRematchSeats] = useState<string[]>([]);

  const trickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCardRef = useRef<{ card: string; handSnapshot: string[] } | null>(null);

  function cancelTrickTimer() {
    if (trickTimerRef.current !== null) {
      clearTimeout(trickTimerRef.current);
      trickTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => cancelTrickTimer();
  }, []);

  useEffect(() => {
    if (errorTimerRef.current !== null) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    if (error !== null) {
      errorTimerRef.current = setTimeout(() => {
        setError(null);
        errorTimerRef.current = null;
      }, 5000);
    }
    return () => {
      if (errorTimerRef.current !== null) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [error]);

  // Lock to landscape when game screen mounts, restore portrait on unmount
  useEffect(() => {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    );
    return () => {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      );
    };
  }, []);

  useEffect(() => {
    if (!lastEvent) return;

    switch (lastEvent.event) {
      case "ERROR": {
        const p = lastEvent.payload;
        if (p.code === "ALREADY_REQUESTED_REMATCH") return;
        setError(p.message);
        if (pendingCardRef.current) {
          setHand(pendingCardRef.current.handSnapshot);
          setLegalCards([]); // keep disabled until next YOUR_TURN
          pendingCardRef.current = null;
        }
        if (p.code === "REMATCH_NOT_AVAILABLE") {
          setRematchRequested(false);
        }
        return;
      }

      case "HAND_DEALT": {
        setError(null);
        setHand(lastEvent.payload.cards);
        setHandResult(null);
        setHandResultAckedSeats([]);
        setBiddingResult(null);
        setTrumpSuit(null);
        setMeldData(null);
        setAcknowledgedSeats([]);
        setTrickNumber(1);
        setCurrentTrick([]);
        setTrickResult(null);
        setTricksTaken({ NS: 0, EW: 0 });
        setTrickScores({ NS: 0, EW: 0 });
        setNextToActSeat(null);
        setLegalCards([]);
        return;
      }

      case "BIDDING_TURN": {
        setError(null);
        const p: BiddingState = lastEvent.payload;
        setBiddingState(p);
        setPhase("BIDDING");
        return;
      }

      case "BIDDING_COMPLETED": {
        setError(null);
        const p: BiddingResult = lastEvent.payload;
        setBiddingResult(p);
        setPhase("NAMING_TRUMP");
        return;
      }

      case "TRUMP_NAMED": {
        setError(null);
        setTrumpSuit(lastEvent.payload.trump_suit);
        return;
      }

      case "PASSING_PHASE_STARTED": {
        setError(null);
        const p = lastEvent.payload;
        setPassingState({
          trump_suit: p.trump_suit,
          bidding_team: p.bidding_team,
          bidder_seat: p.bidder_seat,
          partner_seat: p.partner_seat,
          submitted_seats: [],
        });
        setPhase("PASSING_CARDS");
        return;
      }

      case "CARDS_PASSED": {
        setError(null);
        const { submitted_seats } = lastEvent.payload;
        setPassingState((prev) =>
          prev ? { ...prev, submitted_seats } : prev,
        );
        return;
      }

      case "CARDS_RECEIVED": {
        setError(null);
        setHand(lastEvent.payload.new_hand);
        return;
      }

      case "MELD_BROADCAST": {
        setError(null);
        const p = lastEvent.payload;
        setTrumpSuit(p.trump_suit);
        setMeldData({
          trump_suit: p.trump_suit,
          winning_bid: p.winning_bid,
          is_shoot_the_moon: p.is_shoot_the_moon,
          bidding_team: p.bidding_team,
          team_meld: p.team_meld,
          player_melds: p.player_melds,
        });
        setAcknowledgedSeats([]);
        setPhase("SHOWING_MELD");
        return;
      }

      case "MELD_ACKNOWLEDGED": {
        setError(null);
        setAcknowledgedSeats(lastEvent.payload.acknowledged_seats);
        return;
      }

      case "MELD_PHASE_COMPLETED": {
        setError(null);
        setPhase("TRICK_PLAYING");
        setTrickNumber(1);
        setCurrentTrick([]);
        setTricksTaken({ NS: 0, EW: 0 });
        setTrickScores({ NS: 0, EW: 0 });
        setTrickResult(null);
        setLegalCards([]);
        setNextToActSeat(null);
        setHandResult(null);
        return;
      }

      case "TRICK_STATE": {
        setError(null);
        const p = lastEvent.payload;
        setTrickNumber(p.trick_number);
        setTricksTaken(p.tricks_taken);
        setTrickScores(p.trick_scores);
        return;
      }

      case "YOUR_TURN": {
        setError(null);
        cancelTrickTimer();
        const p = lastEvent.payload;
        setTrickResult(null);
        setTrickNumber(p.trick_number);
        setCurrentTrick(p.cards_played);
        setNextToActSeat(p.seat);
        setLegalCards(p.legal_cards);
        return;
      }

      case "CARD_PLAYED": {
        setError(null);
        cancelTrickTimer();
        const p = lastEvent.payload;
        // Server confirmed our card play — remove it from hand now.
        if (p.seat === mySeat && pendingCardRef.current) {
          const { card, handSnapshot } = pendingCardRef.current;
          pendingCardRef.current = null;
          setHand(() => {
            const idx = handSnapshot.indexOf(card);
            if (idx === -1) return handSnapshot;
            return [...handSnapshot.slice(0, idx), ...handSnapshot.slice(idx + 1)];
          });
        }
        if (trickResult) {
          setTrickResult(null);
          setCurrentTrick([{ seat: p.seat, card: p.card }]);
        } else {
          setCurrentTrick((prev) => [...prev, { seat: p.seat, card: p.card }]);
        }
        setNextToActSeat(p.next_to_act_seat);
        setLegalCards([]);
        return;
      }

      case "TRICK_COMPLETED": {
        setError(null);
        const p = lastEvent.payload;
        setTrickResult({
          trick_number: p.trick_number,
          winner_seat: p.winner_seat,
          trick_points: p.trick_points,
          cards_played: currentTrick,
          tricks_taken: p.tricks_taken,
          trick_scores: p.trick_scores,
        });
        setTricksTaken(p.tricks_taken);
        setTrickScores(p.trick_scores);

        if (p.trick_number < 12) {
          const nextNum = p.trick_number + 1;
          trickTimerRef.current = setTimeout(() => {
            setTrickResult(null);
            setCurrentTrick([]);
            setTrickNumber(nextNum);
            trickTimerRef.current = null;
          }, 2000);
        }
        return;
      }

      case "HAND_COMPLETED": {
        setError(null);
        cancelTrickTimer();
        const p = lastEvent.payload;
        setHandResult({
          trick_scores: p.trick_scores,
          team_meld: p.team_meld,
          bid: p.bid,
          bidding_team: p.bidding_team,
          score_deltas: p.score_deltas,
          game_scores: p.game_scores,
        });
        setGameScores(p.game_scores);
        setHandResultAckedSeats([]);
        setPhase("HAND_COMPLETE");
        return;
      }

      case "HAND_RESULT_ACKNOWLEDGED": {
        setError(null);
        setHandResultAckedSeats(lastEvent.payload.acknowledged_seats);
        return;
      }

      case "GAME_OVER": {
        setError(null);
        const p = lastEvent.payload;
        setGameOver({ winner_team: p.winner_team, final_scores: p.final_scores });
        setGameScores(p.final_scores);
        setRematchRequested(false);
        setPendingRematchSeats([]);
        setPhase("GAME_OVER");
        return;
      }

      case "GAME_FORFEITED": {
        setError(null);
        const p = lastEvent.payload;
        cancelTrickTimer();
        setGameOver({
          winner_team: p.winning_team,
          final_scores: p.final_scores,
          forfeit_note: `${p.forfeiting_team} forfeited the game`,
        });
        setGameScores(p.final_scores);
        setRematchRequested(false);
        setPendingRematchSeats([]);
        setPhase("GAME_OVER");
        return;
      }

      case "REMATCH_REQUESTED": {
        setError(null);
        const p = lastEvent.payload;
        setPendingRematchSeats(p.pending_seats);
        if (p.seat === mySeat) setRematchRequested(true);
        return;
      }

      case "REMATCH_STARTED": {
        setError(null);
        setGameOver(null);
        setRematchRequested(false);
        setPendingRematchSeats([]);
        setGameScores({ NS: 0, EW: 0 });
        setHandResult(null);
        setHandResultAckedSeats([]);
        setBiddingResult(null);
        setTrumpSuit(null);
        setMeldData(null);
        setAcknowledgedSeats([]);
        setPassingState(null);
        setTrickNumber(1);
        setCurrentTrick([]);
        setTrickResult(null);
        setTricksTaken({ NS: 0, EW: 0 });
        setTrickScores({ NS: 0, EW: 0 });
        setNextToActSeat(null);
        setLegalCards([]);
        setPhase("BIDDING");
        return;
      }

      case "LEFT_TO_LOBBY":
        onLeave();
        return;

      case "LOBBY_STATE_UPDATED":
      case "SEAT_CLAIM_FAILED":
        return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  function handleCardPlay(card: string) {
    // Snapshot the hand before sending so we can roll back if the server rejects the play.
    pendingCardRef.current = { card, handSnapshot: hand };
    send(sendMessage, { action: "PLAY_CARD", payload: { card } });
    setLegalCards([]);
  }

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
              onAcknowledge={() =>
                send(sendMessage, {
                  action: "ACKNOWLEDGE_HAND_RESULT",
                  payload: {},
                })
              }
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
              onRematch={() => {
                setRematchRequested(true);
                send(sendMessage, { action: "REMATCH_REQUEST", payload: {} });
              }}
              onLeaveToLobby={() => {
                send(sendMessage, { action: "LEAVE_TO_LOBBY", payload: {} });
              }}
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
            onCardClick={isMyTurn ? handleCardPlay : undefined}
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
