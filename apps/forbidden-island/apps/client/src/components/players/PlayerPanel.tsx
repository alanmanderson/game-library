import type { CSSProperties } from 'react';
import { Frame } from '../ui/Frame';
import { PlayerInfo } from './PlayerInfo';
import type { PawnKind } from '../board/PlayerPawn';

interface PlayerData {
  name: string;
  role: string;
  isYou?: boolean;
  isActive?: boolean;
  handCount: number;
  isConnected?: boolean;
}

interface PlayerPanelProps {
  players: PlayerData[];
  pawnKind?: PawnKind;
  style?: CSSProperties;
}

export function PlayerPanel({ players, pawnKind = 'portrait', style }: PlayerPanelProps) {
  return (
    <Frame tone="ink2" padded={false} style={{ padding: 14, ...style }}>
      <div className="fi-cap" style={{ marginBottom: 8 }}>Crew - {players.length} aboard</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {players.map((p) => (
          <PlayerInfo
            key={p.name}
            name={p.name}
            role={p.role}
            isActive={p.isActive}
            isYou={p.isYou}
            handCount={p.handCount}
            isConnected={p.isConnected ?? true}
            pawnKind={pawnKind}
          />
        ))}
      </div>
    </Frame>
  );
}
