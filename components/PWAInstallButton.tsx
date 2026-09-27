'use client';

import React, { useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Download, Share, CheckCircle2, X, Smartphone, Monitor, Sparkles, ExternalLink } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstalled, isIOS, install, hasNativePrompt } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [isAttemptingInstall, setIsAttemptingInstall] = useState(false);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  const handleInstallClick = async () => {
    setIsAttemptingInstall(true);

    // 1. Tentar primeiro o prompt nativo de instalação direta do navegador
    if (hasNativePrompt) {
      const success = await install();
      setIsAttemptingInstall(false);
      if (success) {
        return;
      }
    }

    // 2. Se estiver dentro do iframe do AI Studio, o navegador bloqueia o popup nativo de instalação.
    // Abrir em nova aba permite o prompt nativo e instalação direta.
    if (isInIframe) {
      setIsAttemptingInstall(false);
      setShowGuideModal(true);
      return;
    }

    // 3. Tentar chamar install mesmo sem flag persistente (caso evento tenha sido capturado)
    const directSuccess = await install();
    setIsAttemptingInstall(false);
    if (!directSuccess) {
      setShowGuideModal(true);
    }
  };

  const handleOpenDirectAppTab = () => {
    if (typeof window !== 'undefined') {
      window.open(window.location.origin, '_blank');
    }
  };

  // Se o aplicativo já estiver aberto em modo PWA / instalado
  if (isInstalled) {
    return (
      <div 
        id="pwa-installed-badge"
        title="O sistema já está instalado como aplicativo neste dispositivo"
        className="flex items-center gap-2.5 px-3 py-2 w-full rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-200 text-xs font-semibold select-none"
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="truncate">Aplicativo Instalado</span>
      </div>
    );
  }

  return (
    <>
      <button
        id="pwa-sidebar-install-button"
        onClick={handleInstallClick}
        disabled={isAttemptingInstall}
        className="flex items-center gap-2.5 px-3 py-2 w-full rounded-xl bg-gradient-to-r from-secondary/80 to-secondary hover:from-secondary hover:to-secondary/90 text-white transition-all text-xs font-semibold text-left cursor-pointer shadow-sm active:scale-[0.98] disabled:opacity-50 border border-white/10"
      >
        <Download className="w-4 h-4 shrink-0 text-sky-200" />
        <span className="truncate">{hasNativePrompt ? 'Instalar Aplicativo' : 'Instalar no Dispositivo'}</span>
        <span className="ml-auto bg-white/15 text-[10px] px-1.5 py-0.5 rounded font-mono font-normal">
          PWA
        </span>
      </button>

      {/* Modal com instruções e ações de instalação direta */}
      {showGuideModal && (
        <div 
          id="pwa-install-modal-overlay" 
          onClick={() => setShowGuideModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-scrim/70 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
        >
          <div 
            id="pwa-install-modal-card" 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm sm:max-w-md max-h-[92vh] flex flex-col rounded-2xl bg-surface-container-lowest border-2 border-outline-variant/80 shadow-2xl text-on-surface animate-in zoom-in-95 duration-150 my-auto overflow-hidden ring-1 ring-black/5"
          >
            {/* Header fixo */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-outline-variant/40 bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-secondary text-on-secondary flex items-center justify-center shrink-0 shadow-xs">
                  <Download className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-on-surface leading-tight truncate">Instalar Aplicativo</h3>
                  <p className="text-[11px] text-on-surface-variant leading-tight truncate">SEATI no seu Dispositivo</p>
                </div>
              </div>
              <button
                id="pwa-modal-close-btn"
                onClick={() => setShowGuideModal(false)}
                title="Fechar janela"
                className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo rolável sem corte em nenhuma tela */}
            <div className="p-3.5 sm:p-4 space-y-3 text-xs overflow-y-auto max-h-[calc(92vh-130px)] custom-scrollbar">
              {/* Botão de Ação Direta Principal */}
              <div className="p-3 bg-secondary/10 border-2 border-secondary/30 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-secondary text-xs">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Instalação Direta</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-on-secondary font-bold">
                    1 Clique
                  </span>
                </div>

                <p className="text-on-surface-variant text-[11px] leading-relaxed">
                  {hasNativePrompt 
                    ? 'Dispare o instalador oficial do navegador:'
                    : isInIframe
                    ? 'Para instalar ou baixar como app no seu desktop ou celular, abra em tela cheia:'
                    : 'Dispare a instalação do sistema no seu dispositivo:'}
                </p>

                <div className="pt-0.5 flex flex-col gap-2">
                  <button
                    id="pwa-modal-native-install-btn"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) {
                        setShowGuideModal(false);
                      } else {
                        handleOpenDirectAppTab();
                        setShowGuideModal(false);
                      }
                    }}
                    className="w-full py-2.5 px-3 bg-secondary text-on-secondary hover:bg-secondary/90 rounded-lg font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar / Instalar Agora</span>
                  </button>

                  {isInIframe && (
                    <button
                      id="pwa-modal-open-tab-btn"
                      onClick={() => {
                        handleOpenDirectAppTab();
                        setShowGuideModal(false);
                      }}
                      className="w-full py-2 px-3 border border-secondary/40 text-secondary bg-surface-container-lowest hover:bg-secondary/10 rounded-lg font-semibold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir em Nova Aba (Tela Cheia)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Guia para Computador */}
              <div className="p-2.5 bg-surface-container-low/70 rounded-xl border border-outline-variant/40 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-on-surface text-[11.5px]">
                  <Monitor className="w-3.5 h-3.5 text-secondary" />
                  <span>Computador (Chrome / Edge / Brave)</span>
                </div>
                <p className="text-on-surface-variant text-[11px] leading-relaxed">
                  Na barra de endereços (URL), clique no ícone de <strong>instalar aplicativo [+]</strong> ou no menu <strong>(⋮) &gt; &quot;Instalar SEATI&quot;</strong>.
                </p>
              </div>

              {/* Guia para Celular */}
              <div className="p-2.5 bg-surface-container-low/70 rounded-xl border border-outline-variant/40 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-on-surface text-[11.5px]">
                  <Smartphone className="w-3.5 h-3.5 text-secondary" />
                  <span>Celular (Android ou iPhone)</span>
                </div>
                {isIOS ? (
                  <p className="text-on-surface-variant text-[11px] leading-relaxed">
                    Toque no botão <strong>Compartilhar</strong> <Share className="inline w-3 h-3 text-secondary mx-0.5" /> no Safari e selecione <strong>&quot;Adicionar à Tela de Início&quot;</strong>.
                  </p>
                ) : (
                  <p className="text-on-surface-variant text-[11px] leading-relaxed">
                    Toque nos <strong>três pontos (⋮)</strong> do navegador e selecione <strong>&quot;Instalar aplicativo&quot;</strong> ou <strong>&quot;Adicionar à tela inicial&quot;</strong>.
                  </p>
                )}
              </div>
            </div>

            {/* Rodapé com botão Fechar com tonalidade e contraste destacados */}
            <div className="px-4 sm:px-5 py-3 border-t border-outline-variant/40 bg-surface-container-low flex items-center justify-between gap-3 shrink-0">
              <span className="text-[11px] text-on-surface-variant font-medium">PWA Offline &amp; Seguro</span>
              <button
                id="pwa-modal-dismiss-btn"
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="px-5 py-2 bg-primary text-on-primary hover:bg-secondary rounded-lg font-bold text-xs shadow-sm transition-all cursor-pointer text-center ring-1 ring-primary/20 hover:ring-secondary/40"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

