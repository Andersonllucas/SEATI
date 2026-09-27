import React from 'react';
import { LocationProvider } from '@/context/LocationContext';
import { VoterProvider } from '@/context/VoterContext';

export default function LocaisLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocationProvider>
      <VoterProvider>
        {children}
      </VoterProvider>
    </LocationProvider>
  );
}
