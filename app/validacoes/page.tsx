'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ShieldAlert,
  Fingerprint,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Search,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  FileText
} from 'lucide-react';
import { useCampaignData, CpfConflictGroup, TituloConflictGroup } from '@/context/CampaignContext';
import Link from 'next/link';
import { ConflictItem } from '@/components/ConflictItem';

export default function ValidacoesPage() {
  const {
    eleitores,
    cpfConflictGroups,
    tituloConflictGroups,
    conflictingCpfVoterIds,
    conflictingTituloVoterIds,
    conflictingVoterIds,
    totalConflitos
  } = useCampaignData();

  const [conflictType, setConflictType] = useState<'cpf' | 'titulo'>('cpf');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConflictIndex, setSelectedConflictIndex] = useState(0);
  const [isRevalidating, setIsRevalidating] = useState(false);

  // Se não houver conflitos de CPF mas houver de Título, seleciona automaticamente a aba de Título
  useEffect(() => {
    if (cpfConflictGroups.length === 0 && tituloConflictGroups.length > 0) {
      setConflictType('titulo');
    }
  }, [cpfConflictGroups.length, tituloConflictGroups.length]);

  const activeConflictGroups = useMemo(() => {
    return conflictType === 'cpf' ? cpfConflictGroups : tituloConflictGroups;
  }, [conflictType, cpfConflictGroups, tituloConflictGroups]);

  const filteredConflicts = useMemo(() => {
    if (!searchTerm) return activeConflictGroups;
    const term = searchTerm.toLowerCase();

    if (conflictType === 'cpf') {
      return (cpfConflictGroups as CpfConflictGroup[]).filter((g) => {
        const hasCpf = g.formattedCpf.includes(term) || g.cpfClean.includes(term);
        const hasVoter = g.voters.some((v) => v.nome.toLowerCase().includes(term));
        const hasLeader = g.liderancas.some((l) => l.toLowerCase().includes(term));
        return hasCpf || hasVoter || hasLeader;
      });
    } else {
      return (tituloConflictGroups as TituloConflictGroup[]).filter((g) => {
        const hasTitulo = g.formattedTitulo.includes(term) || g.tituloClean.includes(term);
        const hasVoter = g.voters.some((v) => v.nome.toLowerCase().includes(term));
        const hasLeader = g.liderancas.some((l) => l.toLowerCase().includes(term));
        return hasTitulo || hasVoter || hasLeader;
      });
    }
  }, [activeConflictGroups, conflictType, cpfConflictGroups, tituloConflictGroups, searchTerm]);

  const activeConflict = filteredConflicts[selectedConflictIndex] || filteredConflicts[0];

  const handleSelectConflict = useCallback((idx: number) => {
    setSelectedConflictIndex(idx);
  }, []);

  const handleSwitchTab = (type: 'cpf' | 'titulo') => {
    setConflictType(type);
    setSelectedConflictIndex(0);
    setSearchTerm('');
  };

  const handleRevalidate = () => {
    setIsRevalidating(true);
    setTimeout(() => {
      setIsRevalidating(false);
    }, 600);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto flex-1">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/60 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-error/10 text-error text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" /> Motor de Integridade em Tempo Real
            </span>
            <span className="text-xs text-on-surface-variant flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Sincronizado na Memória
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl text-on-surface font-black tracking-tight">Central de Auditoria & Duplicidades</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Identifique e resolva colisões de CPF e Título de Eleitor entre lideranças para garantir a integridade matemática da campanha.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRevalidate}
            disabled={isRevalidating}
            className="px-4 py-2 border border-outline-variant bg-surface-container-lowest rounded-lg text-sm font-semibold text-primary hover:bg-surface-container flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRevalidating ? 'animate-spin' : ''}`} />
            {isRevalidating ? 'Auditando...' : 'Revalidar Base'}
          </button>
          <Link
            href="/eleitores"
            className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:bg-primary/90 flex items-center gap-1.5 shadow-xs transition-colors"
          >
            Ver no Cadastro <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* KPI Cards: 4 Indicadores Estruturados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Conflitos de CPF */}
        <div
          onClick={() => handleSwitchTab('cpf')}
          className={`bg-surface-container-lowest border rounded-2xl p-5 shadow-xs transition-all cursor-pointer hover:shadow-md ${
            conflictType === 'cpf' ? 'ring-2 ring-error' : ''
          } ${cpfConflictGroups.length > 0 ? 'border-error/60 border-t-4 border-t-error' : 'border-emerald-300'}`}
        >
          <div className="flex items-center justify-between">
            <h3 className={`text-3xl font-black ${cpfConflictGroups.length > 0 ? 'text-error' : 'text-emerald-700'}`}>
              {cpfConflictGroups.length}
            </h3>
            <span className={`p-2.5 rounded-xl ${cpfConflictGroups.length > 0 ? 'bg-error/10 text-error' : 'bg-emerald-100 text-emerald-700'}`}>
              <Fingerprint className="w-5 h-5" />
            </span>
          </div>
          <p className="text-sm font-bold mt-2 text-on-surface">Conflitos de CPF</p>
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
            {cpfConflictGroups.length > 0
              ? `${conflictingCpfVoterIds.size} eleitores com mesmo CPF disputados por articuladores.`
              : 'Nenhum conflito de CPF detectado na base.'}
          </p>
        </div>

        {/* Card 2: Conflitos de Título de Eleitor */}
        <div
          onClick={() => handleSwitchTab('titulo')}
          className={`bg-surface-container-lowest border rounded-2xl p-5 shadow-xs transition-all cursor-pointer hover:shadow-md ${
            conflictType === 'titulo' ? 'ring-2 ring-amber-500' : ''
          } ${tituloConflictGroups.length > 0 ? 'border-amber-400 border-t-4 border-t-amber-500' : 'border-emerald-300'}`}
        >
          <div className="flex items-center justify-between">
            <h3 className={`text-3xl font-black ${tituloConflictGroups.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {tituloConflictGroups.length}
            </h3>
            <span className={`p-2.5 rounded-xl ${tituloConflictGroups.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
              <FileText className="w-5 h-5" />
            </span>
          </div>
          <p className="text-sm font-bold mt-2 text-on-surface">Conflitos de Título</p>
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
            {tituloConflictGroups.length > 0
              ? `${conflictingTituloVoterIds.size} eleitores com mesmo Título cadastrado na campanha.`
              : 'Nenhum conflito de Título de Eleitor detectado.'}
          </p>
        </div>

        {/* Card 3: Total de Eleitores Auditados */}
        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-on-surface">
              {eleitores.length}
            </h3>
            <span className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <UserCheck className="w-5 h-5" />
            </span>
          </div>
          <p className="text-sm font-bold mt-2 text-on-surface">Eleitores Auditados</p>
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
            Registros processados instantaneamente sem latência.
          </p>
        </div>

        {/* Card 4: Taxa de Integridade Eleitoral */}
        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-emerald-700">
              {eleitores.length > 0
                ? `${(((eleitores.length - conflictingVoterIds.size) / eleitores.length) * 100).toFixed(1)}%`
                : '100%'}
            </h3>
            <span className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </span>
          </div>
          <p className="text-sm font-bold mt-2 text-on-surface">Taxa de Integridade</p>
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
            Cadastros únicos sem duplicidade de CPF ou Título.
          </p>
        </div>
      </div>

      {/* Main Conflict Viewer */}
      {totalConflitos === 0 ? (
        <div className="bg-surface-container-lowest border border-emerald-200 rounded-2xl p-10 text-center shadow-xs">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-on-surface">Base de Dados 100% Íntegra</h2>
          <p className="text-sm text-on-surface-variant max-w-md mx-auto mt-2 leading-relaxed">
            Não existem duplicidades de CPF nem de Título de Eleitor na sua base no momento. Todas as vinculações territoriais e de lideranças estão validadas.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/eleitores"
              className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold shadow-xs hover:bg-primary/90 transition-colors"
            >
              Consultar Base de Eleitores
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Seletor de Abas de Conflito: CPF vs Título de Eleitor */}
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-1">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSwitchTab('cpf')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  conflictType === 'cpf'
                    ? 'bg-error text-on-error shadow-sm'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Fingerprint className="w-4 h-4" />
                <span>Conflitos de CPF</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  conflictType === 'cpf' ? 'bg-white/25 text-white' : 'bg-surface-container-highest text-on-surface'
                }`}>
                  {cpfConflictGroups.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchTab('titulo')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  conflictType === 'titulo'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Conflitos de Título de Eleitor</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  conflictType === 'titulo' ? 'bg-white/25 text-white' : 'bg-surface-container-highest text-on-surface'
                }`}>
                  {tituloConflictGroups.length}
                </span>
              </button>
            </div>

            <span className="text-xs text-on-surface-variant hidden sm:inline-block">
              Clique em um caso na lista para auditar as lideranças envolvidas
            </span>
          </div>

          {/* Grid com Lista de Casos à Esquerda e Resolução Detalhada à Direita */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Conflict List Sidebar */}
            <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-2xl p-4 shadow-xs flex flex-col h-[540px]">
              <div className="mb-3">
                <h2 className="font-bold text-sm text-on-surface flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${conflictType === 'cpf' ? 'text-error' : 'text-amber-600'}`} />
                  {conflictType === 'cpf' ? 'Casos de CPF Duplicado' : 'Casos de Título Duplicado'} ({filteredConflicts.length})
                </h2>
                <div className="relative mt-2">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <input
                    type="text"
                    placeholder={conflictType === 'cpf' ? 'Buscar por nome, CPF ou liderança...' : 'Buscar por nome, Título ou liderança...'}
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSelectedConflictIndex(0);
                    }}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {filteredConflicts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-on-surface-variant">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-2" />
                    <p className="font-bold text-xs text-on-surface">Nenhum caso ativo nesta categoria</p>
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      {searchTerm ? 'Nenhum resultado corresponde à busca digitada.' : 'Não há duplicidades para este filtro.'}
                    </p>
                  </div>
                ) : (
                  filteredConflicts.map((group, idx) => {
                    const isSelected = selectedConflictIndex === idx;
                    const groupKey = 'cpfClean' in group ? group.cpfClean : group.tituloClean;
                    return (
                      <ConflictItem
                        key={groupKey}
                        group={group}
                        type={conflictType}
                        isSelected={isSelected}
                        onSelect={() => handleSelectConflict(idx)}
                      />
                    );
                  })
                )}
              </div>
            </div>

            {/* Active Conflict Resolution Card */}
            <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/60 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
              {activeConflict ? (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-outline-variant/60 gap-4">
                    <div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded uppercase tracking-wider ${
                        conflictType === 'cpf' ? 'bg-error/10 text-error' : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}>
                        {conflictType === 'cpf' ? 'Colisão de CPF entre Lideranças' : 'Colisão de Título de Eleitor'}
                      </span>
                      <h2 className="text-xl font-bold mt-2 text-on-surface">
                        {activeConflict.voters[0]?.nome}
                      </h2>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {conflictType === 'cpf' ? (
                          <>
                            Identificador de CPF colidente:{' '}
                            <span className="font-mono font-bold text-error">
                              {(activeConflict as CpfConflictGroup).formattedCpf}
                            </span>
                          </>
                        ) : (
                          <>
                            Número do Título de Eleitor colidente:{' '}
                            <span className="font-mono font-bold text-amber-800">
                              {(activeConflict as TituloConflictGroup).formattedTitulo}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 flex items-center gap-3 shrink-0">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">Similaridade</span>
                        <div className={`text-base font-black ${conflictType === 'cpf' ? 'text-error' : 'text-amber-800'}`}>
                          100% ({conflictType === 'cpf' ? 'Mesmo CPF' : 'Mesmo Título'})
                        </div>
                      </div>
                      {conflictType === 'cpf' ? (
                        <Fingerprint className="w-7 h-7 text-error" />
                      ) : (
                        <FileText className="w-7 h-7 text-amber-700" />
                      )}
                    </div>
                  </div>

                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mt-5 mb-3">
                    Registros Concorrentes no Banco ({activeConflict.voters.length})
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {activeConflict.voters.map((voter, index) => {
                      const searchParam = conflictType === 'cpf'
                        ? (activeConflict as CpfConflictGroup).formattedCpf
                        : (activeConflict as TituloConflictGroup).formattedTitulo;

                      return (
                        <div
                          key={voter.id}
                          className="bg-surface-container-low/60 rounded-xl border-2 border-outline-variant/60 p-4 flex flex-col justify-between hover:border-primary/50 transition-colors"
                        >
                          <div>
                            <div className="flex justify-between items-start mb-3">
                              <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded uppercase">
                                Cadastro #{index + 1}
                              </span>
                              <span className="text-[11px] text-on-surface-variant font-mono">
                                ID: {voter.id.slice(0, 6)}...
                              </span>
                            </div>

                            <p className="text-xs text-on-surface-variant">Articulador / Liderança:</p>
                            <p className="text-base font-bold text-primary truncate">
                              {voter.lideranca || 'Sem Liderança Definida'}
                            </p>

                            <div className="mt-3 bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 text-xs space-y-2">
                              <div className="flex justify-between">
                                <span className="text-on-surface-variant">CPF:</span>
                                <span className="font-mono font-semibold text-on-surface">{voter.cpf || 'Não informado'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-on-surface-variant">Título:</span>
                                <span className="font-mono font-semibold text-on-surface">{voter.tituloEleitor || 'Não informado'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-on-surface-variant">Bairro:</span>
                                <span className="font-semibold text-on-surface">{voter.bairro || 'Não informado'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-on-surface-variant">Telefone:</span>
                                <span className="font-mono text-on-surface">{voter.telefone || 'Não informado'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-on-surface-variant">Zona / Seção:</span>
                                <span className="font-semibold text-on-surface">{voter.zona || '-'} / {voter.secao || '-'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-outline-variant/40">
                            <Link
                              href={`/eleitores?termo=${encodeURIComponent(searchParam)}`}
                              prefetch={true}
                              className="w-full py-2 bg-primary text-on-primary rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Resolver no Cadastro
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-on-surface-variant">
                  <p>Selecione um caso na lista para auditar os eleitores colidentes.</p>
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-outline-variant/40 flex flex-col sm:flex-row items-center justify-between text-xs text-on-surface-variant gap-2">
                <span>
                  💡 Dica: Para manter um registro e excluir duplicatas com Senha Mestre, acerte diretamente no menu Eleitores ou utilize o botão acima.
                </span>
                <Link
                  href="/eleitores"
                  className="font-bold text-secondary hover:underline shrink-0"
                >
                  Abrir Base de Eleitores &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
