import React, { createContext, useContext } from 'react';
import { useAuth } from '../hooks/useAuth';
import { UIContext } from './UIContext';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const { t } = useContext(UIContext);
  const auth = useAuth(t);

  return (
    <AuthContext.Provider value={auth}>
      {!auth.loading && children}
    </AuthContext.Provider>
  );
};
