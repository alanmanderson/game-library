import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuthFromCallback } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search || location.hash.replace('#', ''));
    const token = params.get('token');
    if (token) {
      setAuthFromCallback(token)
        .then(() => navigate('/'))
        .catch(() => navigate('/'));
    } else {
      navigate('/');
    }
  }, [location, navigate, setAuthFromCallback]);

  return (
    <div style={{ color: '#999', textAlign: 'center', marginTop: 80 }}>
      Completing sign in...
    </div>
  );
};

export default AuthCallback;
