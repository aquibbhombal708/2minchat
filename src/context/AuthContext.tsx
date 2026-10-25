import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserSession } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: UserSession | null;
  isLoading: boolean;
  updateName: (newName: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const initSession = async () => {
    try {
      const data = await api.getSession();
      setUser(data.user);
    } catch (err) {
      console.error('Failed to init session:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initSession();
  }, []);

  const updateName = async (newName: string) => {
    if (!newName.trim()) return;
    try {
      const updated = await api.updateSessionName(newName.trim());
      setUser(updated);
    } catch (err) {
      console.error('Failed to update name:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, updateName, refreshSession: initSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
