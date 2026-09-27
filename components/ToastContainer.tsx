'use client';

import React, { useEffect, useState } from 'react';
import { useToast, ToastItem } from '@/context/ToastContext';
import { CheckCircle2, AlertTriangle, Info, X, ChevronDown, ChevronUp } from 'lucide-react';

function SingleToast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const duration = toast.duration || 10000;

  useEffect(() => {
    if (isPaused) return;
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, duration, isPaused, onDismiss]);

  const isWarning = toast.type === 'warn' || toast.type === 'warning';
  const isError = toast.type === 'error';
  const isSuccess = toast.type === 'success';

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`pointer-events-auto rounded-2xl border-2 shadow-2xl backdrop-blur-md p-4 transition-all duration-200 animate-fadeIn ${
        isSuccess
          ? 'bg-emerald-950/95 border-emerald-400 text-emerald-50 shadow-emerald-950/50'
          : isWarning
          ? 'bg-amber-950/95 border-amber-400 text-amber-50 shadow-amber-950/50'
          : isError
          ? 'bg-rose-950/95 border-rose-400 text-rose-50 shadow-rose-950/50'
          : 'bg-sky-950/95 border-sky-400 text-sky-50 shadow-sky-950/50'
      }`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-xl shrink-0 mt-0.5 ${
            isSuccess
              ? 'bg-emerald-500/20 text-emerald-300'
              : isWarning
              ? 'bg-amber-500/20 text-amber-300'
              : isError
              ? 'bg-rose-500/20 text-rose-300'
              : 'bg-sky-500/20 text-sky-300'
          }`}
        >
          {isSuccess && <CheckCircle2 className="w-5 h-5" />}
          {isWarning && <AlertTriangle className="w-5 h-5" />}
          {isError && <AlertTriangle className="w-5 h-5" />}
          {!isSuccess && !isWarning && !isError && <Info className="w-5 h-5" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-sm leading-snug tracking-tight truncate">
              {toast.title}
            </h4>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              title="Fechar notificação"
              aria-label="Fechar notificação"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs mt-1 text-white/90 leading-relaxed font-normal">
            {toast.message}
          </p>

          {toast.details && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowDetails((prev) => !prev)}
                className="text-[11px] font-semibold text-white/80 hover:text-white flex items-center gap-1 underline underline-offset-2 cursor-pointer"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" /> Ocultar detalhes técnicos
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" /> Ver detalhes técnicos
                  </>
                )}
              </button>
              {showDetails && (
                <div className="mt-2 p-2.5 rounded-lg bg-black/40 border border-white/10 font-mono text-[11px] text-white/80 max-h-32 overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar">
                  {toast.details}
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/15 text-[11px]">
            <span className="text-white/60 font-mono text-[10px]">
              {isPaused ? 'Pausado (cursor sobre o aviso)' : `Visível por ${(duration / 1000).toFixed(0)}s`}
            </span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold transition-colors cursor-pointer text-xs"
            >
              Entendi
            </button>
          </div>
        </div>
      </div>

      {/* Barra de progresso visual */}
      {!isPaused && (
        <div className="mt-3 h-1 w-full bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/80 rounded-full"
            style={{
              animation: `shrinkWidth ${duration}ms linear forwards`
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-5 right-5 z-[99999] flex flex-col gap-3 max-w-md w-[calc(100vw-2.5rem)] sm:w-[420px] pointer-events-none"
    >
      {toasts.map((toast) => (
        <SingleToast key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
