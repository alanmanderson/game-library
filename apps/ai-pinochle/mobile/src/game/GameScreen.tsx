import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import type {
  Phase,
  WsEvent,
  BiddingState,
  BiddingResult,
  MeldData,
  CardPlayed,
  TrickResult,
  HandResultData,
  PassingState,
} from "@pinochle/shared";
import { CARDS_PER_PLAYER, getTableOrder } from "@pinochle/shared";
import { HandDisplay } from "./HandDisplay";
import { BiddingPhase } from "./BiddingPhase";
import { TrumpPhase } from "./TrumpPhase";
import { MeldPhase } from "./MeldPhase";
import { TrickPhase } from "./TrickPhase";
import { PassCardsPhase } from "./PassCardsPhase";
import { HandResult } from "./HandResult";
import { PlayerAvatar } from "./PlayerAvatar";
import { OtherPlayerHand } from "./OtherPlayerHand";

interface Props {
  sendMessage: (msg: Record<string, unknown>) => void;
  lastEvent: WsEvent | null;
  connected: boolean;
  roomCode: string;
  mySeat: string;
  initialHand: string[];
  seatPlayers: Record<string, string | null>;
  onLeave: () => void;
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "BIDDING":
      return "Bidding Phase";
    case "NAMING_TRUMP":
      return "Naming Trump";
    case "PASSING_CARDS":
      return "Passing Cards";
    case "SHOWING_MELD":
      return "Meld Phase";
    case "TRICK_PLAYING":
      return "Trick Play";
    case "HAND_COMPLETE":
      return "Hand Complete";
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
    currentBid: null,
    highestBidderSeat: null,
    nextSeat: "",
    minBid: 20,
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

  const trickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelTrickTimer() {
    if (trickTimerRef.current !== null) {
      clearTimeout(trickTimerRef.current);
      trickTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => cancelTrickTimer();
  }, []);

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

    const { event, payload } = lastEvent;

    if (event === "ERROR") {
      const p = payload as { message: string };
      setError(p.message);
      return;
    }

    setError(null);

