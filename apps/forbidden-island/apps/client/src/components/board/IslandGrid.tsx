import type { CSSProperties, ReactNode } from 'react';
import { BOARD_MASK, TILES_BY_ID, flattenLayout, type GridTile } from '../../data/tiles';
import { Tile, type TileTarget } from './Tile';

interface IslandGridProps {
  tiles?: GridTile[];
  states?: Record<string, 'normal' | 'flooded' | 'sunk'>;
  targets?: Record<string, TileTarget>;
  selected?: string | null;
  captured?: string[];
  dangerTiles?: string[];
  pawnsOnTile?: Record<string, ReactNode[]>;
  tileSize?: number;
  gap?: number;
  showNames?: boolean;
  onTileClick?: (tileId: string) => void;
  style?: CSSProperties;
}

export function IslandGrid({
  tiles = flattenLayout(),
  states = {},
  targets = {},
  selected = null,
  captured = [],
  dangerTiles = [],
  pawnsOnTile = {},
  tileSize = 100,
  gap = 8,
  showNames = true,
  onTileClick,
  style,
}: IslandGridProps) {
  return (
    <div style={{ display: 'inline-block', padding: 14, background: 'transparent', ...style }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {BOARD_MASK.map((row, r) => (
          <div key={r} style={{ display: 'flex', gap, justifyContent: 'center' }}>
            {row.map((cell, c) => {
              if (!cell) {
                return <div key={c} style={{ width: tileSize, height: tileSize }} />;
              }
              const t = tiles.find((x) => x.row === r && x.col === c);
              if (!t) {
                return (
                  <div
                    key={c}
                    style={{
                      width: tileSize,
                      height: tileSize,
                      opacity: 0.4,
                      border: '1px dashed rgba(202,160,82,.2)',
                      borderRadius: 8,
                    }}
                  />
                );
              }
              const tdef = TILES_BY_ID[t.id];
              const tileState = states[t.id] || 'normal';
              const isCapt = tdef?.treasure ? captured.includes(tdef.treasure) : false;
              return (
                <Tile
                  key={t.id}
                  id={t.id}
                  state={tileState}
                  size={tileSize}
                  target={targets[t.id] as TileTarget}
                  selected={selected === t.id}
                  captured={isCapt}
                  danger={dangerTiles.includes(t.id)}
                  showName={showNames}
                  pawns={pawnsOnTile[t.id] || []}
                  onClick={onTileClick ? () => onTileClick(t.id) : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
