import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import MainMenu from '@/screens/MainMenu';
import LoginScreen from '@/screens/LoginScreen';
import GameDashboard from '@/screens/GameDashboard';
import GameOver from '@/screens/GameOver';
import ProtectedRoute from '@/components/ProtectedRoute';
import ToastContainer from '@/components/ToastContainer';
import { useAuthInit } from '@/hooks/useAuthInit';
import { useAuthStore } from '@/stores/authStore';
import BuildInfo from '@/components/BuildInfo';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function AppRoutes() {
  const navigate = useNavigate();
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useAuthInit();

  useEffect(() => {
    const handler = () => {
      clearAuth();
      navigate('/login');
    };
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, [clearAuth, navigate]);

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainMenu />
            </ProtectedRoute>
          }
        />
        <Route
          path="/game/:id"
          element={
            <ProtectedRoute>
              <GameDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/game-over/:id"
          element={
            <ProtectedRoute>
              <GameOver />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppRoutes />
      <BuildInfo />
    </GoogleOAuthProvider>
  );
}

export default App;
