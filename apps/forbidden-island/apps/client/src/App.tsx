import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomeScreen } from './screens/HomeScreen';
import { CreateGameScreen } from './screens/CreateGameScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { GameOverScreen } from './screens/GameOverScreen';
import { useWebSocket } from './hooks/useWebSocket';

function AppShell() {
  // Establish WebSocket connection once at app level
  useWebSocket();

  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/create" element={<CreateGameScreen />} />
      <Route path="/game/:id/lobby" element={<LobbyScreen />} />
      <Route path="/game/:id" element={<GameScreen />} />
      <Route path="/game/:id/results" element={<GameOverScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div data-palette="ocean" style={{ width: '100%', height: '100%' }}>
        <AppShell />
      </div>
    </BrowserRouter>
  );
}
