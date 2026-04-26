/**
 * Client Component que proporciona SessionProvider
 * Necesario porque SessionProvider usa React Context
 */

'use client';

import { SessionProvider } from 'next-auth/react';
import React from 'react';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <SessionProvider>{children}</SessionProvider>;
};

