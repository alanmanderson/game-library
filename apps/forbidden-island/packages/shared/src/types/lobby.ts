import type { Difficulty } from './game.js';
import type { RoleName } from './tiles.js';

export interface LobbyPlayer {
  id: string;
  name: string;
  role: RoleName | null;
  isHost: boolean;
  isConnected: boolean;
}

export interface LobbyState {
  gameId: string;
  hostId: string;
  difficulty: Difficulty;
  players: LobbyPlayer[];
  maxPlayers: number;
}

export interface GameListEntry {
  gameId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  difficulty: Difficulty;
}
