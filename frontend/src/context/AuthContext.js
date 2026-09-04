import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchMe, getToken, login as apiLogin, logout as apiLogout } from '../api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` is true until the stored token has been checked, so a reload does
  // not flash the login screen at someone who is already signed in.
  const [loading, setLoading] = useState(Boolean(getToken()));

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return null; }
    try {
      const me = await fetchMe();
      setUser(me);
      return me;
    } catch {
      // api.js already dropped the token on a 401; anything else means the
      // server is unreachable, and there is nothing useful to show either way.
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = async (email, password) => {
    await apiLogin(email, password);
    return refresh();
  };

  const signOut = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
