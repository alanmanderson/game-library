import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGuestContinue: () => void;
}

type AuthTab = 'signin' | 'register' | 'guest';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onGuestContinue }) => {
  const { login, register, loginWithGoogle } = useAuth();
  const [tab, setTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [guestName, setGuestName] = useState(() => localStorage.getItem('bughouse_name') || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register(email, displayName, password);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    if (guestName.trim()) {
      localStorage.setItem('bughouse_name', guestName.trim());
    }
    onGuestContinue();
    onClose();
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'signin' ? 'active' : ''}`}
            onClick={() => { setTab('signin'); setError(null); }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); setError(null); }}
          >
            Register
          </button>
          <button
            className={`auth-tab ${tab === 'guest' ? 'active' : ''}`}
            onClick={() => { setTab('guest'); setError(null); }}
          >
            Guest
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {tab === 'signin' && (
          <form onSubmit={handleSignIn} className="auth-form">
            <input
              className="lobby-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="lobby-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <button
              type="button"
              className="btn btn-google"
              onClick={loginWithGoogle}
            >
              Sign in with Google
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <input
              className="lobby-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="lobby-input"
              type="text"
              placeholder="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
              required
            />
            <input
              className="lobby-input"
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        {tab === 'guest' && (
          <div className="auth-form">
            <input
              className="lobby-input"
              type="text"
              placeholder="Guest name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={20}
            />
            <button
              className="btn btn-primary"
              onClick={handleGuest}
              disabled={!guestName.trim()}
            >
              Continue as Guest
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
