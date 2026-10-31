import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('potentpolicy_token'));
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('potentpolicy_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Sync session on mount
  useEffect(() => {
    async function loadUser() {
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.user);
          localStorage.setItem('potentpolicy_user', JSON.stringify(res.user));
        } catch (err) {
          console.warn('Session expired or invalid:', err.message);
          logout();
        }
      }
      setLoading(false);
    }
    loadUser();
  }, [token]);

  const login = (newToken, newUser) => {
    localStorage.setItem('potentpolicy_token', newToken);
    localStorage.setItem('potentpolicy_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('potentpolicy_token');
    localStorage.removeItem('potentpolicy_user');
    setToken(null);
    setUser(null);
  };

  const updateUser = partial => {
    setUser(prev => {
      const updated = { ...prev, ...partial };
      localStorage.setItem('potentpolicy_user', JSON.stringify(updated));
      return updated;
    });
  };

  const hasRole = role => {
    if (!user || !user.roles) return false;
    return user.roles.includes(role);
  };

  const isAdmin = hasRole('ADMIN');
  const isManager = hasRole('CAMPAIGN_MANAGER');

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading,
        login,
        logout,
        updateUser,
        hasRole,
        isAdmin,
        isManager,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
