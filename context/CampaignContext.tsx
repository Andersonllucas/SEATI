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
import {
  ApuracaoProvider,
  useApuracao,
  ApuracaoSecao,
  normalizeZona,
  normalizeSecao,
  makeSecaoKey
} from './ApuracaoContext';

export {
  VoterProvider,
  useVoters,
  LeaderProvider,
  useLeaders,
  LocationProvider,
  useLocations,
  ApuracaoProvider,
  useApuracao,
  CampaignUIProvider,
  useCampaignUI,
  LOCAIS_PRESET_DEFAULT,
  cleanCpfUtil,
  cleanTituloUtil,
  formatTituloUtil,
  normalizeZona,
  normalizeSecao,
  makeSecaoKey
};

export type {
  Eleitor,
  TipoValidacao,
  StatusValidacao,
  ValidacaoRegistro,
  ApuracaoSecao,
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
            <ApuracaoProvider>
              {children}
            </ApuracaoProvider>
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
    totalLocaisCount: locations.totalLocaisCount,
    totalSecoesCount: locations.totalSecoesCount,
    totalCapacidadeCount: locations.totalCapacidadeCount,
    registeredPairsList: locations.registeredPairsList,
    isLoadingLocais: locations.isLoadingLocais,
    recarregarLocais: locations.recarregarLocais,
    fetchLocaisPage: locations.fetchLocaisPage,
    fetchLocaisCount: locations.fetchLocaisCount,
    fetchResumoStats: locations.fetchResumoStats,
    fetchAllLocaisDedicated: locations.fetchAllLocaisDedicated,
    fetchAllMatchingIds: locations.fetchAllMatchingIds,
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
    desvincularEleitoresDeLiderancas: voters.desvincularEleitoresDeLiderancas,
    registrarValidacao: voters.registrarValidacao,
    batchImportLiderancas: leaders.batchImportLiderancas,
    batchDeleteLiderancas: leaders.batchDeleteLiderancas,
    recarregarLiderancas: leaders.recarregarLiderancas,
    addLocalVotacao: locations.addLocalVotacao,
    updateLocalVotacao: locations.updateLocalVotacao,
    deleteLocalVotacao: locations.deleteLocalVotacao,
    batchDeleteLocais: locations.batchDeleteLocais,
    clearAllLocais: locations.clearAllLocais,
    seedLocaisDefault: locations.seedLocaisDefault,
    batchSaveLocais: locations.batchSaveLocais
  };
}

export const useCampaignActions = useCampaignData;
