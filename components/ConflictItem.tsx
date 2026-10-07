'use client';

import React from 'react';
import { CpfConflictGroup, TituloConflictGroup } from '@/context/CampaignContext';

interface ConflictItemProps {
  group: CpfConflictGroup | TituloConflictGroup;
  type?: 'cpf' | 'titulo';
  isSelected: boolean;
  onSelect: () => void;
}

export const ConflictItem = React.memo(function ConflictItem({
  group,
  type = 'cpf',
  isSelected,
  onSelect
}: ConflictItemProps) {
  const isTitulo = type === 'titulo' || 'tituloClean' in group;
  const label = isTitulo
    ? `Título: ${(group as TituloConflictGroup).formattedTitulo}`
    : (group as CpfConflictGroup).formattedCpf;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? isTitulo
            ? 'bg-secondary/10 border-secondary text-secondary shadow-xs ring-1 ring-secondary'
            : 'bg-error/5 border-error text-on-surface shadow-xs ring-1 ring-error'
          : 'bg-surface-container-lowest border-outline-variant/50 hover:bg-surface-container-low text-on-surface-variant'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
            isTitulo
              ? 'text-secondary bg-secondary/10 border border-secondary/30'
              : 'text-error bg-error/10 border border-error/30'
          }`}
        >
          {label}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            isTitulo ? 'bg-secondary text-white' : 'bg-error text-on-error'
          }`}
        >
          {group.count}x
        </span>
      </div>
      <p className="text-xs font-bold text-on-surface mt-2 truncate">
        {group.voters[0]?.nome || 'Eleitor Desconhecido'}
      </p>
      <div className="text-[11px] text-on-surface-variant mt-1 flex items-center gap-1 truncate">
        <span>Lideranças:</span>
        <strong className="text-primary truncate">
          {group.liderancas.join(', ')}
        </strong>
      </div>
    </button>
  );
});

