export const SEAT_LABELS: Record<string, string> = {
  NORTH: "North",
  EAST: "East",
  SOUTH: "South",
  WEST: "West",
};

export const SEAT_LABELS_LOWER: Record<string, string> = {
  north: "North",
  east: "East",
  south: "South",
  west: "West",
};

export const SEATS = ["north", "east", "south", "west"] as const;

export const SEAT_ORDER = ["NORTH", "EAST", "SOUTH", "WEST"];

export const SUIT_SYMBOLS: Record<string, string> = {
  HEARTS: "\u2665",
  DIAMONDS: "\u2666",
  CLUBS: "\u2663",
  SPADES: "\u2660",
};

export const SUITS = [
  { key: "HEARTS", symbol: "\u2665", color: "#d32f2f" },
  { key: "DIAMONDS", symbol: "\u2666", color: "#d32f2f" },
  { key: "CLUBS", symbol: "\u2663", color: "#333" },
  { key: "SPADES", symbol: "\u2660", color: "#333" },
];

export const TEAM_FOR_SEAT: Record<string, string> = {
  NORTH: "NS",
  SOUTH: "NS",
  EAST: "EW",
  WEST: "EW",
};

export const CARDS_PER_PLAYER = 12;

export const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 10000];
