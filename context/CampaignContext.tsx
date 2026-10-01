'use client';

import React from 'react';
import {
  VoterProvider,
  useVoters,
  Eleitor,
  TipoValidacao,
  StatusValidacao,
  ValidacaoRegistro,
  CpfConflictGroup,
  TituloConflictGroup,
  cleanCpfUtil,
  cleanTituloUtil,
  formatTituloUtil
} from './VoterContext';
import { LeaderProvider, useLeaders, Lideranca } from './LeaderContext';
import { LocationProvider, useLocations, LocalVotacao, LOCAIS_PRESET_DEFAULT } from './LocationContext';
import { CampaignUIProvider, useCampaignUI } from './CampaignUIContext';

export {
  VoterProvider,
  useVoters,
  LeaderProvider,
  useLeaders,
  LocationProvider,
  useLocations,
  CampaignUIProvider,
  useCampaignUI,
  LOCAIS_PRESET_DEFAULT,
  cleanCpfUtil,
  cleanTituloUtil,
  formatTituloUtil
};

export type {
  Eleitor,
  TipoValidacao,
  StatusValidacao,
  ValidacaoRegistro,
  Lideranca,
  LocalVotacao,
  CpfConflictGroup,
  TituloConflictGroup
};

export function CampaignProvider({ children }: { children: React.ReactNode }) {
  return (
    <CampaignUIProvider>
      <LeaderProvider>
        <LocationProvider>
          <VoterProvider>
            {children}
          </VoterProvider>
        </LocationProvider>
      </LeaderProvider>
    </CampaignUIProvider>
  );
}

export function useCampaignData() {
  const voters = useVoters();
  const leaders = useLeaders();
  const locations = useLocations();

  return {
    eleitores: voters.eleitores,
    liderancas: leaders.liderancas,
    locais: locations.locais,
    isLoaded: voters.isLoaded && leaders.isLoaded && locations.isLoaded,
    cpfConflictGroups: voters.cpfConflictGroups,
    tituloConflictGroups: voters.tituloConflictGroups,
    conflictingCpfVoterIds: voters.conflictingCpfVoterIds,
    conflictingTituloVoterIds: voters.conflictingTituloVoterIds,
    conflictingVoterIds: voters.conflictingVoterIds,
    totalEleitores: voters.totalEleitores,
    totalLiderancasAtivas: leaders.totalLiderancasAtivas,
    totalConflitos: voters.totalConflitos,
    cleanCpf: voters.cleanCpf,
    cleanTitulo: voters.cleanTitulo,
    addEleitorQuick: voters.addEleitorQuick,
    updateEleitorQuick: voters.updateEleitorQuick,
    deleteEleitorQuick: voters.deleteEleitorQuick,
    batchImportEleitores: voters.batchImportEleitores,
    batchDeleteEleitores: voters.batchDeleteEleitores,
    batchUpdateEleitores: voters.batchUpdateEleitores,
    registrarValidacao: voters.registrarValidacao,
    batchImportLiderancas: leaders.batchImportLiderancas,
    addLocalVotacao: locations.addLocalVotacao,
    updateLocalVotacao: locations.updateLocalVotacao,
    deleteLocalVotacao: locations.deleteLocalVotacao,
    batchDeleteLocais: locations.batchDeleteLocais,
    seedLocaisDefault: locations.seedLocaisDefault,
    batchSaveLocais: locations.batchSaveLocais
  };
}
