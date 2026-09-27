import React from 'react';
import { LeaderProvider } from '@/context/LeaderContext';
import { VoterProvider } from '@/context/VoterContext';

export default function CadastroMassaLayout({ children }: { children: React.ReactNode }) {
  return (
    <LeaderProvider>
      <VoterProvider>
        {children}
      </VoterProvider>
    </LeaderProvider>
  );
}
