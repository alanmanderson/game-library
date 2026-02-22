import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider, useAuth } from "./auth/AuthContext.tsx";
import { RegisterPage } from "./auth/RegisterPage.tsx";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function AppContent() {
  const { user } = useAuth();

  if (user) {
    return <p>Welcome, {user.email}!</p>;
  }

  return <RegisterPage />;
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
