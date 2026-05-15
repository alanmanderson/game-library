import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useCallback } from 'react';
import { ScreenBg } from '../ui/ScreenBg';
import { BrandMark } from '../ui/BrandMark';
import { Frame } from '../ui/Frame';
import { TurnIndicator } from '../status/TurnIndicator';
import { IslandGrid } from '../board/IslandGrid';
import { PlayerPawn } from '../board/PlayerPawn';
import { PlayerInfo } from '../players/PlayerInfo';
import { TreasureTracker } from '../status/TreasureTracker';
import { WaterMeter } from '../status/WaterMeter';
import { TreasureCard } from '../cards/TreasureCard';
import { DeckStack } from '../cards/DeckStack';
import { ActionBar } from '../actions/ActionBar';
import { useStore } from '../../store/store';
import { flattenLayout, SAMPLE_LAYOUT } from '../../data/tiles';
import type { Tile } from '@forbidden-island/shared/types/tiles';
import type { ClientPlayerView } from '@forbidden-island/shared/types/players';
import type { TreasureCard as TreasureCardType } from '@forbidden-island/shared/types/cards';

interface TabletGameLayoutProps {
  validTargets: Record<string, string>;
  onActionSelect: (id: string) => void;
  onTileClick: (tileId: string) => void;
}

export function TabletGameLayout({ validTargets, onActionSelect, onTileClick }: TabletGameLayoutProps) {
  const gameState = useStore((s) => s.gameState);
  const activeMode = useStore((s) => s.activeActionMode);
  const selectedTile = useStore((s) => s.selectedTile);

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

  const myId = gameState?.myPlayerId;
  const currentPlayerIdx = gameState?.currentPlayerIndex ?? 0;
  const currentPlayer = gameState?.players[currentPlayerIdx];
  const isMyTurn = currentPlayer?.id === myId;
  const me = gameState?.players.find((p: ClientPlayerView) => p.id === myId);
  const myHand = me?.hand || [];
  const phase = gameState?.phase ?? 'action';
  const actionsRemaining = gameState?.actionsRemaining ?? 3;

  const pawnsOnTile = useMemo(() => {
    if (!gameState?.players) return {};
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
          size={24}
          isActive={p.id === currentPlayer?.id}
          dim={!p.isConnected}
        />
      );
    });
    return map;
  }, [gameState?.players, gameState?.tiles, currentPlayer?.id]);

  const available = useMemo(() => ({
    move: isMyTurn && phase === 'action' && actionsRemaining > 0,
    shore: isMyTurn && phase === 'action' && actionsRemaining > 0,
    give: isMyTurn && phase === 'action' && actionsRemaining > 0,
    capture: isMyTurn && phase === 'action' && actionsRemaining > 0,
    end: isMyTurn && phase === 'action',
  }), [isMyTurn, phase, actionsRemaining]);

  const playerData = useMemo(() => {
    if (!gameState?.players) return [];
    return gameState.players.map((p: ClientPlayerView) => ({
      name: p.name,
      role: p.role,
      isYou: p.id === myId,
      isActive: p.id === currentPlayer?.id,
      handCount: p.handCount,
      isConnected: p.isConnected,
    }));
  }, [gameState?.players, myId, currentPlayer?.id]);

  return (
    <ScreenBg>
      <div style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        height: '100%',
        gap: 10,
        padding: 12,
      }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandMark size="sm" />
          <div style={{ flex: 1 }} />
          <TurnIndicator
            currentPlayer={currentPlayer?.name || '---'}
            role={currentPlayer?.role}
            actionsRemaining={actionsRemaining}
            isYou={isMyTurn}
            phase={phase}
            style={{ flex: '0 0 auto' }}
          />
        </div>

        {/* Main: board + sidebar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 10, minHeight: 0 }}>
          {/* Board area */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IslandGrid
              tiles={tiles}
              tileSize={86}
              gap={7}
              states={tileStates}
              targets={validTargets as any}
              selected={selectedTile}
              captured={gameState?.capturedTreasures || []}
              pawnsOnTile={pawnsOnTile}
              onTileClick={onTileClick}
            />
          </div>

          {/* Right sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
            <Frame tone="ink2" padded={false} style={{ padding: 10 }}>
              <div className="fi-cap" style={{ marginBottom: 6 }}>Crew</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {playerData.map((p) => (
                  <PlayerInfo
                    key={p.name}
                    name={p.name}
                    role={p.role}
                    isActive={p.isActive}
                    isYou={p.isYou}
                    handCount={p.handCount}
                    isConnected={p.isConnected ?? true}
                    pawnKind="portrait"
                  />
                ))}
              </div>
            </Frame>
            <Frame tone="ink2" padded={false} style={{ padding: 10 }}>
              <TreasureTracker captured={gameState?.capturedTreasures || []} layout="column" />
            </Frame>
            <Frame tone="ink2" padded={false} style={{ padding: 10, display: 'flex', justifyContent: 'center' }}>
              <WaterMeter level={gameState?.waterLevel ?? 2} compact />
            </Frame>
          </div>
        </div>

        {/* Bottom: hand/decks + actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Frame tone="ink2" padded={false} style={{ padding: 10 }}>
            <div className="fi-cap" style={{ marginBottom: 6 }}>Hand &middot; {myHand.length}/5</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {myHand.map((h: TreasureCardType, i: number) => (
                <TreasureCard key={h.id || i} type={h.type} width={70} height={100} />
              ))}
              <div style={{ flex: 1 }} />
              <DeckStack count={gameState?.treasureDeck.drawPileCount ?? 16} width={50} height={70} label="Treasure" />
              <DeckStack count={gameState?.floodDeck.drawPileCount ?? 11} width={50} height={70} label="Flood" tone="flood" />
            </div>
          </Frame>
          <ActionBar
            available={available}
            hint={{}}
            activeMode={activeMode}
            onSelect={onActionSelect}
          />
        </div>
      </div>
    </ScreenBg>
  );
}
