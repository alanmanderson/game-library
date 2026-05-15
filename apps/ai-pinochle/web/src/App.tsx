import { Suspense, lazy, useState } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider, useAuth } from "./auth/AuthContext.tsx";
import { LoginPage } from "./auth/LoginPage.tsx";
import { Loading } from "./ui/Loading.tsx";

// RegisterPage and the entire post-auth surface (lobby + room + game) are
// behind dynamic imports so unauthenticated users only download the login
// bundle. See issue #14.
const RegisterPage = lazy(() =>
  import("./auth/RegisterPage.tsx").then((m) => ({ default: m.RegisterPage })),
);
const LobbyPage = lazy(() =>
  import("./lobby/LobbyPage.tsx").then((m) => ({ default: m.LobbyPage })),
);

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function AppContent() {
  const { user } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  if (user) {
    return (
      <Suspense fallback={<Loading />}>
        <LobbyPage />
      </Suspense>
    );
  }

  if (showRegister) {
    return (
      <Suspense fallback={<Loading />}>
        <RegisterPage onSwitchToLogin={() => setShowRegister(false)} />
      </Suspense>
    );
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
