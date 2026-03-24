import { useState } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider, useAuth } from "./auth/AuthContext.tsx";
import { LoginPage } from "./auth/LoginPage.tsx";
import { RegisterPage } from "./auth/RegisterPage.tsx";
import { LobbyPage } from "./lobby/LobbyPage.tsx";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function AppContent() {
  const { user } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  if (user) {
    return <LobbyPage />;
  }

  if (showRegister) {
    return <RegisterPage onSwitchToLogin={() => setShowRegister(false)} />;
  }

  return <LoginPage onSwitchToRegister={() => setShowRegister(true)} />;
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
