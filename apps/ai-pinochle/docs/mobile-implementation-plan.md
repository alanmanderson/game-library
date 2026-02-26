# Mobile App Implementation Plan

## Overview
Port the web React app to a React Native (Expo) mobile app for Android, matching all functionality.

## Architecture Decisions
1. **Expo SDK 51** - Managed workflow for easy Android builds
2. **React Navigation** (native-stack) - Stack-based navigation (Register -> Lobby -> Room/Game)
3. **AsyncStorage** - Replaces localStorage for auth token persistence
4. **No Google OAuth** - Email/password only (Google OAuth requires significant native config)
5. **Card images served from FastAPI** - Add static file mount to server for `/img/`
6. **Card backs** - Styled View component (avoids SVG dependency)
7. **State management** - React hooks (same pattern as web)

## Navigation Flow
```
AuthProvider
  ├── Not authenticated → RegisterScreen
  └── Authenticated → Stack Navigator
        ├── LobbyScreen (create/join room)
        └── RoomScreen (seat selection → inline GameView when started)
```

RoomScreen conditionally renders GameView inline (not separate screen) to share the WebSocket connection, matching the web pattern exactly.

## File Structure
```
mobile/
├── App.tsx                    # Root: AuthProvider + NavigationContainer
├── app.json                   # Expo config
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript
├── babel.config.js            # Babel preset
├── metro.config.js            # Workspace resolution
└── src/
    ├── config.ts              # API_BASE, WS_BASE, IMAGE_BASE URLs
    ├── api/client.ts          # HTTP client (post, postAuth)
    ├── auth/
    │   ├── AuthContext.tsx     # Auth state + AsyncStorage
    │   └── RegisterScreen.tsx # Email/password registration
    ├── hooks/useWebSocket.ts  # WebSocket with auto-reconnect
    ├── lobby/LobbyScreen.tsx  # Create/join room
    ├── room/RoomScreen.tsx    # Seat selection + game rendering
    └── game/
        ├── GameScreen.tsx     # Main game state machine (all 19 events)
        ├── tableOrder.ts      # Seat positioning utility
        ├── CardImage.tsx      # Card image component (loads from server)
        ├── PlayerAvatar.tsx   # Player name + colored circle
        ├── OtherPlayerHand.tsx # Face-down cards for opponents
        ├── HandDisplay.tsx    # Player's hand with sorting + trump highlights
        ├── BiddingPhase.tsx   # Bid input + pass button
        ├── TrumpPhase.tsx     # 4 suit buttons + shoot the moon
        ├── PassCardsPhase.tsx # Select 3 cards to pass
        ├── MeldPhase.tsx      # Display all melds + acknowledge
        ├── TrickPhase.tsx     # Trick table with 4 positions
        └── HandResult.tsx     # Score table + acknowledge

## Server Change
- Add `StaticFiles` mount at `/img/` in FastAPI to serve card images to mobile

## Implementation Order
1. Server static file serving
2. Mobile project config files
3. Core infrastructure (config, API client, auth, WebSocket)
4. Navigation + Register screen
5. Lobby + Room screens
6. Game screen + all phase components
7. Build verification
```
