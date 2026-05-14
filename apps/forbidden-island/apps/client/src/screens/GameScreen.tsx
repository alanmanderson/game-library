import { useMemo, useCallback, type ReactNode } from 'react';
import { ScreenBg } from '../components/ui/ScreenBg';
import { BrandMark } from '../components/ui/BrandMark';
import { Frame } from '../components/ui/Frame';
import { TurnIndicator } from '../components/status/TurnIndicator';
import { IslandGrid } from '../components/board/IslandGrid';
import { PlayerPawn } from '../components/board/PlayerPawn';
import { PlayerPanel } from '../components/players/PlayerPanel';
import { TreasureTracker } from '../components/status/TreasureTracker';
import { WaterMeter } from '../components/status/WaterMeter';
import { TreasureCard } from '../components/cards/TreasureCard';
import { DeckStack } from '../components/cards/DeckStack';
import { GameLog } from '../components/status/GameLog';
import { ActionBar } from '../components/actions/ActionBar';
import { useStore } from '../store/store';
import { flattenLayout, SAMPLE_LAYOUT } from '../data/tiles';
import type { Tile } from '@forbidden-island/shared/types/tiles';
import type { ClientPlayerView } from '@forbidden-island/shared/types/players';
import type { GameLogEntry } from '@forbidden-island/shared/types/game';
import type { TreasureCard as TreasureCardType } from '@forbidden-island/shared/types/cards';

