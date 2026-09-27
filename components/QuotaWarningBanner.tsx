'use client';

import React, { useState, useEffect } from 'react';
import { ExternalLink, RefreshCw, X, DatabaseZap } from 'lucide-react';
import { resetCircuitBreaker } from '@/lib/firestoreErrors';

export function QuotaWarningBanner() {
  const [isExceeded, setIsExceeded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    // Escuta evento seguro disparado pelo manipulador de erros quando uma cota 429 for detectada
    const handleQuotaEvent = () => {
      setIsExceeded(true);
      setIsDismissed(false);
    };

    window.addEventListener('firestore-quota-exceeded', handleQuotaEvent);

    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuotaEvent);
    };
  }, []);

  const handleRetryConnection = () => {
    setIsReconnecting(true);
    resetCircuitBreaker('eleitores');
    resetCircuitBreaker('liderancas');
    resetCircuitBreaker('locais_votacao');
    resetCircuitBreaker('configuracoes/geral');
    resetCircuitBreaker('usuarios');
    resetCircuitBreaker('logs_auditoria');

    setTimeout(() => {
      setIsReconnecting(false);
      setIsExceeded(false);
    }, 1500);
  };

  if (!isExceeded || isDismissed) return null;

  return (
    <div className="bg-sky-500/10 border-b border-sky-500/30 text-sky-950 dark:text-sky-200 px-4 py-3 shrink-0 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-sky-500/20 text-sky-700 dark:text-sky-300 shrink-0 mt-0.5 md:mt-0">
            <DatabaseZap className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-sky-900 dark:text-sky-100 flex items-center gap-2">
              <span>Modo Cache Local Ativado — Zero Perda de Dados</span>
              <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-800 dark:text-sky-300">
                Economia de Leituras
              </span>
            </p>
            <p className="text-sky-800/90 dark:text-sky-300/90 mt-0.5 leading-relaxed">
              O sistema ativou o modo de proteção de cota diária do Firestore. Seus dados cadastrados estão
              <strong> 100% preservados e disponíveis</strong> na memória e armazenamento local do navegador para que sua operação não pare.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
          <button
            onClick={handleRetryConnection}
            disabled={isReconnecting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 font-semibold text-sky-900 dark:text-sky-200 transition-colors cursor-pointer disabled:opacity-50"
            title="Sincronizar com o banco na nuvem"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
            <span>Sincronizar Nuvem</span>
          </button>

          <a
            href="https://console.firebase.google.com/project/seati-d0096/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold transition-colors shadow-sm cursor-pointer"
          >
            <span>Console Firebase</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={() => setIsDismissed(true)}
            className="p-1.5 rounded-lg hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 transition-colors cursor-pointer"
            title="Ocultar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
