import { useState, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScreenBg } from '../ui/ScreenBg';
import { Compass } from '../ui/Compass';
import { IslandGrid } from '../board/IslandGrid';
import { PlayerPawn } from '../board/PlayerPawn';
import { PlayerInfo } from '../players/PlayerInfo';
import { TreasureMark } from '../board/TreasureMark';
import { TreasureCard } from '../cards/TreasureCard';
import { GameLog } from '../status/GameLog';
import { ActionGlyph } from '../actions/ActionGlyph';
import { useStore } from '../../store/store';
import { flattenLayout, SAMPLE_LAYOUT, TREASURE_DATA, TILES_BY_ID } from '../../data/tiles';
import type { Tile } from '@forbidden-island/shared/types/tiles';
import type { ClientPlayerView } from '@forbidden-island/shared/types/players';
import type { GameLogEntry } from '@forbidden-island/shared/types/game';
import type { TreasureCard as TreasureCardType } from '@forbidden-island/shared/types/cards';

const ACTION_DEFS = [
  { id: 'move', name: 'Move', glyph: 'move' },
  { id: 'shore', name: 'Shore', glyph: 'shore' },
  { id: 'give', name: 'Give', glyph: 'give' },
  { id: 'capture', name: 'Capture', glyph: 'capt' },
  { id: 'end', name: 'End', glyph: 'end' },
] as const;

type SheetTab = 'cards' | 'crew' | 'log';

interface MobileGameLayoutProps {
  validTargets: Record<string, string>;
  onActionSelect: (id: string) => void;
  onTileClick: (tileId: string) => void;
}

