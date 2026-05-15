import { useMemo, useCallback, useState } from 'react';
import { Frame } from '../ui/Frame';
import { Button } from '../ui/Button';
import { IslandGrid } from '../board/IslandGrid';
import { PlayerPawn } from '../board/PlayerPawn';
import { useStore } from '../../store/store';
import { useActions } from '../../hooks/useActions';
import { OverlayBackdrop } from './OverlayBackdrop';
import { flattenLayout, SAMPLE_LAYOUT, TILES_BY_ID } from '../../data/tiles';
import { ROLES_BY_ID } from '../../data/roles';
import type { Tile } from '@forbidden-island/shared/types/tiles';
import type { ClientPlayerView } from '@forbidden-island/shared/types/players';
import type { ReactNode } from 'react';

export function NavigatorOverlay() {
  const gameState = useStore((s) => s.gameState);
  const overlayData = useStore((s) => s.overlayData);
  const updateOverlayData = useStore((s) => s.updateOverlayData);
  const closeOverlay = useStore((s) => s.closeOverlay);
  const { dispatch } = useActions();

  const myId = gameState?.myPlayerId;
  const [selectedPawnId, setSelectedPawnId] = useState<string | null>(
    overlayData.navigatorTargetPlayerId ?? null
  );
  const [hops, setHops] = useState<Array<{ from: string; to: string }>>(
    overlayData.navigatorHops ?? []
  );

  // Other players (not the navigator)
  const otherPlayers = useMemo(() => {
    if (!gameState?.players) return [];
    return gameState.players.filter((p: ClientPlayerView) => p.id !== myId);
  }, [gameState?.players, myId]);

  const selectedPlayer = gameState?.players.find(
    (p: ClientPlayerView) => p.id === selectedPawnId
  );

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

  // Valid move targets for the selected pawn (normal movement: orthogonal, non-sunk)
  const moveTargets = useMemo(() => {
    if (!selectedPlayer || !gameState?.tiles) return {};
    const pos = selectedPlayer.position;
    const targets: Record<string, string> = {};
    gameState.tiles.forEach((t: Tile) => {
      if (t.state === 'sunk') return;
      const dr = Math.abs(t.position.row - pos.row);
      const dc = Math.abs(t.position.col - pos.col);
      if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
        targets[t.id] = 'move';
      }
    });
    return targets;
  }, [selectedPlayer, gameState?.tiles]);

  // Find selected player's current tile id
  const selectedPlayerTileId = useMemo(() => {
    if (!selectedPlayer || !gameState?.tiles) return null;
    const t = gameState.tiles.find(
      (tile: Tile) =>
        tile.position.row === selectedPlayer.position.row &&
        tile.position.col === selectedPlayer.position.col
    );
    return t?.id ?? null;
  }, [selectedPlayer, gameState?.tiles]);

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
        <PlayerPawn
          key={p.id}
          role={p.role}
          kind="portrait"
          size={28}
          isActive={p.id === selectedPawnId || p.id === myId}
        />
      );
    });
    return map;
  }, [gameState?.players, gameState?.tiles, selectedPawnId, myId]);

  const handleTileClick = useCallback(
    (tileId: string) => {
      if (!selectedPawnId || hops.length >= 2) return;
      if (!moveTargets[tileId]) return;
      const tile = gameState?.tiles.find((t: Tile) => t.id === tileId);
      if (!tile) return;

      // Send the navigator_move action for this hop
      dispatch({
        type: 'navigator_move',
        targetPlayerId: selectedPawnId,
        targetPosition: tile.position,
      });

      const fromTileId = selectedPlayerTileId ?? '?';
      const fromName = TILES_BY_ID[fromTileId]?.name ?? fromTileId;
      const toName = TILES_BY_ID[tileId]?.name ?? tileId;
      const newHops = [...hops, { from: fromName, to: toName }];
      setHops(newHops);
      updateOverlayData({ navigatorHops: newHops });

      // If 2 hops done, close
      if (newHops.length >= 2) {
        setTimeout(() => closeOverlay(), 300);
      }
    },
    [selectedPawnId, hops, moveTargets, gameState?.tiles, dispatch, selectedPlayerTileId, updateOverlayData, closeOverlay]
  );

  const handleDone = useCallback(() => {
    closeOverlay();
  }, [closeOverlay]);

  const role = selectedPlayer ? ROLES_BY_ID[selectedPlayer.role] : null;

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
              targets={selectedPawnId ? (moveTargets as Record<string, 'move'>) : {}}
              selected={selectedPlayerTileId}
              pawnsOnTile={pawnsOnTile}
              onTileClick={handleTileClick}
            />
          </div>
        </div>

        {/* Right panel */}
        <Frame tone="ink2" padded={false} style={{ padding: 18, alignSelf: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PlayerPawn role="navigator" size={44} isActive />
            <div>
              <div className="fi-cap" style={{ color: 'var(--c-brassHi)' }}>
                Navigator - Move Another
              </div>
              <div className="fi-display" style={{ fontSize: 18, color: 'var(--c-parch)' }}>
                {selectedPlayer
                  ? `Guiding the ${role?.name ?? selectedPlayer.role}`
                  : 'Pick a crew-mate'}
              </div>
            </div>
          </div>

          {/* Step 1: Select pawn */}
          <div className="fi-cap" style={{ marginTop: 14 }}>
            Step 1 of 2 -- Selected pawn
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {otherPlayers.map((p: ClientPlayerView) => {
              const isSelected = selectedPawnId === p.id;
              const pRole = ROLES_BY_ID[p.role];
              return (
                <button
                  key={p.id}
                  className="fi"
                  onClick={() => {
                    setSelectedPawnId(p.id);
                    setHops([]);
                    updateOverlayData({ navigatorTargetPlayerId: p.id, navigatorHops: [] });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: isSelected ? 'rgba(232,196,122,.1)' : 'rgba(8,22,28,.4)',
                    border: `1px solid ${isSelected ? 'var(--c-brassHi)' : 'rgba(202,160,82,.2)'}`,
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <PlayerPawn role={p.role} size={28} />
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--c-parch)' }}>
                    {p.name} - {pRole?.name ?? p.role}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Step 2: Hop tracking */}
          <div className="fi-cap" style={{ marginTop: 14 }}>
            Step 2 -- Up to two tiles
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <div
              style={{
                flex: 1,
                padding: '6px 8px',
                background: hops[0] ? 'rgba(8,22,28,.5)' : 'rgba(8,22,28,.3)',
                borderRadius: 6,
                fontSize: 10.5,
                color: 'var(--c-sand)',
                fontFamily: 'var(--ff-mono)',
              }}
            >
              HOP 1:{' '}
              <span style={{ color: hops[0] ? 'var(--c-brassHi)' : undefined }}>
                {hops[0] ? `${hops[0].from} \u2192 ${hops[0].to}` : '\u2014'}
              </span>
            </div>
            <div
              style={{
                flex: 1,
                padding: '6px 8px',
                background: hops[1] ? 'rgba(8,22,28,.5)' : 'rgba(8,22,28,.3)',
                borderRadius: 6,
                fontSize: 10.5,
                color: 'var(--c-sand2)',
                fontFamily: 'var(--ff-mono)',
              }}
            >
              HOP 2:{' '}
              <span style={{ opacity: hops[1] ? 1 : 0.6 }}>
                {hops[1] ? `${hops[1].from} \u2192 ${hops[1].to}` : '\u2014'}
              </span>
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: 'var(--c-sand2)', marginTop: 8, lineHeight: 1.4 }}>
            Uses normal movement rules (not the target's special ability). Costs the Navigator 1 action.
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button kind="ghost" size="sm" onClick={closeOverlay}>
              Cancel
            </Button>
            <Button kind="quiet" size="sm" disabled={hops.length === 0} onClick={handleDone}>
              Done ({hops.length} tile{hops.length !== 1 ? 's' : ''})
            </Button>
          </div>
        </Frame>
      </div>
    </OverlayBackdrop>
  );
}
