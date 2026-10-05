'use client';

import React from 'react';
import { LocalVotacao } from '@/context/CampaignContext';
import {
  School,
  MapPin,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Edit3,
  Trash2,
  GitMerge
} from 'lucide-react';

interface LocalCardProps {
  local: LocalVotacao & { eleitoresIdentificados?: number; votersList?: any[] };
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onViewVoters: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAgregarSecao?: (secao: string, local: LocalVotacao) => void;
}

export const LocalCard = React.memo(function LocalCard({
  local,
  isSelected = false,
  onToggleSelect,
  onViewVoters,
  onEdit,
  onDelete,
  onAgregarSecao
}: LocalCardProps) {
  const secoesList = Array.isArray(local.secoes)
    ? local.secoes
    : (local.secoes ? String(local.secoes).split(',').map((s) => s.trim()).filter(Boolean) : (local.secao ? [local.secao] : []));

  return (
    <div
      className={`bg-surface-container-lowest border rounded-xl p-4 shadow-xs transition-all flex flex-col justify-between group ${
        isSelected
          ? 'border-primary ring-2 ring-primary/25 bg-primary/[0.03]'
          : 'border-outline-variant/60 hover:border-secondary/50'
      }`}
    >
      <div className="space-y-3">
        {/* Header Card */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {onToggleSelect && (
              <label
                htmlFor={`select-local-${local.id}`}
                className="flex items-center justify-center p-1 -ml-1 cursor-pointer select-none rounded hover:bg-surface-container transition-colors"
                onClick={(e) => e.stopPropagation()}
                title={isSelected ? 'Desmarcar local' : 'Selecionar local'}
              >
                <input
                  id={`select-local-${local.id}`}
                  type="checkbox"
                  checked={isSelected}
                  onChange={onToggleSelect}
                  className="w-4 h-4 rounded text-primary focus:ring-primary/20 border-outline-variant cursor-pointer accent-primary"
                  aria-label={`Selecionar ${local.nome}`}
                />
              </label>
            )}
            <div className="w-9 h-9 rounded-lg bg-surface-container text-primary flex items-center justify-center shrink-0">
              <School className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-on-surface leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                {local.nome}
              </h3>
              <p className="text-[11px] text-on-surface-variant truncate">
                {local.bairro ? `${local.bairro} • ` : ''}
                {local.municipio || 'Teresina'}-{local.uf || 'PI'}
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono font-bold shrink-0">
            Zona {local.zona}
          </span>
        </div>

        {/* Info rows */}
        <div className="text-xs text-on-surface-variant space-y-1.5 pt-1">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-secondary shrink-0" />
            <span className="truncate">
              Bairro: <strong className="text-on-surface">{local.bairro}</strong>
              {local.endereco ? ` • ${local.endereco}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-secondary shrink-0" />
            <span>Capacidade: ~{Number(local.capacidadeAprox || 0).toLocaleString('pt-BR')} eleitores</span>
          </div>
        </div>

        {/* Secoes pills */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Seções ({secoesList.length}):
            </p>
            {secoesList.length > 6 && (
              <span className="text-[10px] text-on-surface-variant font-mono">
                +{secoesList.length - 6} seções
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {secoesList.slice(0, 8).map((sec) => (
              <span
                key={sec}
                onClick={onAgregarSecao ? () => onAgregarSecao(sec, local) : undefined}
                title={onAgregarSecao ? `Clique para agregar a seção ${sec} a outra` : undefined}
                className={`px-1.5 py-0.5 bg-surface-container-low text-on-surface text-[10px] font-mono rounded border border-outline-variant/50 transition-colors ${
                  onAgregarSecao ? 'hover:border-secondary hover:text-secondary hover:bg-secondary/10 cursor-pointer' : ''
                }`}
              >
                {sec}
              </span>
            ))}
            {secoesList.length > 8 && (
              <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant text-[10px] font-mono rounded">
                +{secoesList.length - 8}
              </span>
            )}
            {secoesList.length === 0 && (
              <span className="text-[11px] text-on-surface-variant italic">Nenhuma seção vinculada</span>
            )}
          </div>
          {Boolean(local.secoesAgregadas) && (
            <div
              className="mt-1.5 flex items-center gap-1.5 text-[10px] text-amber-900 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md font-mono"
              title={`Seções agregadas oficiais: ${local.secoesAgregadas}`}
            >
              <GitMerge className="w-3 h-3 text-amber-700 dark:text-amber-400 shrink-0" />
              <span className="truncate">
                Agregada(s): <strong>{String(local.secoesAgregadas)}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom footer with actions & voter counter */}
      <div className="mt-4 pt-3 border-t border-outline-variant/40 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={onViewVoters}
          className="flex items-center gap-1.5 text-emerald-800 font-bold hover:text-emerald-950 transition-colors cursor-pointer group/voters"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span className="underline decoration-emerald-300 underline-offset-2">
            {local.eleitoresIdentificados} na base
          </span>
          <ChevronRight className="w-3 h-3 text-emerald-600 group-hover/voters:translate-x-0.5 transition-transform" />
        </button>

        <div className="flex items-center gap-1">
          {onAgregarSecao && (
            <button
              type="button"
              onClick={() => onAgregarSecao(secoesList[0] || '', local)}
              title="Agregar Seção deste local a outra seção"
              className="p-1.5 text-on-surface-variant hover:text-secondary hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
            >
              <GitMerge className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            title="Editar Local"
            className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Excluir Local"
            className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/30 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});