export function MobileGameLayout({ validTargets, onActionSelect, onTileClick }: MobileGameLayoutProps) {
  const [activeSheet, setActiveSheet] = useState<SheetTab>('cards');
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
  const waterLevel = gameState?.waterLevel ?? 2;

  // Get the selected tile name for the floating pill
  const selectedTileDef = selectedTile ? TILES_BY_ID[selectedTile] : null;

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
          size={18}
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

  const logEntries = useMemo(() => {
    if (!gameState?.log) return [];
    return gameState.log.slice(-20).reverse().map((e: GameLogEntry) => ({
      turn: gameState.turnNumber,
      text: e.message,
      tone: e.type === 'flood' ? 'danger' as const : e.type === 'treasure' ? 'good' as const : undefined,
    }));
  }, [gameState?.log, gameState?.turnNumber]);

  // Role display name
  const currentRoleName = currentPlayer?.role
    ? currentPlayer.role.charAt(0).toUpperCase() + currentPlayer.role.slice(1)
    : '---';

  return (
    <ScreenBg>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Status header */}
        <div style={{
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(8,22,28,.6)',
          borderBottom: '1px solid rgba(202,160,82,.2)',
        }}>
          <Compass size={20} color="var(--c-brassHi)" />
          <div style={{ flex: 1 }}>
            <div className="fi-mono" style={{ fontSize: 9, color: 'var(--c-sand2)', letterSpacing: '.14em' }}>
              {isMyTurn ? 'YOUR TURN' : `${currentPlayer?.name?.toUpperCase() || '---'}'S TURN`} &middot; {actionsRemaining} ACTION{actionsRemaining !== 1 ? 'S' : ''}
            </div>
            <div className="fi-display" style={{ fontSize: 14, color: 'var(--c-parch)' }}>
              {currentPlayer?.name || '---'} &middot; {currentRoleName}
            </div>
          </div>
          {/* Water mini gauge */}
          <div style={{ textAlign: 'right' }}>
            <div className="fi-mono" style={{ fontSize: 8, color: 'var(--c-sand2)' }}>WATER</div>
            <div style={{ display: 'flex', gap: 1, marginTop: 2 }}>
              {[...Array(9)].map((_, i) => (
                <div key={i} style={{
                  width: 5,
                  height: 14,
                  borderRadius: 1,
                  background: i < waterLevel ? 'var(--c-sea2)' : 'transparent',
                  border: '1px solid rgba(202,160,82,.4)',
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Mini treasure tracker */}
        <div style={{
          display: 'flex',
          gap: 6,
          padding: '8px 12px',
          justifyContent: 'space-between',
          background: 'rgba(8,22,28,.4)',
        }}>
          {Object.keys(TREASURE_DATA).map((t) => {
            const captured = (gameState?.capturedTreasures || []).includes(t as any);
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: captured ? 1 : 0.55 }}>
                <TreasureMark treasure={t} captured={captured} size={18} />
                <div className="fi-mono" style={{
                  fontSize: 9,
                  color: captured ? 'var(--c-brassHi)' : 'var(--c-sand2)',
                }}>
                  {captured ? '\u2713' : '\u2014'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Board */}
        <div style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <div style={{ transform: 'scale(.86)' }}>
            <IslandGrid
              tiles={tiles}
              tileSize={52}
              gap={4}
              states={tileStates}
              showNames={false}
              targets={validTargets as any}
              selected={selectedTile}
              captured={gameState?.capturedTreasures || []}
              pawnsOnTile={pawnsOnTile}
              onTileClick={onTileClick}
            />
          </div>

          {/* Selected tile floating label */}
          {selectedTileDef && (
            <div style={{
              position: 'absolute',
              bottom: 8,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
            }}>
              <div style={{
                padding: '5px 10px',
                background: 'rgba(8,22,28,.85)',
                border: '1px solid var(--c-brassHi)',
                borderRadius: 14,
              }}>
                <div className="fi-display-i" style={{ fontSize: 13, color: 'var(--c-brassHi)' }}>
                  {selectedTileDef.name} &mdash; selected
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action drawer */}
        <div style={{
          padding: '8px 8px 4px',
          background: 'rgba(8,22,28,.7)',
          borderTop: '1px solid rgba(202,160,82,.18)',
        }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {ACTION_DEFS.map((a) => {
              const enabled = available[a.id] ?? false;
              const active = activeMode === a.id;
              return (
                <button
                  key={a.id}
                  className="fi"
                  disabled={!enabled}
                  onClick={() => onActionSelect(a.id)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 8,
                    background: active
                      ? 'linear-gradient(180deg,rgba(232,196,122,.2),rgba(202,160,82,.05))'
                      : 'rgba(8,22,28,.4)',
                    border: `1px solid ${active ? 'var(--c-brassHi)' : 'rgba(202,160,82,.2)'}`,
                    color: enabled ? 'var(--c-parch)' : 'rgba(232,212,166,.3)',
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: '.06em',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    cursor: enabled ? 'pointer' : 'not-allowed',
                    minHeight: 44,
                    justifyContent: 'center',
                  }}
                >
                  <ActionGlyph kind={a.glyph} size={16} color={active ? 'var(--c-brassHi)' : 'currentColor'} />
                  {a.name.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex',
          background: 'rgba(8,22,28,.95)',
          borderTop: '1px solid rgba(202,160,82,.18)',
        }}>
          {(['cards', 'crew', 'log'] as const).map((tab) => (
            <button
              key={tab}
              className="fi"
              onClick={() => setActiveSheet(tab)}
              style={{
                flex: 1,
                padding: '8px 0',
                textAlign: 'center',
                cursor: 'pointer',
                borderBottom: activeSheet === tab ? '2px solid var(--c-brassHi)' : '2px solid transparent',
                color: activeSheet === tab ? 'var(--c-brassHi)' : 'var(--c-sand2)',
                fontFamily: 'var(--ff-mono)',
                fontSize: 10,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                background: 'none',
                border: 'none',
                borderBottomStyle: 'solid',
                borderBottomWidth: 2,
                borderBottomColor: activeSheet === tab ? 'var(--c-brassHi)' : 'transparent',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {tab === 'cards' ? `Hand \u00B7 ${myHand.length}/5` : tab === 'crew' ? 'Crew' : 'Log'}
            </button>
          ))}
        </div>

        {/* Sheet body */}
        <div style={{
          padding: '10px 12px',
          background: 'var(--c-ink2)',
          borderTop: '1px solid rgba(202,160,82,.1)',
          height: 130,
          overflow: 'hidden',
        }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSheet}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              style={{ height: '100%' }}
            >
              {activeSheet === 'cards' && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', height: '100%', alignItems: 'flex-start' }}>
                  {myHand.map((h: TreasureCardType, i: number) => (
                    <TreasureCard key={h.id || i} type={h.type} width={74} height={104} />
                  ))}
                  {myHand.length === 0 && (
                    <div className="fi-display-i" style={{ fontSize: 13, color: 'var(--c-sand2)', padding: '20px 0' }}>
                      No cards in hand
                    </div>
                  )}
                </div>
              )}
              {activeSheet === 'crew' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', height: '100%' }}>
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
              )}
              {activeSheet === 'log' && (
                <GameLog entries={logEntries.slice(0, 4)} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </ScreenBg>
  );
}
