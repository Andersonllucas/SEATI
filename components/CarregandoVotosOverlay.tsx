'use client';

import React from 'react';
import { Database, Loader2, AlertCircle, Vote, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';

export interface CarregandoVotosProgress {
  percent: number;
  current?: number;
  total?: number;
  stage?: string;
  subtext?: string;
}

interface CarregandoVotosOverlayProps {
  isOpen: boolean;
  progress?: CarregandoVotosProgress | null;
  title?: string;
  tipo?: 'leitura' | 'gravacao' | 'geral';
}

/**
 * Card e Barra de Carregamento profissional para importação de votos.
 * Evita a impressão de sistema travado e orienta o usuário a não recarregar a página.
 */
export function CarregandoVotosOverlay({
  isOpen,
  progress,
  title = 'Carregando votos',
  tipo = 'gravacao'
}: CarregandoVotosOverlayProps) {
  if (!isOpen) return null;

  const percent = Math.max(0, Math.min(100, progress?.percent ?? 15));
  const isComplete = percent >= 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="carregando-votos-titulo"
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="bg-surface-container-lowest border border-outline-variant/80 rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Glow de fundo decorativo */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Ícone com animação de status */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 ${
                isComplete
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30 ring-4 ring-emerald-500/20'
                  : 'bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-emerald-500/30'
              }`}
            >
              {isComplete ? (
                <CheckCircle2 className="w-8 h-8 animate-in zoom-in duration-300" />
              ) : tipo === 'leitura' ? (
                <Vote className="w-8 h-8 animate-pulse" />
              ) : (
                <Database className="w-8 h-8 animate-pulse" />
              )}
            </div>

            {!isComplete && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 ring-2 ring-white" />
              </span>
            )}
          </div>

          <div className="space-y-1">
            <h3
              id="carregando-votos-titulo"
              className="text-lg sm:text-xl font-black text-on-surface tracking-tight flex items-center justify-center gap-2"
            >
              <span>{title}</span>
              {!isComplete && <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />}
            </h3>
            <p className="text-xs sm:text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
              {progress?.stage ||
                (tipo === 'leitura'
                  ? 'Lendo dados do arquivo de Boletim de Urna (TSE)...'
                  : 'Sincronizando e gravando permanentemente no banco de dados Firestore...')}
            </p>
          </div>
        </div>

        {/* Barra de Carregamento Profissional */}
        <div className="space-y-2 bg-surface-container-low/70 p-4 rounded-xl border border-outline-variant/50">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-on-surface flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {isComplete ? 'Processo Concluído' : 'Progresso da Operação'}
            </span>
            <span className="font-mono font-bold text-sm text-emerald-600">
              {percent}%
            </span>
          </div>

          {/* Trilho da Barra */}
          <div className="w-full h-3.5 bg-surface-container-highest rounded-full overflow-hidden p-0.5 border border-outline-variant/40 shadow-inner relative">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden ${
                isComplete
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-400'
              }`}
              style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
            >
              {/* Efeito shimmer / brilho dinâmico */}
              {!isComplete && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
              )}
            </div>
          </div>

          {/* Informações detalhadas da contagem */}
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-mono pt-1">
            <span>
              {typeof progress?.current === 'number' && typeof progress?.total === 'number' && progress.total > 0 ? (
                <>
                  <strong className="text-on-surface">{progress.current}</strong> de{' '}
                  <strong className="text-on-surface">{progress.total}</strong> seções
                </>
              ) : (
                'Processando lotes...'
              )}
            </span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Banco Firestore
            </span>
          </div>
        </div>

        {/* Card de Aviso / Segurança anti-recarregamento */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-left flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-amber-950 dark:text-amber-200">
              Por favor, não recarregue nem feche esta página
            </p>
            <p className="text-[11px] text-amber-900/90 dark:text-amber-300/90 leading-relaxed">
              O sistema está gravando essas informações de forma persistente diretamente no seu banco de dados na nuvem.
              Assim que terminar, você e todos os seus clientes terão acesso imediato a esses votos a partir de qualquer computador.
            </p>
          </div>
        </div>

        {/* Rodapé sutil de confirmação */}
        <div className="text-center">
          <p className="text-[11px] text-on-surface-variant flex items-center justify-center gap-1.5">
            <Sparkles className="w-3 h-3 text-emerald-600" />
            <span>Gravação em lote otimizada e segura • Proteção contra perda de dados</span>
          </p>
        </div>
      </div>
    </div>
  );
}
