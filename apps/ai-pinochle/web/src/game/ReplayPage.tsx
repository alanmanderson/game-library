import { useEffect, useState } from "react";
import type { ReplayResponse, ReplayHand, ReplayTrick } from "@pinochle/shared";
import { useAuth } from "../auth/AuthContext.tsx";
import { getAuth, ApiError } from "../api/client.ts";
import { Button } from "../ui";
import { CardImage } from "./CardImage.tsx";
import styles from "./ReplayPage.module.css";

interface Props {
  roomCode: string;
  onBack: () => void;
}

const SUIT_SYMBOLS: Record<string, string> = {
  HEARTS: "♥", DIAMONDS: "♦", CLUBS: "♣", SPADES: "♠",
};
const SUIT_COLORS: Record<string, string> = {
  HEARTS: "var(--suit-heart)", DIAMONDS: "var(--suit-diamond)",
  CLUBS: "var(--suit-club)", SPADES: "var(--suit-spade)",
};
// stepIndex: 0 = bidding, 1..N = trick N, N+1 = summary
function totalSteps(hand: ReplayHand): number {
  return hand.tricks.length + 2; // bidding + tricks + summary
}

// ── Bidding view ─────────────────────────────────────────────────────────────
function BiddingView({
  hand,
  players,
}: {
  hand: ReplayHand;
  players: Record<string, string | null>;
}) {
  const trump = hand.trump_suit;
  return (
    <div>
      <p className={styles.biddingHeader}>
        Bidding
        {trump && (
          <>
            {" "}| Trump:{" "}
            <span style={{ color: SUIT_COLORS[trump] }}>
              {SUIT_SYMBOLS[trump]} {trump.charAt(0) + trump.slice(1).toLowerCase()}
            </span>
          </>
        )}
      </p>
      {hand.bids.length === 0 ? (
        <p className={styles.loading}>No bids recorded.</p>
      ) : (
        <table className={styles.biddingTable}>
          <thead>
            <tr>
              <th>Player</th>
              <th>Bid</th>
            </tr>
          </thead>
          <tbody>
            {hand.bids.map((bid, i) => {
              const name = players[bid.seat] ?? bid.seat;
              return (
                <tr key={i}>
                  <td>{name} ({bid.seat})</td>
                  <td>
                    {bid.bid_amount === null ? (
                      <span className={styles.biddingPass}>Pass</span>
                    ) : bid.is_shoot_the_moon ? (
                      `${bid.bid_amount} (Shoot the Moon)`
                    ) : (
                      bid.bid_amount
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {hand.winning_bidder_seat && (
        <p className={styles.biddingWinner}>
          <strong>Winner:</strong>{" "}
          {players[hand.winning_bidder_seat] ?? hand.winning_bidder_seat} bid{" "}
          {hand.winning_bid_amount}
          {hand.is_shoot_the_moon ? " (Shoot the Moon)" : ""}
        </p>
      )}
    </div>
  );
}

// ── Trick view ───────────────────────────────────────────────────────────────
function TrickView({
  trick,
  players,
}: {
  trick: ReplayTrick;
  players: Record<string, string | null>;
}) {
  function CardSlot({ seat }: { seat: string }) {
    const card = trick.cards[seat];
    const name = players[seat] ?? seat;
    return (
      <div className={styles.cardCell}>
        <span className={styles.cardCellName}>{name}</span>
        {card ? (
          <CardImage card={card} width={60} height={90} alt={`${name}'s card`} />
        ) : (
          <CardImage back width={60} height={90} alt="No card" />
        )}
        <span className={styles.cardCellSeat}>{seat}</span>
      </div>
    );
  }

  const ledName = trick.led_by_seat
    ? (players[trick.led_by_seat] ?? trick.led_by_seat)
    : "—";
  const wonName = trick.won_by_seat
    ? (players[trick.won_by_seat] ?? trick.won_by_seat)
    : "—";

  return (
    <div>
      <p className={styles.biddingHeader}>Trick {trick.trick_number}</p>
      {/* 3×3 compass grid:
          [empty] [north] [empty]
          [west]  [felt]  [east]
          [empty] [south] [empty] */}
      <div className={styles.trickLayout}>
        <div />
        <CardSlot seat="north" />
        <div />

        <CardSlot seat="west" />
        <div className={styles.trickCenter} />
        <CardSlot seat="east" />

        <div />
        <CardSlot seat="south" />
        <div />
      </div>

      <div className={styles.trickInfo}>
        <span className={styles.trickInfoItem}>
          Led by: <strong>{ledName}</strong>
        </span>
        <span className={styles.trickInfoItem}>
          Won by: <strong>{wonName}</strong>
          {trick.trick_points !== null && ` (+${trick.trick_points} pts)`}
        </span>
      </div>
    </div>
  );
}

// ── Summary view ─────────────────────────────────────────────────────────────
function SummaryView({
  hand,
  players,
}: {
  hand: ReplayHand;
  players: Record<string, string | null>;
}) {
  const trump = hand.trump_suit;
  const bidderName = hand.winning_bidder_seat
    ? (players[hand.winning_bidder_seat] ?? hand.winning_bidder_seat)
    : "—";

  // Determine which team bid and what they scored in tricks
  const bidderSeat = hand.winning_bidder_seat ?? "";
  const nsSeats = ["north", "south"];
  const bidTeamIsNS = nsSeats.includes(bidderSeat);
  const bidTeamTricks = bidTeamIsNS ? hand.ns_trick_score : hand.ew_trick_score;
  const bid = hand.winning_bid_amount;

  let resultText = "";
  let resultClass = "";
  if (hand.is_set === true) {
    resultText = `${bidderName} was set (bid ${bid}, scored ${bidTeamTricks ?? 0})`;
    resultClass = styles.summaryResultSet;
  } else if (hand.is_set === false) {
    resultText = `${bidderName} made the bid (bid ${bid}, scored ${bidTeamTricks ?? 0})`;
    resultClass = styles.summaryResultWon;
  }

  return (
    <div>
      <p className={styles.biddingHeader}>Hand {hand.hand_number} Summary</p>
      <div className={styles.summaryGrid}>
        <span className={styles.summaryLabel}>Trump</span>
        <span className={styles.summaryValue}>
          {trump ? (
            <span style={{ color: SUIT_COLORS[trump] }}>
              {SUIT_SYMBOLS[trump]} {trump.charAt(0) + trump.slice(1).toLowerCase()}
            </span>
          ) : "—"}
        </span>

        <span className={styles.summaryLabel}>Winning bid</span>
        <span className={styles.summaryValue}>
          {bid !== null ? `${bidderName} — ${bid}` : "—"}
          {hand.is_shoot_the_moon ? " (Shoot the Moon)" : ""}
        </span>

        <span className={styles.summaryLabel}>NS Meld</span>
        <span className={styles.summaryValue}>{hand.ns_meld_score ?? "—"}</span>

        <span className={styles.summaryLabel}>EW Meld</span>
        <span className={styles.summaryValue}>{hand.ew_meld_score ?? "—"}</span>

        <span className={styles.summaryLabel}>NS Tricks</span>
        <span className={styles.summaryValue}>{hand.ns_trick_score ?? "—"}</span>

        <span className={styles.summaryLabel}>EW Tricks</span>
        <span className={styles.summaryValue}>{hand.ew_trick_score ?? "—"}</span>

        {resultText && (
          <div className={`${styles.summaryResult} ${resultClass}`}>
            {resultText}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ReplayPage({ roomCode, onBack }: Props) {
  const { token } = useAuth();
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [handIndex, setHandIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getAuth<ReplayResponse>(
          `/games/${roomCode}/replay`,
          token!,
        );
        if (!cancelled) setReplay(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.detail : "Failed to load replay");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [roomCode, token]);

  if (loading) {
    return (
      <div className={styles.container}>
        <p className={styles.loading}>Loading replay...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Button variant="secondary" size="sm" onClick={onBack}>← Back</Button>
        <p className="alert alert--error" role="alert">{error}</p>
      </div>
    );
  }

  if (!replay || replay.hands.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Button variant="secondary" size="sm" onClick={onBack}>← Back</Button>
          <h2>Room {roomCode} — Replay</h2>
        </div>
        <p className={styles.empty}>No hands have been recorded for this game yet.</p>
      </div>
    );
  }

  const hand = replay.hands[handIndex];
  const steps = totalSteps(hand);
  const players = replay.players;

  function prevStep() {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    } else if (handIndex > 0) {
      const prevHand = replay!.hands[handIndex - 1];
      setHandIndex(handIndex - 1);
      setStepIndex(totalSteps(prevHand) - 1);
    }
  }

  function nextStep() {
    if (stepIndex < steps - 1) {
      setStepIndex(stepIndex + 1);
    } else if (handIndex < replay!.hands.length - 1) {
      setHandIndex(handIndex + 1);
      setStepIndex(0);
    }
  }

  function goToHand(idx: number) {
    setHandIndex(idx);
    setStepIndex(0);
  }

  const isFirst = handIndex === 0 && stepIndex === 0;
  const isLast =
    handIndex === replay.hands.length - 1 && stepIndex === steps - 1;

  // Build scrubber labels for current hand
  const pillLabels = [
    "Bidding",
    ...hand.tricks.map((t) => `T${t.trick_number}`),
    "Result",
  ];

  // NS / EW player name strings
  const nsPlayers = [players["north"], players["south"]]
    .filter(Boolean)
    .join(" & ") || "NS";
  const ewPlayers = [players["east"], players["west"]]
    .filter(Boolean)
    .join(" & ") || "EW";

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Button variant="secondary" size="sm" onClick={onBack}>← Back</Button>
        <h2>Room {roomCode} — Replay</h2>
      </div>

      {/* Final scores */}
      <div className={styles.scoreboard}>
        <div className={styles.scoreTeam}>
          <span className={styles.scoreTeamLabel}>NS</span>
          <span className={styles.scoreTeamPlayers}>{nsPlayers}</span>
          <span className={styles.scoreTeamPoints}>{replay.final_scores.ns}</span>
        </div>
        <div className={styles.scoreDivider} />
        <div className={styles.scoreTeam}>
          <span className={styles.scoreTeamLabel}>EW</span>
          <span className={styles.scoreTeamPlayers}>{ewPlayers}</span>
          <span className={styles.scoreTeamPoints}>{replay.final_scores.ew}</span>
        </div>
      </div>

      {/* Hand navigation */}
      <div className={styles.handNav}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => goToHand(handIndex - 1)}
          disabled={handIndex === 0}
        >
          ◄ Prev Hand
        </Button>
        <span className={styles.handLabel}>
          Hand {handIndex + 1} of {replay.hands.length}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => goToHand(handIndex + 1)}
          disabled={handIndex === replay.hands.length - 1}
        >
          Next Hand ►
        </Button>
      </div>

      {/* Step scrubber */}
      <div className={styles.scrubber} role="group" aria-label="Hand steps">
        {pillLabels.map((label, i) => (
          <button
            key={i}
            className={
              styles.scrubberPill +
              (i === stepIndex ? " " + styles.scrubberPillActive : "")
            }
            onClick={() => setStepIndex(i)}
            aria-pressed={i === stepIndex}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content frame */}
      <div className={styles.frame}>
        {stepIndex === 0 && (
          <BiddingView hand={hand} players={players} />
        )}
        {stepIndex > 0 && stepIndex <= hand.tricks.length && (
          <TrickView
            trick={hand.tricks[stepIndex - 1]}
            players={players}
          />
        )}
        {stepIndex === hand.tricks.length + 1 && (
          <SummaryView hand={hand} players={players} />
        )}
      </div>

      {/* Prev / Next step */}
      <div className={styles.handNav}>
        <Button
          variant="secondary"
          size="sm"
          onClick={prevStep}
          disabled={isFirst}
        >
          ◄ Prev
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={nextStep}
          disabled={isLast}
        >
          Next ►
        </Button>
      </div>
    </div>
  );
}