    if (event === "HAND_DEALT") {
      const p = payload as { cards: string[] };
      setHand(p.cards);
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
    } else if (event === "BIDDING_TURN") {
      const p = payload as {
        current_highest_bid: number | null;
        highest_bidder_seat: string | null;
        next_to_act_seat: string;
        minimum_valid_bid: number;
      };
      setBiddingState({
        currentBid: p.current_highest_bid,
        highestBidderSeat: p.highest_bidder_seat,
        nextSeat: p.next_to_act_seat,
        minBid: p.minimum_valid_bid,
      });
      setPhase("BIDDING");
    } else if (event === "BIDDING_COMPLETED") {
      const p = payload as {
        winning_seat: string;
        winning_bid: number;
      };
      setBiddingResult({
        winningSeat: p.winning_seat,
        winningBid: p.winning_bid,
      });
      setPhase("NAMING_TRUMP");
    } else if (event === "TRUMP_NAMED") {
      const p = payload as { trump_suit: string };
      setTrumpSuit(p.trump_suit);
    } else if (event === "PASSING_PHASE_STARTED") {
      const p = payload as {
        trump_suit: string;
        bidding_team: string;
        bidder_seat: string;
        partner_seat: string;
      };
      setPassingState({
        trumpSuit: p.trump_suit,
        biddingTeam: p.bidding_team,
        bidderSeat: p.bidder_seat,
        partnerSeat: p.partner_seat,
        submittedSeats: [],
      });
      setPhase("PASSING_CARDS");
    } else if (event === "CARDS_PASSED") {
      const p = payload as { seat: string; submitted_seats: string[] };
      setPassingState((prev) =>
        prev ? { ...prev, submittedSeats: p.submitted_seats } : prev,
      );
    } else if (event === "CARDS_RECEIVED") {
      const p = payload as { cards_received: string[]; new_hand: string[] };
      setHand(p.new_hand);
    } else if (event === "MELD_BROADCAST") {
      const p = payload as {
        trump_suit: string;
        winning_bid: number;
        bidding_team: string;
        team_meld: Record<string, number>;
        player_melds: Record<
          string,
          {
            melds: { name: string; cards: string[]; points: number }[];
            total: number;
          }
        >;
      };
      setTrumpSuit(p.trump_suit);
      setMeldData({
        trumpSuit: p.trump_suit,
        winningBid: p.winning_bid,
        biddingTeam: p.bidding_team,
        teamMeld: p.team_meld,
        playerMelds: p.player_melds,
      });
      setAcknowledgedSeats([]);
      setPhase("SHOWING_MELD");
    } else if (event === "MELD_ACKNOWLEDGED") {
      const p = payload as { acknowledged_seats: string[] };
      setAcknowledgedSeats(p.acknowledged_seats);
    } else if (event === "MELD_PHASE_COMPLETED") {
      setPhase("TRICK_PLAYING");
      setTrickNumber(1);
      setCurrentTrick([]);
      setTricksTaken({ NS: 0, EW: 0 });
      setTrickScores({ NS: 0, EW: 0 });
      setTrickResult(null);
      setLegalCards([]);
      setNextToActSeat(null);
      setHandResult(null);
    } else if (event === "TRICK_STATE") {
      const p = payload as {
        trick_number: number;
        tricks_taken: Record<string, number>;
        trick_scores: Record<string, number>;
      };
      setTrickNumber(p.trick_number);
      setTricksTaken(p.tricks_taken);
      setTrickScores(p.trick_scores);
    } else if (event === "YOUR_TURN") {
      cancelTrickTimer();
      const p = payload as {
        seat: string;
        legal_cards: string[];
        trick_number: number;
        cards_played: CardPlayed[];
      };
      setTrickResult(null);
      setTrickNumber(p.trick_number);
      setCurrentTrick(p.cards_played || []);
      setNextToActSeat(p.seat);
      setLegalCards(p.legal_cards);
    } else if (event === "CARD_PLAYED") {
      cancelTrickTimer();
      const p = payload as {
        seat: string;
        card: string;
        next_to_act_seat: string | null;
      };
      if (trickResult) {
        setTrickResult(null);
        setCurrentTrick([{ seat: p.seat, card: p.card }]);
      } else {
        setCurrentTrick((prev) => [...prev, { seat: p.seat, card: p.card }]);
      }
      setNextToActSeat(p.next_to_act_seat);
      setLegalCards([]);
    } else if (event === "TRICK_COMPLETED") {
      const p = payload as {
        trick_number: number;
        winner_seat: string;
        trick_points: number;
        tricks_taken: Record<string, number>;
        trick_scores: Record<string, number>;
      };
      setTrickResult({
        trickNumber: p.trick_number,
        winnerSeat: p.winner_seat,
        trickPoints: p.trick_points,
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
    } else if (event === "HAND_COMPLETED") {
      cancelTrickTimer();
      const p = payload as {
        trick_scores: Record<string, number>;
        team_meld: Record<string, number>;
        bid: number;
        bidding_team: string;
        score_deltas: Record<string, number>;
        game_scores: Record<string, number>;
      };
      setHandResult({
        trickScores: p.trick_scores,
        teamMeld: p.team_meld,
        bid: p.bid,
        biddingTeam: p.bidding_team,
        scoreDeltas: p.score_deltas,
        gameScores: p.game_scores,
      });
      setHandResultAckedSeats([]);
      setPhase("HAND_COMPLETE");
    } else if (event === "HAND_RESULT_ACKNOWLEDGED") {
      const p = payload as { acknowledged_seats: string[] };
      setHandResultAckedSeats(p.acknowledged_seats);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  function handleCardPlay(card: string) {
    sendMessage({ action: "PLAY_CARD", payload: { card } });
    setHand((prev) => {
      const idx = prev.indexOf(card);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
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
        <TouchableOpacity onPress={onLeave}>
          <Text style={styles.leaveText}>Leave</Text>
        </TouchableOpacity>
      </View>

      {/* Top area - partner */}
      <View style={styles.topArea}>
        {topPlayer && <PlayerAvatar username={topPlayer} />}
        <OtherPlayerHand position="top" cardCount={getOtherCardCount(top)} />
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
              isBidWinner={biddingResult.winningSeat === mySeat}
              sendMessage={sendMessage}
            />
          )}

          {phase === "PASSING_CARDS" && passingState && (
            <PassCardsPhase
              hand={hand}
              mySeat={mySeat}
              biddingTeam={passingState.biddingTeam}
              submittedSeats={passingState.submittedSeats}
              hasSubmitted={passingState.submittedSeats.includes(mySeat)}
              sendMessage={sendMessage}
            />
          )}

          {phase === "SHOWING_MELD" && meldData && (
            <MeldPhase
              meldData={meldData}
              acknowledgedSeats={acknowledgedSeats}
              hasAcknowledged={hasAcknowledged}
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
            />
          )}

          {phase === "HAND_COMPLETE" && handResult && (
            <HandResult
              result={handResult}
              hasAcknowledged={handResultAckedSeats.includes(mySeat)}
              acknowledgedSeats={handResultAckedSeats}
              onAcknowledge={() =>
                sendMessage({
                  action: "ACKNOWLEDGE_HAND_RESULT",
                  payload: {},
                })
              }
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
        {phase !== "PASSING_CARDS" && (
          <HandDisplay
            cards={hand}
            trumpSuit={trumpSuit}
            onCardClick={isMyTurn ? handleCardPlay : undefined}
            legalCards={isMyTurn ? legalCards : undefined}
          />
        )}
        {bottomPlayer && <PlayerAvatar username={bottomPlayer} />}
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
    alignItems: "center",
    paddingVertical: 4,
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
    alignItems: "center",
    paddingBottom: 8,
    gap: 4,
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
