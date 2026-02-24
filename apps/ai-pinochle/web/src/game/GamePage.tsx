import { useState, useEffect } from "react";
import { HandDisplay } from "./HandDisplay.tsx";
import { BiddingPhase } from "./BiddingPhase.tsx";
import { TrumpPhase } from "./TrumpPhase.tsx";
import { MeldPhase } from "./MeldPhase.tsx";
import { PlayerAvatar } from "./PlayerAvatar.tsx";
import { OtherPlayerHand } from "./OtherPlayerHand.tsx";
import { getTableOrder } from "./tableOrder.ts";
import styles from "./GamePage.module.css";

type Phase = "BIDDING" | "NAMING_TRUMP" | "SHOWING_MELD" | "TRICK_PLAYING";

interface WsEvent {
  event: string;
  payload: Record<string, unknown>;
}

interface BiddingState {
  currentBid: number | null;
  highestBidderSeat: string | null;
  nextSeat: string;
  minBid: number;
}

interface BiddingResult {
  winningSeat: string;
  winningBid: number;
}

interface MeldData {
  trumpSuit: string;
  winningBid: number;
  biddingTeam: string;
  teamMeld: Record<string, number>;
  playerMelds: Record<string, { melds: { name: string; cards: string[]; points: number }[]; total: number }>;
}

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

const CARDS_PER_PLAYER = 12;

export function GamePage({
  sendMessage,
  lastEvent,
  connected,
  mySeat,
  initialHand,
  seatPlayers,
  onLeave,
}: Props) {
  const [phase, setPhase] = useState<Phase>("BIDDING");
  const [hand] = useState<string[]>(initialHand);
  const [biddingState, setBiddingState] = useState<BiddingState>({
    currentBid: null,
    highestBidderSeat: null,
    nextSeat: "",
    minBid: 20,
  });
  const [biddingResult, setBiddingResult] = useState<BiddingResult | null>(null);
  const [trumpSuit, setTrumpSuit] = useState<string | null>(null);
  const [meldData, setMeldData] = useState<MeldData | null>(null);
  const [acknowledgedSeats, setAcknowledgedSeats] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lastEvent) return;

    const { event, payload } = lastEvent;

    if (event === "ERROR") {
      const p = payload as { message: string };
      setError(p.message);
      return;
    }

    setError(null);

    if (event === "BIDDING_TURN") {
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
    } else if (event === "MELD_BROADCAST") {
      const p = payload as {
        trump_suit: string;
        winning_bid: number;
        bidding_team: string;
        team_meld: Record<string, number>;
        player_melds: Record<string, { melds: { name: string; cards: string[]; points: number }[]; total: number }>;
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
    }
  }, [lastEvent]);

  const hasAcknowledged = acknowledgedSeats.includes(mySeat);
  const [bottom, left, top, right] = getTableOrder(mySeat);

  const bottomPlayer = seatPlayers[bottom];
  const leftPlayer = seatPlayers[left];
  const topPlayer = seatPlayers[top];
  const rightPlayer = seatPlayers[right];

  return (
    <div className={styles.table}>
      <div className={styles.statusBar}>
        <span className={styles.phaseLabel}>{phaseLabel(phase)}</span>
        <span
          className={`${styles.connectionDot} ${connected ? styles.dotConnected : styles.dotDisconnected}`}
        />
        <button className={styles.leaveButton} onClick={onLeave}>
          Leave
        </button>
      </div>

      <div className={styles.topArea}>
        {topPlayer && <PlayerAvatar username={topPlayer} />}
        <OtherPlayerHand position="top" cardCount={CARDS_PER_PLAYER} />
      </div>

      <div className={styles.leftArea}>
        {leftPlayer && <PlayerAvatar username={leftPlayer} />}
        <OtherPlayerHand position="left" cardCount={CARDS_PER_PLAYER} />
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
            isBidWinner={biddingResult.winningSeat === mySeat}
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
          <p className={styles.placeholder}>Waiting for trick play...</p>
        )}
      </div>

      <div className={styles.rightArea}>
        <OtherPlayerHand position="right" cardCount={CARDS_PER_PLAYER} />
        {rightPlayer && <PlayerAvatar username={rightPlayer} />}
      </div>

      <div className={styles.bottomArea}>
        <HandDisplay cards={hand} trumpSuit={trumpSuit} />
        {bottomPlayer && <PlayerAvatar username={bottomPlayer} />}
      </div>
    </div>
  );
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "BIDDING":
      return "Bidding Phase";
    case "NAMING_TRUMP":
      return "Naming Trump";
    case "SHOWING_MELD":
      return "Meld Phase";
    case "TRICK_PLAYING":
      return "Trick Play";
  }
}
