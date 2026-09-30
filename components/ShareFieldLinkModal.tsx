'use client';

import React, { useState, useMemo } from 'react';
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  X,
  Sparkles
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTenant } from '@/context/TenantContext';
import { useCampaignData } from '@/context/CampaignContext';

interface ShareFieldLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultLiderId?: string;
}

export function ShareFieldLinkModal({
  isOpen,
  onClose,
  defaultLiderId = ''
}: ShareFieldLinkModalProps) {
  const { subdomain } = useTenant();
  const { liderancas } = useCampaignData();

  const [selectedLiderId, setSelectedLiderId] = useState<string>(defaultLiderId);
  const [copied, setCopied] = useState(false);

  // Gera o link público absoluto
  const fieldUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    const baseUrl = `${origin}/cadastro-externo`;
    const params = new URLSearchParams();

    if (subdomain && subdomain !== 'demo') {
      params.set('subdomain', subdomain);
    }
    if (selectedLiderId) {
      params.set('lider', selectedLiderId);
    }

    const q = params.toString();
    return q ? `${baseUrl}?${q}` : baseUrl;
  }, [subdomain, selectedLiderId]);

  const selectedLeader = useMemo(() => {
    return liderancas.find((l) => l.id === selectedLiderId);
  }, [liderancas, selectedLiderId]);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fieldUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    }
  };

  const handleWhatsApp = () => {
    const leaderText = selectedLeader ? ` (Liderança: ${selectedLeader.nome})` : '';
    const text = `🗳️ *Equipe de Campo - Cadastro Rápido de Eleitores*\n\nOlá equipe! Acessem o link abaixo para cadastrar novos eleitores diretamente pelo celular, sem necessidade de senha:\n\n👉 ${fieldUrl}${leaderText}\n\nBom trabalho na campanha!`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl text-left space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-on-surface">Link da Equipe de Campo</h3>
              <p className="text-xs text-on-surface-variant">
                Cadastro rápido externo sem necessidade de autenticação
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Explicação */}
        <div className="p-3.5 bg-surface-container-low rounded-xl border border-outline-variant/60 text-xs text-on-surface-variant space-y-1">
          <p className="font-semibold text-on-surface flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-secondary" />
            Página 100% Isolada e Segura
          </p>
          <p>
            Os voluntários e articuladores de rua não terão acesso ao painel interno, senhas ou lista completa de eleitores. Eles apenas digitam e enviam novas fichas diretamente para a base oficial.
          </p>
        </div>

        {/* Filtro Opcional de Liderança Pré-Vinculada */}
        <div>
          <label className="block text-xs font-bold text-on-surface mb-1">
            Vincular Link a uma Liderança Específica (Opcional):
          </label>
          <select
            value={selectedLiderId}
            onChange={(e) => setSelectedLiderId(e.target.value)}
            className="w-full h-10 border border-outline-variant rounded-xl px-3 text-xs bg-surface text-on-surface focus:outline-none focus:border-secondary font-medium cursor-pointer"
          >
            <option value="">Liderança Livre (o voluntário escolhe em campo)</option>
            {liderancas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome} ({l.tipo === 'Sub-liderança' ? `Sub de ${l.liderancaPaiNome || 'Coordenação'}` : 'Principal'})
              </option>
            ))}
          </select>
          {selectedLeader && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
              ✓ Todos os eleitores cadastrados através deste link serão automaticamente atribuídos a <strong>{selectedLeader.nome}</strong>.
            </p>
          )}
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl shadow-inner border border-outline-variant/40">
          <QRCodeSVG
            value={fieldUrl}
            size={160}
            level="M"
            includeMargin={true}
          />
          <p className="text-[11px] text-slate-800 font-semibold mt-1 text-center">
            Aponte a câmera do celular para abrir a página de campo
          </p>
        </div>

        {/* Input do Link */}
        <div>
          <label className="block text-xs font-bold text-on-surface mb-1">
            Link Completo:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={fieldUrl}
              className="w-full h-10 bg-surface-container-lowest border border-outline-variant rounded-xl px-3 text-xs font-mono text-on-surface select-all focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="px-4 py-2.5 bg-secondary text-white rounded-xl text-xs font-bold hover:brightness-110 flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs transition-all"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>
        </div>

        {/* Ações */}
        <div className="pt-2 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={handleWhatsApp}
            className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Compartilhar no WhatsApp</span>
          </button>
          <a
            href={fieldUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2.5 px-4 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-outline-variant/60 transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-primary" />
            <span>Abrir Página</span>
          </a>
        </div>
      </div>
    </div>
  );
}
