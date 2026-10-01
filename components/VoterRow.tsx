'use client';

import React from 'react';
import { Eleitor, formatTituloUtil } from '@/context/CampaignContext';
import {
  AlertTriangle,
  MessageCircle,
  Edit,
  Trash2
} from 'lucide-react';

interface VoterRowProps {
  eleitor: Eleitor;
  linkedLeader?: { tipo?: string; liderancaPaiNome?: string };
  isConflict: boolean;
  conflictCount?: number;
  isTituloConflict?: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onAuditConflict: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  statusBadgeClass: string;
}

export const VoterRow = React.memo(function VoterRow({
  eleitor,
  linkedLeader,
  isConflict,
  conflictCount,
  isTituloConflict,
  isSelected,
  onToggleSelect,
  onAuditConflict,
  onEdit,
  onDelete,
  statusBadgeClass
}: VoterRowProps) {
  const cleanPhone = eleitor.telefone ? eleitor.telefone.replace(/\D/g, '') : '';
  const hasValidPhone = cleanPhone.length >= 10;
  const whatsappUrl = hasValidPhone ? `https://wa.me/55${cleanPhone}` : null;

  return (
    <tr
      className={`transition-colors ${
        isSelected
          ? 'bg-secondary/10 hover:bg-secondary/15 ring-1 ring-inset ring-secondary/30'
          : isConflict
          ? 'bg-error-container/15 hover:bg-error-container/25'
          : 'hover:bg-surface-container-low'
      }`}
    >
      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="rounded border-outline-variant text-secondary focus:ring-secondary w-4 h-4 cursor-pointer"
        />
      </td>
      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
        <p className="font-semibold text-xs md:text-sm text-on-surface leading-tight">{eleitor.nome}</p>
        <p className="text-[10px] md:text-[11px] text-on-surface-variant mt-0.5 leading-none">
          {eleitor.bairro ? `${eleitor.bairro} • ` : ''}
          {eleitor.telefone || 'Sem telefone'}
        </p>
      </td>
      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
        <span className="font-mono text-xs md:text-sm font-semibold text-on-surface">
          {eleitor.cpf ? eleitor.cpf : <span className="text-outline text-xs font-normal italic">Não informado</span>}
        </span>
        {isConflict ? (
          <button
            type="button"
            onClick={onAuditConflict}
            className="mt-0.5 text-[9px] bg-error-container text-error px-1.5 py-0.5 rounded font-bold border border-error/40 hover:bg-error/20 transition-colors flex items-center gap-1 cursor-pointer w-max"
            title="Clique para auditar e resolver o conflito deste CPF"
          >
            <AlertTriangle className="w-3 h-3 text-error" /> Conflito ({conflictCount || 2}x)
          </button>
        ) : (
          <span
            className={`block mt-0.5 text-[9px] px-2 py-0.5 rounded-full w-max font-bold border leading-none ${statusBadgeClass}`}
          >
            {eleitor.status || 'Validado'}
          </span>
        )}
      </td>
      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
        <span className="font-mono text-xs font-semibold text-on-surface">
          {eleitor.tituloEleitor ? formatTituloUtil(eleitor.tituloEleitor) : '-'}
        </span>
        {isTituloConflict && (
          <span
            className="mt-0.5 text-[9px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-bold border border-amber-300 flex items-center gap-1 w-max"
            title="Este número de título de eleitor consta em mais de um cadastro"
          >
            <AlertTriangle className="w-3 h-3 text-amber-700" /> Título Duplicado
          </span>
        )}
      </td>
      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
        <span className="font-semibold text-xs md:text-sm">{eleitor.zona}</span>
        <span className="text-on-surface-variant text-[11px]"> / {eleitor.secao || ''}</span>
      </td>
      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
        <div className="text-xs md:text-sm font-medium text-on-surface flex items-center gap-1.5 leading-tight">
          <span>{eleitor.lideranca}</span>
        </div>
        {linkedLeader?.tipo === 'Sub-liderança' && (
          <span className="text-[10px] text-secondary font-medium block mt-0.5 leading-none">
            Sub de: {linkedLeader.liderancaPaiNome || 'Coordenação'}
          </span>
        )}
      </td>
      <td className="py-1.5 px-3 md:py-2 md:px-3.5 text-center">
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Conversar no WhatsApp com ${eleitor.nome}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-300 hover:border-emerald-600 rounded text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            <MessageCircle className="w-3 h-3" />
            <span>Zap</span>
          </a>
        ) : (
          <span
            className="text-[11px] text-on-surface-variant/50 cursor-not-allowed"
            title="Sem telefone válido para contato"
          >
            -
          </span>
        )}
      </td>
      <td className="py-1.5 px-3 md:py-2 md:px-3.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onEdit}
            title="Editar Eleitor"
            className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded transition-colors cursor-pointer"
          >
            <Edit className="w-4 h-4" />
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              title="Excluir Eleitor"
              className="p-1.5 text-error hover:bg-error/10 rounded transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});
