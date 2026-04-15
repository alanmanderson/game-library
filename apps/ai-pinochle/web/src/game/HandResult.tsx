import type { HandResultData } from "@pinochle/shared";
import { SEAT_LABELS, SEAT_ORDER } from "@pinochle/shared";
import styles from "./HandResult.module.css";

interface Props {
  result: HandResultData;
  hasAcknowledged: boolean;
  acknowledgedSeats: string[];
  seatPlayers: Record<string, string | null>;
  onAcknowledge: () => void;
}

export function HandResult({ result, hasAcknowledged, acknowledgedSeats, seatPlayers, onAcknowledge }: Props) {
  const { trick_scores, team_meld, bid, bidding_team, score_deltas, game_scores } = result;
  const otherTeam = bidding_team === "NS" ? "EW" : "NS";
  const bidMade = score_deltas[bidding_team] >= 0;

  const waitingOn = SEAT_ORDER
    .filter((seat) => !acknowledgedSeats.includes(seat))
    .map((seat) => seatPlayers[seat.toLowerCase()] ?? SEAT_LABELS[seat]);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Hand Complete</h2>

      <p className={styles.bidInfo}>
        Bid: <strong>{bid}</strong> by <strong>{bidding_team}</strong>
        {" \u2014 "}
        <span className={bidMade ? styles.made : styles.set}>
          {bidMade ? "Made!" : "Set!"}
        </span>
      </p>

      <table className={styles.scoreTable}>
        <thead>
          <tr>
            <th>Team</th>
            <th>Meld</th>
            <th>Tricks</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          {[bidding_team, otherTeam].map((team) => (
            <tr key={team}>
              <td className={styles.teamCell}>{team}</td>
              <td>{team_meld[team]}</td>
              <td>{trick_scores[team]}</td>
              <td className={score_deltas[team] >= 0 ? styles.positive : styles.negative}>
                {score_deltas[team] >= 0 ? "+" : ""}
                {score_deltas[team]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.gameScore}>
        <span>Game Score</span>
        <div className={styles.gameScoreValues}>
          <span>NS: <strong>{game_scores.NS}</strong></span>
          <span>EW: <strong>{game_scores.EW}</strong></span>
        </div>
      </div>

      <button
        className={styles.okButton}
        onClick={onAcknowledge}
        disabled={hasAcknowledged}
      >
        {hasAcknowledged ? "Waiting..." : "Continue"}
      </button>
      <span className={styles.ackProgress}>
        {acknowledgedSeats.length}/4 ready
        {hasAcknowledged && waitingOn.length > 0 && (
          <> &mdash; waiting on {waitingOn.join(", ")}</>
        )}
      </span>
    </div>
  );
}
