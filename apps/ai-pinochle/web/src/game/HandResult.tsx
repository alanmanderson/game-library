import type { HandResultData } from "@pinochle/shared";
import styles from "./HandResult.module.css";

interface Props {
  result: HandResultData;
  hasAcknowledged: boolean;
  acknowledgedSeats: string[];
  onAcknowledge: () => void;
}

export function HandResult({ result, hasAcknowledged, acknowledgedSeats, onAcknowledge }: Props) {
  const { trickScores, teamMeld, bid, biddingTeam, scoreDeltas, gameScores } = result;
  const otherTeam = biddingTeam === "NS" ? "EW" : "NS";
  const bidMade = scoreDeltas[biddingTeam] >= 0;

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Hand Complete</h2>

      <p className={styles.bidInfo}>
        Bid: <strong>{bid}</strong> by <strong>{biddingTeam}</strong>
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
          {[biddingTeam, otherTeam].map((team) => (
            <tr key={team}>
              <td className={styles.teamCell}>{team}</td>
              <td>{teamMeld[team]}</td>
              <td>{trickScores[team]}</td>
              <td className={scoreDeltas[team] >= 0 ? styles.positive : styles.negative}>
                {scoreDeltas[team] >= 0 ? "+" : ""}
                {scoreDeltas[team]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.gameScore}>
        <span>Game Score</span>
        <div className={styles.gameScoreValues}>
          <span>NS: <strong>{gameScores.NS}</strong></span>
          <span>EW: <strong>{gameScores.EW}</strong></span>
        </div>
      </div>

      <button
        className={styles.okButton}
        onClick={onAcknowledge}
        disabled={hasAcknowledged}
      >
        {hasAcknowledged ? "Waiting..." : "OK"}
      </button>
      <span className={styles.ackProgress}>
        {acknowledgedSeats.length}/4 ready
      </span>
    </div>
  );
}
