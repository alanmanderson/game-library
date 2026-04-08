import { useEffect } from 'react';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

export function useAuthInit() {
  const { token, setAuth, clearAuth, setLoading } = useAuthStore();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .getMe()
      .then((user) => {
        setAuth(user, token);
      })
      .catch(() => {
        clearAuth();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
