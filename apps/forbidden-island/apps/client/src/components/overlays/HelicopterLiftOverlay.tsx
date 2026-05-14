import { useMemo, useCallback } from 'react';
import { Frame } from '../ui/Frame';
import { Button } from '../ui/Button';
import { TreasureCard } from '../cards/TreasureCard';
import { IslandGrid } from '../board/IslandGrid';
import { PlayerPawn } from '../board/PlayerPawn';
import { useStore } from '../../store/store';
import { useActions } from '../../hooks/useActions';
import { OverlayBackdrop } from './OverlayBackdrop';
import { flattenLayout, SAMPLE_LAYOUT } from '../../data/tiles';
import { ROLES_BY_ID } from '../../data/roles';
import type { Tile } from '@forbidden-island/shared/types/tiles';
import type { ClientPlayerView } from '@forbidden-island/shared/types/players';
import type { ReactNode } from 'react';

export function HelicopterLiftOverlay() {
  const gameState = useStore((s) => s.gameState);
  const overlayData = useStore((s) => s.overlayData);
  const updateOverlayData = useStore((s) => s.updateOverlayData);
  const closeOverlay = useStore((s) => s.closeOverlay);
  const { playHelicopterLift } = useActions();

  const cardId = overlayData.heliCardId ?? '';
  const selectedPlayerIds = overlayData.heliSelectedPlayerIds ?? [];
  const myId = gameState?.myPlayerId;

  // Find the player who is playing the card (me)
  const me = gameState?.players.find((p: ClientPlayerView) => p.id === myId);
  const myTileId = useMemo(() => {
    if (!me || !gameState?.tiles) return null;
    const t = gameState.tiles.find(
      (tile: Tile) => tile.position.row === me.position.row && tile.position.col === me.position.col
    );
    return t?.id ?? null;
  }, [me, gameState?.tiles]);

  // Players on the same tile as me
  const colocatedPlayers = useMemo(() => {
    if (!me || !gameState?.players) return [];
    return gameState.players.filter(
      (p: ClientPlayerView) =>
        p.position.row === me.position.row && p.position.col === me.position.col
    );
  }, [me, gameState?.players]);

  // Tiles for the board
  const tiles = useMemo(() => {
    if (!gameState?.tiles) return flattenLayout(SAMPLE_LAYOUT);
    return gameState.tiles.map((t: Tile) => ({
      id: t.id,
      row: t.position.row,
      col: t.position.col,
    }));
  }, [gameState?.tiles]);

  const tileStates = useMemo(() => {
    if (!gameState?.tiles) return {};
    const s: Record<string, 'normal' | 'flooded' | 'sunk'> = {};
    gameState.tiles.forEach((t: Tile) => { s[t.id] = t.state; });
    return s;
  }, [gameState?.tiles]);

  // All non-sunk tiles except current are valid destinations
  const flyTargets = useMemo(() => {
    if (!gameState?.tiles) return {};
    const targets: Record<string, string> = {};
    gameState.tiles.forEach((t: Tile) => {
      if (t.state !== 'sunk' && t.id !== myTileId) {
        targets[t.id] = 'fly';
      }
    });
    return targets;
  }, [gameState?.tiles, myTileId]);

  // Build pawn map
  const pawnsOnTile = useMemo(() => {
    if (!gameState?.players || !gameState?.tiles) return {};
    const map: Record<string, ReactNode[]> = {};
    gameState.players.forEach((p: ClientPlayerView) => {
      const t = gameState.tiles.find(
        (tile: Tile) => tile.position.row === p.position.row && tile.position.col === p.position.col
      );
      if (!t) return;
      if (!map[t.id]) map[t.id] = [];
      const isSelected = selectedPlayerIds.includes(p.id);
      map[t.id].push(
        <PlayerPawn
          key={p.id}
          role={p.role}
          kind="portrait"
          size={28}
          isActive={isSelected}
        />
      );
    });
    return map;
  }, [gameState?.players, gameState?.tiles, selectedPlayerIds]);

  const togglePlayer = useCallback(
    (playerId: string) => {
      const current = overlayData.heliSelectedPlayerIds ?? [];
      const next = current.includes(playerId)
        ? current.filter((id: string) => id !== playerId)
        : [...current, playerId];
      updateOverlayData({ heliSelectedPlayerIds: next });
    },
    [overlayData.heliSelectedPlayerIds, updateOverlayData]
  );

  const handleTileClick = useCallback(
    (tileId: string) => {
      if (selectedPlayerIds.length === 0) return;
      if (!flyTargets[tileId]) return;
      const tile = gameState?.tiles.find((t: Tile) => t.id === tileId);
      if (!tile) return;
      playHelicopterLift(cardId, selectedPlayerIds, tile.position.row, tile.position.col);
      closeOverlay();
    },
    [selectedPlayerIds, flyTargets, gameState?.tiles, playHelicopterLift, cardId, closeOverlay]
  );

  const canLiftOff = selectedPlayerIds.length > 0;

  return (
    <OverlayBackdrop opacity={0.65}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          width: '100%',
          maxWidth: 900,
          height: 'auto',
          maxHeight: '80vh',
        }}
      >
        {/* Board */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ transform: 'scale(.65)', transformOrigin: 'center' }}>
            <IslandGrid
              tiles={tiles}
              tileSize={92}
              gap={7}
              states={tileStates}
              targets={flyTargets as Record<string, 'fly'>}
              selected={myTileId}
              pawnsOnTile={pawnsOnTile}
              onTileClick={handleTileClick}
            />
          </div>
        </div>

        {/* Right panel */}
        <Frame tone="ink2" padded={false} style={{ padding: 18, alignSelf: 'center' }}>
          <TreasureCard type="helicopter_lift" width={180} height={250} glow style={{ margin: '0 auto', display: 'block' }} />

          <div className="fi-cap" style={{ marginTop: 14 }}>
            Step 1 - Who flies?
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {colocatedPlayers.map((p: ClientPlayerView) => {
              const chosen = selectedPlayerIds.includes(p.id);
              const role = ROLES_BY_ID[p.role];
              return (
                <button
                  key={p.id}
                  className="fi"
                  onClick={() => togglePlayer(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: chosen ? 'rgba(232,196,122,.1)' : 'rgba(8,22,28,.4)',
                    border: `1px solid ${chosen ? 'var(--c-brassHi)' : 'rgba(202,160,82,.2)'}`,
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <PlayerPawn role={p.role} size={26} />
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--c-parch)' }}>
                    {p.name}{p.id === myId ? ' (You)' : ''}
                  </div>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      background: chosen ? 'var(--c-brassHi)' : 'transparent',
                      border: `1px solid ${chosen ? 'var(--c-brassHi)' : 'var(--c-brassLo)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--c-ink)',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {chosen ? '\u2713' : ''}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="fi-cap" style={{ marginTop: 14 }}>
            Step 2 - Pick destination
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-sand)', marginTop: 4, lineHeight: 1.5 }}>
            Click any non-sunk tile on the island.
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button kind="ghost" size="sm" onClick={closeOverlay}>
              Cancel
            </Button>
            <Button kind="primary" size="sm" disabled={!canLiftOff}>
              Lift Off
            </Button>
          </div>
        </Frame>
      </div>
    </OverlayBackdrop>
  );
}
