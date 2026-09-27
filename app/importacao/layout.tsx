import React from 'react';
import { VoterProvider } from '@/context/VoterContext';
import { LeaderProvider } from '@/context/LeaderContext';
import { LocationProvider } from '@/context/LocationContext';

export default function ImportacaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <LeaderProvider>
      <LocationProvider>
        <VoterProvider>
          {children}
        </VoterProvider>
      </LocationProvider>
    </LeaderProvider>
  );
}
