export const config = {
  port: parseInt(process.env.PORT || "8080", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  allowedOrigin: process.env.ALLOWED_ORIGIN || "*",
  logLevel: process.env.LOG_LEVEL || "info",

  // Game limits
  minPlayers: 4,
  maxPlayers: 20,

  // Timer defaults (seconds)
  defaultDrawingTimer: 60 as const,
  defaultGuessingTimer: 30 as const,
  defaultPromptTimer: 30 as const,

  // Valid timer options
  drawingTimerOptions: [30, 45, 60, 90, 120] as const,
  guessingTimerOptions: [15, 20, 30, 45, 60] as const,
  promptTimerOptions: [15, 20, 30, 45, 60] as const,

  // Grace period for submissions after timer expires (ms)
  gracePeriodMs: 2000,

  // Transition screen duration between rounds (ms)
  transitionDurationMs: 3000,

  // Timer tick interval for clock sync (ms)
  tickIntervalMs: 10000,

  // Disconnect reconnection window (ms)
  disconnectTimeoutMs: 60000,

  // Cleanup timers
  endedGameCleanupMs: 10 * 60 * 1000,       // 10 minutes
  emptyGameCleanupMs: 2 * 60 * 1000,        // 2 minutes
  lobbyNoPlayersCleanupMs: 5 * 60 * 1000,   // 5 minutes
  periodicSweepIntervalMs: 5 * 60 * 1000,   // 5 minutes

  // Content limits
  maxPromptLength: 80,
  maxDisplayNameLength: 16,
  minDisplayNameLength: 2,
  maxDrawingSizeBytes: 500 * 1024,           // 500KB
  maxRequestBodySize: "1mb",

  // Socket.IO
  maxHttpBufferSize: 1e6,                    // 1MB

  // Rate limiting (relaxed in test/development to avoid E2E flakiness)
  createGameRateLimit: { windowMs: 60 * 60 * 1000, max: process.env.NODE_ENV === 'test' ? 1000 : 5 },
  joinGameRateLimit: { windowMs: 60 * 1000, max: process.env.NODE_ENV === 'test' ? 1000 : 20 },
  getGameRateLimit: { windowMs: 60 * 1000, max: process.env.NODE_ENV === 'test' ? 1000 : 60 },
  getResultsRateLimit: { windowMs: 60 * 1000, max: process.env.NODE_ENV === 'test' ? 1000 : 10 },

  // Display name validation
  displayNameRegex: /^[a-zA-Z0-9 ]+$/,

  // Game code
  codeLength: 4,
  codeAlphabet: "ABCDEFGHJKMNPQRSTUVWXYZ",  // excludes I, O, L
} as const;
