import { useMemo, useCallback } from 'react';
import { Pill } from '../ui/Pill';
import { IslandGrid } from '../board/IslandGrid';
import { PlayerPawn } from '../board/PlayerPawn';
import { useStore } from '../../store/store';
import { useActions } from '../../hooks/useActions';
import { OverlayBackdrop } from './OverlayBackdrop';
import { flattenLayout, SAMPLE_LAYOUT } from '../../data/tiles';
import type { Tile } from '@forbidden-island/shared/types/tiles';
import type { ClientPlayerView } from '@forbidden-island/shared/types/players';
import type { ReactNode } from 'react';

export function SwimOverlay() {
  const gameState = useStore((s) => s.gameState);
  const overlayData = useStore((s) => s.overlayData);
  const { swim } = useActions();

  const swimmingId = overlayData.swimmingPlayerId ?? gameState?.swimmingPlayerId;
  const swimmingPlayer = gameState?.players.find(
    (p: ClientPlayerView) => p.id === swimmingId
  );

  const myId = gameState?.myPlayerId;
  const isMe = swimmingId === myId;

  // Derive tiles
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

  // Find valid swim targets: adjacent non-sunk tiles
  // The server determines valid targets, but we can derive swim-eligible tiles for highlighting
  const swimTargets = useMemo(() => {
    if (!gameState?.tiles || !swimmingPlayer) return {};
    const pos = swimmingPlayer.position;
    const targets: Record<string, string> = {};
    // Adjacent tiles (including diagonal for Explorer, through flooded/sunk for Diver)
    // Simplified: show all non-sunk adjacent tiles as potential swim targets
    gameState.tiles.forEach((t: Tile) => {
      if (t.state === 'sunk') return;
      const dr = Math.abs(t.position.row - pos.row);
      const dc = Math.abs(t.position.col - pos.col);
      // Standard adjacency (orthogonal)
      if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
        targets[t.id] = 'swim';
      }
      // Explorer/Diver may have extended reach, but the server validates
      if (swimmingPlayer.role === 'explorer' && dr <= 1 && dc <= 1 && (dr + dc > 0)) {
        targets[t.id] = 'swim';
      }
    });
    return targets;
  }, [gameState?.tiles, swimmingPlayer]);

  const safeCount = Object.keys(swimTargets).length;

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

      // Show stranded pawn with bobbing animation
      if (p.id === swimmingId) {
        map[t.id].push(
          <div key={p.id} style={{ animation: 'fi-bob 1.4s ease-in-out infinite' }}>
            <PlayerPawn role={p.role} kind="portrait" size={32} isActive />
          </div>
        );
      } else {
        map[t.id].push(
          <PlayerPawn key={p.id} role={p.role} kind="portrait" size={28} isActive={false} />
        );
      }
    });
    return map;
  }, [gameState?.players, gameState?.tiles, swimmingId]);

  // Find the sunk tile name
  const sunkTileName = useMemo(() => {
    if (!swimmingPlayer || !gameState?.tiles) return 'Unknown';
    // The tile under the swimming player is the one that sank
    const t = gameState.tiles.find(
      (tile: Tile) => tile.position.row === swimmingPlayer.position.row && tile.position.col === swimmingPlayer.position.col
    );
    return t?.name ?? 'Unknown';
  }, [swimmingPlayer, gameState?.tiles]);

  const handleTileClick = useCallback(
    (tileId: string) => {
      if (!isMe) return;
      if (!swimTargets[tileId]) return;
      const tile = gameState?.tiles.find((t: Tile) => t.id === tileId);
      if (!tile) return;
      swim(tile.position.row, tile.position.col);
    },
    [isMe, swimTargets, gameState?.tiles, swim]
  );

  if (!swimmingPlayer) return null;

  return (
    <OverlayBackdrop opacity={0.6}>
      <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
        {/* Board at reduced scale */}
        <div style={{ transform: 'scale(.7)', transformOrigin: 'center' }}>
          <IslandGrid
            tiles={tiles}
            tileSize={92}
            gap={7}
            states={tileStates}
            targets={swimTargets as Record<string, 'swim'>}
            pawnsOnTile={pawnsOnTile}
            onTileClick={handleTileClick}
          />
        </div>

        {/* Info panel */}
        <div style={{ maxWidth: 280 }}>
          <Pill tone="danger">SINKING</Pill>
          <div
            className="fi-display"
            style={{ fontSize: 30, color: 'var(--c-parch)', marginTop: 10, lineHeight: 1.15 }}
          >
            <span className="fi-display-i">{swimmingPlayer.name}</span> must swim to safety.
          </div>
          <div style={{ fontSize: 12, color: 'var(--c-sand)', marginTop: 8, lineHeight: 1.5 }}>
            {sunkTileName} has sunk beneath the waves.
            {isMe
              ? ' Pick an adjacent, non-sunk tile to swim to.'
              : ` Waiting for ${swimmingPlayer.name} to choose...`}
            {' '}If no tile is reachable, {swimmingPlayer.name} drowns.
          </div>
          <div
            className="fi-mono"
            style={{ marginTop: 14, fontSize: 10, color: 'var(--c-flame)', letterSpacing: '.12em' }}
          >
            {safeCount} SAFE TILE{safeCount !== 1 ? 'S' : ''} AVAILABLE
          </div>
        </div>
      </div>
    </OverlayBackdrop>
  );
}
