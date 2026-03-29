import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi } from '../api/todoApi';
import type { User } from '../types/todo';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      // Verify token is still valid
      authApi.me().then((u) => {
        setUser(u);
        localStorage.setItem('auth_user', JSON.stringify(u));
      }).catch(() => {
        // Token is invalid
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setToken(null);
        setUser(null);
      }).finally(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  // Listen for forced logout events (from API 401)
  useEffect(() => {
    const handleLogout = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    localStorage.setItem('auth_token', result.token);
    localStorage.setItem('auth_user', JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
  }, []);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const result = await authApi.register({ email, username, password });
    localStorage.setItem('auth_token', result.token);
    localStorage.setItem('auth_user', JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
