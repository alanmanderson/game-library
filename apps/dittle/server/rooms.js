// Room management for Dittle online play.
import { initialState, applyMove, legalMoves, normalizeVariant } from '../shared/engine.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

function randomCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> room
  }

  createRoom({ mode = 'pvp', aiDepth = 3, variant = 'traditional' } = {}) {
    let code;
    do { code = randomCode(); } while (this.rooms.has(code));
    const v = normalizeVariant(variant);
    const room = {
      code,
      mode,               // 'pvp' | 'ai'
      aiDepth,
      variant: v,         // 'traditional' | 'clash'
      state: initialState(v),
      players: [null, null], // sockets by player index
      names: ['Player 1', mode === 'ai' ? 'Computer' : 'Player 2'],
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get((code || '').toUpperCase());
  }

  deleteRoom(code) {
    this.rooms.delete(code);
  }

  // Which player slots are occupied.
  seatOf(room, socket) {
    return room.players.indexOf(socket);
  }
}

export { legalMoves, applyMove };
