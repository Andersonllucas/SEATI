import React from 'react';
import { VoterProvider } from '@/context/VoterContext';
import { LeaderProvider } from '@/context/LeaderContext';

export default function ValidacoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <LeaderProvider>
      <VoterProvider>
        {children}
      </VoterProvider>
    </LeaderProvider>
  );
}
