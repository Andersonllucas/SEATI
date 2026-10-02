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
  onAuditConflict: (type: 'cpf' | 'titulo') => void;
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
        {isConflict && eleitor.cpf ? (
          <button
            type="button"
            onClick={() => onAuditConflict('cpf')}
            className="font-mono text-xs md:text-sm font-bold text-rose-700 hover:underline inline-flex items-center gap-1 cursor-pointer text-left"
            title="CPF Duplicado - Clique para auditar na aba de CPF"
          >
            <span>{eleitor.cpf}</span>
          </button>
        ) : (
          <span className="font-mono text-xs md:text-sm font-semibold text-on-surface">
            {eleitor.cpf ? eleitor.cpf : <span className="text-outline text-xs font-normal italic">Não informado</span>}
          </span>
        )}
      </td>
      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
        {isTituloConflict && eleitor.tituloEleitor ? (
          <button
            type="button"
            onClick={() => onAuditConflict('titulo')}
            className="font-mono text-xs font-bold text-amber-700 hover:underline inline-flex items-center gap-1 cursor-pointer text-left"
            title="Título Duplicado - Clique para auditar na aba de Título de Eleitor"
          >
            <span>{formatTituloUtil(eleitor.tituloEleitor)}</span>
          </button>
        ) : (
          <span className="font-mono text-xs font-semibold text-on-surface">
            {eleitor.tituloEleitor ? formatTituloUtil(eleitor.tituloEleitor) : '-'}
          </span>
        )}
      </td>
      <td className="py-1.5 px-2 md:py-2 md:px-2.5 text-center whitespace-nowrap">
        {isConflict && isTituloConflict ? (
          <div className="flex flex-col gap-1 items-center justify-center">
            <button
              type="button"
              onClick={() => onAuditConflict('cpf')}
              className="text-[9px] md:text-[10px] bg-rose-100 text-rose-900 px-2 py-0.5 rounded-full font-bold border border-rose-300 hover:bg-rose-200 transition-colors inline-flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Clique para auditar e resolver o conflito deste CPF"
            >
              <AlertTriangle className="w-3 h-3 text-rose-700" /> CPF Conflito ({conflictCount || 2}x)
            </button>
            <button
              type="button"
              onClick={() => onAuditConflict('titulo')}
              className="text-[9px] md:text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold border border-amber-300 hover:bg-amber-200 transition-colors inline-flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Clique para auditar e resolver a duplicidade deste Título"
            >
              <AlertTriangle className="w-3 h-3 text-amber-700" /> Título Duplicado
            </button>
          </div>
        ) : isConflict ? (
          <button
            type="button"
            onClick={() => onAuditConflict('cpf')}
            className="text-[9px] md:text-[10px] bg-rose-100 text-rose-900 px-2 py-0.5 rounded-full font-bold border border-rose-300 hover:bg-rose-200 transition-colors inline-flex items-center gap-1 cursor-pointer shadow-2xs"
            title="Clique para auditar e resolver o conflito deste CPF"
          >
            <AlertTriangle className="w-3 h-3 text-rose-700" /> CPF Duplicado ({conflictCount || 2}x)
          </button>
        ) : isTituloConflict ? (
          <button
            type="button"
            onClick={() => onAuditConflict('titulo')}
            className="text-[9px] md:text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold border border-amber-300 hover:bg-amber-200 transition-colors inline-flex items-center gap-1 cursor-pointer shadow-2xs"
            title="Clique para auditar e resolver a duplicidade deste Título"
          >
            <AlertTriangle className="w-3 h-3 text-amber-700" /> Título Duplicado
          </button>
        ) : (
          <span
            className={`inline-block text-[9px] md:text-[10px] px-2 py-0.5 rounded-full font-bold border leading-none ${statusBadgeClass}`}
          >
            {eleitor.status || 'Pendente'}
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