export function GameScreen() {
  const gameState = useStore((s) => s.gameState);
  const activeMode = useStore((s) => s.activeActionMode);
  const validTargets = useStore((s) => s.validTargets);
  const selectedTile = useStore((s) => s.selectedTile);
  const send = useStore((s) => s.send);
  const setActiveMode = useStore((s) => s.setActiveActionMode);
  const setSelectedTile = useStore((s) => s.setSelectedTile);

  // Derive board data from game state
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

  // Build pawn map
  const pawnsOnTile = useMemo(() => {
    if (!gameState?.players) return {};
    const map: Record<string, ReactNode[]> = {};
    gameState.players.forEach((p: ClientPlayerView) => {
      // find tile at player position
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
          isActive={p.id === currentPlayer?.id}
          dim={!p.isConnected}
        />
      );
    });
    return map;
  }, [gameState?.players, gameState?.tiles, currentPlayer?.id]);

  // Action availability
  const available = useMemo(() => ({
    move: isMyTurn && phase === 'action' && actionsRemaining > 0,
    shore: isMyTurn && phase === 'action' && actionsRemaining > 0,
    give: isMyTurn && phase === 'action' && actionsRemaining > 0,
    capture: isMyTurn && phase === 'action' && actionsRemaining > 0,
    end: isMyTurn && phase === 'action',
  }), [isMyTurn, phase, actionsRemaining]);

  const handleActionSelect = useCallback((id: string) => {
    if (id === 'end') {
      send({ type: 'game:action', action: { type: 'end_actions' } });
      return;
    }
    setActiveMode(activeMode === id ? null : id);
  }, [activeMode, send, setActiveMode]);

  const handleTileClick = useCallback((tileId: string) => {
    if (!activeMode || !isMyTurn) return;
    const tgt = validTargets[tileId];
    if (!tgt) {
      setSelectedTile(tileId);
      return;
    }
    // find tile position
    const tile = gameState?.tiles.find((t: Tile) => t.id === tileId);
    if (!tile) return;
    const pos = tile.position;

    if (activeMode === 'move') {
      send({ type: 'game:action', action: { type: 'move', targetPosition: pos } });
    } else if (activeMode === 'shore') {
      send({ type: 'game:action', action: { type: 'shore_up', targetPosition: pos } });
    }
    setActiveMode(null);
    setSelectedTile(null);
  }, [activeMode, isMyTurn, validTargets, gameState?.tiles, send, setActiveMode, setSelectedTile]);

  // Convert targets record to tile target type
  const targetMap = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(validTargets).forEach(([k, v]) => { m[k] = v; });
    return m;
  }, [validTargets]);

  // Log entries
  const logEntries = useMemo(() => {
    if (!gameState?.log) return [];
    return gameState.log.slice(-20).reverse().map((e: GameLogEntry) => ({
      turn: gameState.turnNumber,
      text: e.message,
      tone: e.type === 'flood' ? 'danger' as const : e.type === 'treasure' ? 'good' as const : undefined,
    }));
  }, [gameState?.log, gameState?.turnNumber]);

  // Player data for panel
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
        position: 'relative', zIndex: 1,
        display: 'grid',
        gridTemplateColumns: '280px 1fr 320px',
        gridTemplateRows: 'auto 1fr auto',
        gridTemplateAreas: `"left  top    right"
                            "left  board  right"
                            "left  action right"`,
        gap: 16, padding: 16, height: '100%', boxSizing: 'border-box',
      }}>
        {/* TOP BAR */}
        <div style={{ gridArea: 'top', display: 'flex', gap: 10, alignItems: 'center' }}>
          <BrandMark size="sm" />
          <div style={{ flex: 1 }} />
          <TurnIndicator
            currentPlayer={currentPlayer?.name || '---'}
            role={currentPlayer?.role}
            actionsRemaining={actionsRemaining}
            isYou={isMyTurn}
            phase={phase}
          />
        </div>

        {/* LEFT SIDEBAR */}
        <div style={{ gridArea: 'left', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
          <PlayerPanel players={playerData} />
          <Frame tone="ink2" padded={false} style={{ padding: 14 }}>
            <TreasureTracker captured={gameState?.capturedTreasures || []} layout="column" />
          </Frame>
          <Frame tone="ink2" padded={false} style={{ padding: 14, display: 'flex', justifyContent: 'center' }}>
            <WaterMeter level={gameState?.waterLevel ?? 2} compact />
          </Frame>
        </div>

        {/* BOARD */}
        <div style={{ gridArea: 'board', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 60% at 50% 50%, rgba(58,151,168,.12) 0%, transparent 70%)' }} />
          <IslandGrid
            tiles={tiles}
            tileSize={108}
            gap={9}
            states={tileStates}
            targets={targetMap as any}
            selected={selectedTile}
            captured={gameState?.capturedTreasures || []}
            pawnsOnTile={pawnsOnTile}
            onTileClick={handleTileClick}
          />
        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{ gridArea: 'right', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
          <Frame tone="ink2" padded={false} style={{ padding: 14 }}>
            <div className="fi-cap" style={{ marginBottom: 10 }}>Your Hand - {myHand.length} / 5</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {myHand.map((h: TreasureCardType, i: number) => (
                <TreasureCard key={h.id || i} type={h.type} width={84} height={120} />
              ))}
            </div>
          </Frame>
          <Frame tone="ink2" padded={false} style={{ padding: 14 }}>
            <div className="fi-cap" style={{ marginBottom: 10 }}>Decks</div>
            <div style={{ display: 'flex', gap: 18, justifyContent: 'space-around' }}>
              <DeckStack count={gameState?.treasureDeck.drawPileCount ?? 16} width={66} height={94} label="Treasure" />
              <DeckStack count={gameState?.floodDeck.drawPileCount ?? 11} width={66} height={94} label="Flood" tone="flood" />
            </div>
          </Frame>
          <Frame tone="ink2" padded={false} style={{ padding: 14, flex: 1, minHeight: 0 }}>
            <GameLog entries={logEntries} />
          </Frame>
        </div>

        {/* ACTION BAR */}
        <div style={{ gridArea: 'action' }}>
          <ActionBar
            available={available}
            hint={{}}
            activeMode={activeMode}
            onSelect={handleActionSelect}
          />
        </div>
      </div>
    </ScreenBg>
  );
}
