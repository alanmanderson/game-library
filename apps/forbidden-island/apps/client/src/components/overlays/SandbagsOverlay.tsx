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
import type { Tile } from '@forbidden-island/shared/types/tiles';
import type { ClientPlayerView } from '@forbidden-island/shared/types/players';
import type { ReactNode } from 'react';

export function SandbagsOverlay() {
  const gameState = useStore((s) => s.gameState);
  const overlayData = useStore((s) => s.overlayData);
  const closeOverlay = useStore((s) => s.closeOverlay);
  const { playSandbags, discard } = useActions();

  const cardId = overlayData.sandbagsCardId ?? '';

  // Tiles
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

  // All flooded tiles are valid targets
  const shoreTargets = useMemo(() => {
    if (!gameState?.tiles) return {};
    const targets: Record<string, string> = {};
    gameState.tiles.forEach((t: Tile) => {
      if (t.state === 'flooded') {
        targets[t.id] = 'shore';
      }
    });
    return targets;
  }, [gameState?.tiles]);

  const eligibleCount = Object.keys(shoreTargets).length;

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
      map[t.id].push(
        <PlayerPawn key={p.id} role={p.role} kind="portrait" size={28} isActive={false} />
      );
    });
    return map;
  }, [gameState?.players, gameState?.tiles]);

  const handleTileClick = useCallback(
    (tileId: string) => {
      if (!shoreTargets[tileId]) return;
      const tile = gameState?.tiles.find((t: Tile) => t.id === tileId);
      if (!tile) return;
      playSandbags(cardId, tile.position.row, tile.position.col);
      closeOverlay();
    },
    [shoreTargets, gameState?.tiles, playSandbags, cardId, closeOverlay]
  );

  const handleDiscardInstead = useCallback(() => {
    if (cardId) {
      discard(cardId);
    }
    closeOverlay();
  }, [cardId, discard, closeOverlay]);

  return (
    <OverlayBackdrop opacity={0.65}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          width: '100%',
          maxWidth: 900,
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
              targets={shoreTargets as Record<string, 'shore'>}
              pawnsOnTile={pawnsOnTile}
              onTileClick={handleTileClick}
            />
          </div>
        </div>

        {/* Right panel */}
        <Frame tone="ink2" padded={false} style={{ padding: 18, alignSelf: 'center' }}>
          <TreasureCard type="sandbags" width={180} height={250} glow style={{ margin: '0 auto', display: 'block' }} />

          <div className="fi-cap" style={{ marginTop: 14 }}>
            Pick a flooded tile
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-sand)', marginTop: 4, lineHeight: 1.5 }}>
            Sandbags shore up{' '}
            <span className="fi-display-i" style={{ color: 'var(--c-brassHi)' }}>
              any
            </span>{' '}
            flooded tile on the entire island. No action cost. The card discards on use.
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="fi-mono" style={{ fontSize: 10, color: 'var(--c-brass)', letterSpacing: '.12em' }}>
              {eligibleCount} ELIGIBLE TILE{eligibleCount !== 1 ? 'S' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button kind="ghost" size="sm" onClick={closeOverlay}>
              Cancel
            </Button>
            <Button kind="quiet" size="sm" onClick={handleDiscardInstead}>
              Discard Instead
            </Button>
          </div>
        </Frame>
      </div>
    </OverlayBackdrop>
  );
}
