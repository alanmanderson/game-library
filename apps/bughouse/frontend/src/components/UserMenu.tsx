import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const UserMenu: React.FC<{ onSignInClick: () => void }> = ({ onSignInClick }) => {
  const { user, isGuest, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isGuest) {
    const guestName = localStorage.getItem('bughouse_name') || 'Guest';
    return (
      <div className="user-menu">
        <span className="user-menu-guest">Guest: {guestName}</span>
        <button className="btn-link" onClick={onSignInClick}>Sign In</button>
      </div>
    );
  }

  // Safety guard for TypeScript narrowing — isGuest being false implies user is set,
  // but this explicit check satisfies the type checker without non-null assertions.
  if (!user) return null;

  const initials = user.display_name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu-button"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="user-avatar" />
        ) : (
          <span className="user-initials">{initials}</span>
        )}
        <span className="user-menu-name">{user.display_name}</span>
      </button>
      {showDropdown && (
        <div className="user-dropdown">
          <div className="user-dropdown-email">{user.email}</div>
          <button
            className="user-dropdown-item"
            onClick={() => {
              logout();
              setShowDropdown(false);
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
