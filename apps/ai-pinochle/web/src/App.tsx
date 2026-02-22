import { AuthProvider, useAuth } from "./auth/AuthContext.tsx";
import { RegisterPage } from "./auth/RegisterPage.tsx";

function AppContent() {
  const { user } = useAuth();

  if (user) {
    return <p>Welcome, {user.username}!</p>;
  }

  return <RegisterPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
