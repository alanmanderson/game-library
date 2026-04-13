interface ConnectionBannersProps {
  isBotGame: boolean;
  opponentConnected: boolean;
  opponentReconnected: boolean;
  opponentName: string;
  error: string | null;
  spectatorCount: number;
}

function ConnectionBanners({
  isBotGame,
  opponentConnected,
  opponentReconnected,
  opponentName,
  error,
  spectatorCount,
}: ConnectionBannersProps) {
  return (
    <>
      {!isBotGame && !opponentConnected && !opponentReconnected && (
        <div className="connection-banner">
          {opponentName} disconnected. Waiting for them to reconnect...
        </div>
      )}
      {!isBotGame && opponentReconnected && (
        <div className="connection-banner reconnected">
          {opponentName} reconnected!
        </div>
      )}
      {error && <div className="game-error-banner">{error}</div>}
      {spectatorCount > 0 && (
        <div className="spectator-count-banner">
          👁 {spectatorCount} watching
        </div>
      )}
    </>
  );
}

export default ConnectionBanners;
