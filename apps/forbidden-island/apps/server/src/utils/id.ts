import { nanoid } from 'nanoid';

export function generateGameId(): string {
  return nanoid(8);
}

export function generatePlayerId(): string {
  return nanoid(12);
}

export function generateSecret(): string {
  return nanoid(24);
}

export function generateCardId(prefix: string): string {
  return `${prefix}_${nanoid(6)}`;
}
