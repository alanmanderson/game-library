import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Lobby from './components/Lobby';
import GameView from './components/GameView';
import AuthCallback from './components/AuthCallback';
import BuildInfo from './components/BuildInfo';
import './App.css';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/game/:gameId" element={<GameView />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
        </Routes>
        <BuildInfo />
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
