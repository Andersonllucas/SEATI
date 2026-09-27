'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface CampaignUIContextType {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  activeSearchQuery: string;
  setActiveSearchQuery: (q: string) => void;
  totalConflitosCount: number;
  setTotalConflitosCount: (count: number) => void;
}

const CampaignUIContext = createContext<CampaignUIContextType | undefined>(undefined);

export function CampaignUIProvider({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [totalConflitosCount, setTotalConflitosCount] = useState(0);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const openSidebar = useCallback(() => {
    setIsSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isSidebarOpen,
      toggleSidebar,
      openSidebar,
      closeSidebar,
      activeSearchQuery,
      setActiveSearchQuery,
      totalConflitosCount,
      setTotalConflitosCount
    }),
    [isSidebarOpen, toggleSidebar, openSidebar, closeSidebar, activeSearchQuery, totalConflitosCount]
  );

  return (
    <CampaignUIContext.Provider value={value}>
      {children}
    </CampaignUIContext.Provider>
  );
}

export function useCampaignUI() {
  const context = useContext(CampaignUIContext);
  if (!context) {
    throw new Error('useCampaignUI deve ser usado dentro de um CampaignUIProvider');
  }
  return context;
}
