'use client';

import React from 'react';
import { Lideranca } from '@/context/CampaignContext';
import {
  Building2,
  Phone,
  Mail,
  Edit,
  Trash2,
  Plus
} from 'lucide-react';

interface LeaderRowProps {
  leader: Lideranca;
  voterCount: number;
  subsCount: number;
  onEdit: () => void;
  onDelete?: () => void;
  onAddSub: () => void;
}

export const LeaderRow = React.memo(function LeaderRow({
  leader,
  voterCount,
  subsCount,
  onEdit,
  onDelete,
  onAddSub
}: LeaderRowProps) {
  const meta = leader.metaVotos || 0;
  const pct = meta > 0 ? Math.min(100, Math.round((voterCount / meta) * 100)) : 0;
  const isPrincipal = leader.tipo === 'Liderança Principal';

  return (
    <tr className="hover:bg-surface-container-low transition-colors">
      {/* Identificação */}
      <td className="py-3.5 px-4">
        <div className="space-y-1">
          <p className="font-bold text-sm text-on-surface tracking-tight leading-snug">
            {leader.nome}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-semibold tracking-wide uppercase ${
                isPrincipal
                  ? 'bg-primary/15 text-primary border border-primary/25 font-bold'
                  : 'bg-secondary/10 text-secondary border border-secondary/25'
              }`}
            >
              {leader.tipo}
            </span>
            {isPrincipal && (
              <span className="text-[10px] text-on-surface-variant font-medium">
                {subsCount} sub-liderança{subsCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Vínculo Hierárquico */}
      <td className="py-3.5 px-4">
        {isPrincipal ? (
          <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
            <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
            Coordenação Geral
          </div>
        ) : (
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-on-surface">
              {leader.liderancaPaiNome || 'Coordenação Geral'}
            </p>
            <p className="text-[10px] text-on-surface-variant">Líder Direto</p>
          </div>
        )}
      </td>

      {/* Território / Base */}
      <td className="py-3.5 px-4">
        <div className="space-y-0.5 text-xs">
          <p className="font-semibold text-on-surface flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-secondary shrink-0" />
            {leader.bairro || 'Território Geral'}
          </p>
          <p className="text-[10px] text-on-surface-variant">{leader.regiao}</p>
        </div>
      </td>

      {/* Contato Oficial */}
      <td className="py-3.5 px-4">
        <div className="space-y-0.5 text-xs text-on-surface-variant font-mono">
          {leader.telefone ? (
            <p className="flex items-center gap-1 text-on-surface font-semibold">
              <Phone className="w-3 h-3 text-secondary" />
              {leader.telefone}
            </p>
          ) : (
            <span className="text-on-surface-variant/60 font-sans italic text-[11px]">
              Sem telefone
            </span>
          )}
          {leader.email && (
            <p className="flex items-center gap-1 text-[10px] font-sans truncate max-w-[160px]">
              <Mail className="w-3 h-3 text-outline shrink-0" />
              {leader.email}
            </p>
          )}
        </div>
      </td>

      {/* Captação / Meta */}
      <td className="py-3.5 px-4">
        <div className="space-y-1.5 min-w-[130px]">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-bold text-on-surface">
              {voterCount}{' '}
              <span className="font-normal text-on-surface-variant text-[11px]">
                / {meta}
              </span>
            </span>
            <span
              className={`font-mono text-[11px] font-bold ${
                pct >= 100
                  ? 'text-emerald-800'
                  : pct >= 50
                  ? 'text-primary'
                  : 'text-secondary'
              }`}
            >
              {pct}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pct >= 100
                  ? 'bg-emerald-600'
                  : pct >= 50
                  ? 'bg-primary-container'
                  : 'bg-secondary'
              }`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="py-3.5 px-4">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
            leader.status === 'Ativa'
              ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20'
              : leader.status === 'Em Formação'
              ? 'bg-blue-500/10 text-blue-800 border-blue-500/20'
              : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              leader.status === 'Ativa'
                ? 'bg-emerald-600'
                : leader.status === 'Em Formação'
                ? 'bg-blue-600'
                : 'bg-outline'
            }`}
          />
          {leader.status}
        </span>
      </td>

      {/* Ações */}
      <td className="py-3.5 px-4 text-right">
        <div className="flex items-center justify-end gap-1">
          {isPrincipal && (
            <button
              type="button"
              onClick={onAddSub}
              title="Adicionar Sub-liderança vinculada"
              className="p-1.5 text-secondary hover:bg-secondary/10 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            title="Editar Articulador"
            className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
          >
            <Edit className="w-4 h-4" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Excluir Registro"
              className="p-1.5 text-error hover:bg-error/10 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});
