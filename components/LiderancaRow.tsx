'use client';

import React from 'react';
import { Lideranca } from '@/context/CampaignContext';
import {
  MapPin,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  AlertCircle,
  PlusCircle,
  Edit,
  Trash2
} from 'lucide-react';

interface LiderancaRowProps {
  leader: Lideranca;
  voterCount: number;
  meta: number;
  pct: number;
  isPrincipal: boolean;
  subsCount: number;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onAddSub: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const LiderancaRow = React.memo(function LiderancaRow({
  leader,
  voterCount,
  meta,
  pct,
  isPrincipal,
  subsCount,
  isSelected,
  onToggleSelect,
  onAddSub,
  onEdit,
  onDelete
}: LiderancaRowProps) {
  return (
    <tr className={`hover:bg-surface-container-low transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
      {/* Seleção em lote */}
      <td className="py-3.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={!!isSelected}
          onChange={onToggleSelect}
          aria-label={`Selecionar ${leader.nome}`}
          className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-secondary cursor-pointer"
        />
      </td>

      {/* Identificação */}
      <td className="py-3.5 px-4">
        <div className="space-y-1">
          <p className="font-bold text-sm text-on-surface tracking-tight leading-snug">
            {leader.nome}
          </p>
          {(leader.cpf || leader.tituloEleitor || leader.zona) && (
            <p className="text-[11px] text-on-surface-variant font-mono">
              {leader.cpf ? `CPF: ${leader.cpf}` : ''}
              {leader.tituloEleitor ? ` • Título: ${leader.tituloEleitor}` : ''}
              {leader.zona ? ` • Z: ${leader.zona}/S: ${leader.secao || '-'}` : ''}
            </p>
          )}
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
            {isPrincipal && subsCount > 0 && (
              <span className="text-[11px] text-on-surface-variant font-medium">
                • {subsCount} {subsCount === 1 ? 'sub-liderança' : 'sub-lideranças'}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Vínculo */}
      <td className="py-3 px-4">
        {isPrincipal ? (
          <span className="text-xs font-semibold text-on-surface-variant bg-surface-container px-2 py-1 rounded">
            Coordenação Polo
          </span>
        ) : (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-on-surface-variant">Responde a:</span>
            <span className="font-semibold text-secondary">
              {leader.liderancaPaiNome || 'Não vinculada'}
            </span>
          </div>
        )}
      </td>

      {/* Território */}
      <td className="py-3 px-4">
        <div className="flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-on-surface-variant shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-xs text-on-surface">{leader.bairro}</p>
            <p className="text-[11px] text-on-surface-variant">{leader.regiao}</p>
          </div>
        </div>
      </td>

      {/* Contato */}
      <td className="py-3 px-4">
        <div className="space-y-1">
          {leader.telefone && (
            <a
              href={`https://wa.me/55${leader.telefone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-mono font-medium text-secondary hover:underline"
            >
              <Phone className="w-3 h-3" />
              {leader.telefone}
            </a>
          )}
          {leader.email && (
            <p className="text-[11px] text-on-surface-variant flex items-center gap-1 truncate max-w-[150px]">
              <Mail className="w-3 h-3" /> {leader.email}
            </p>
          )}
        </div>
      </td>

      {/* Captação & Meta */}
      <td className="py-3 px-4">
        <div className="w-36">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-bold text-on-surface">
              {voterCount}{' '}
              <span className="font-normal text-[10px] text-on-surface-variant">
                / {meta} votos
              </span>
            </span>
            <span className="font-bold text-secondary text-xs">{pct}%</span>
          </div>
          <div className="w-full h-1.5 rounded bg-surface-container overflow-hidden">
            <div
              className={`h-full rounded transition-all duration-500 ${
                pct >= 100
                  ? 'bg-emerald-600'
                  : pct >= 50
                  ? 'bg-secondary'
                  : 'bg-primary-container'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="py-3 px-4">
        {leader.status === 'Ativa' && (
          <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
            <CheckCircle2 className="w-3 h-3" /> Ativa
          </span>
        )}
        {leader.status === 'Em Formação' && (
          <span className="inline-flex items-center gap-1 text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
            <Clock className="w-3 h-3" /> Em Formação
          </span>
        )}
        {leader.status === 'Inativa' && (
          <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
            <AlertCircle className="w-3 h-3" /> Inativa
          </span>
        )}
      </td>

      {/* Ações */}
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-1">
          {isPrincipal && (
            <button
              onClick={onAddSub}
              title="Adicionar Sub-liderança subordinada"
              className="p-1.5 text-secondary hover:bg-secondary/10 rounded transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onEdit}
            title="Editar articulador"
            className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            title="Excluir"
            className="p-1.5 text-error hover:bg-error/10 rounded transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
});
