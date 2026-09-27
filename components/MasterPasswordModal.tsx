'use client';

import React, { useState } from 'react';
import { ShieldAlert, KeyRound, Eye, EyeOff, X, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

function MasterPasswordDialog({ activePrompt }: { activePrompt: any }) {
  const { fecharSolicitacaoSenhaMestre, validarSenhaMestre } = useAuth();
  const [senhaInput, setSenhaInput] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!senhaInput.trim()) {
      setErro('Digite a senha mestre para prosseguir.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isValid = await validarSenhaMestre(senhaInput);
      if (!isValid) {
        setErro('Senha mestre incorreta! Verifique com o administrador.');
        setIsSubmitting(false);
        return;
      }

      if (typeof activePrompt.onSuccess === 'function') {
        await activePrompt.onSuccess();
      } else if (typeof activePrompt.onConfirm === 'function') {
        await activePrompt.onConfirm();
      }
      fecharSolicitacaoSenhaMestre();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao executar a exclusão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest border border-error/40 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header com destaque de segurança */}
        <div className="bg-error-container/40 p-4 border-b border-error/20 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-error text-on-error rounded-xl shadow-sm">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-on-error-container">
                {activePrompt.title || 'Autorização de Exclusão'}
              </h3>
              <span className="text-xs font-semibold text-error uppercase tracking-wider">
                Exige Senha Mestre
              </span>
            </div>
          </div>
          <button
            onClick={fecharSolicitacaoSenhaMestre}
            disabled={isSubmitting}
            className="text-on-error-container/70 hover:text-on-error-container p-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com aviso e input de senha */}
        <form onSubmit={handleConfirm} className="p-5 space-y-4">
          <div className="p-3 bg-surface-container-low border border-outline-variant/50 rounded-xl flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {activePrompt.description ||
                'Para proteger a integridade dos dados da campanha, qualquer exclusão exige a confirmação com a Senha Mestre do sistema.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-primary" />
              Digite a Senha Mestre:
            </label>
            <div className="relative">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                autoFocus
                value={senhaInput}
                onChange={(e) => {
                  setSenhaInput(e.target.value);
                  if (erro) setErro(null);
                }}
                placeholder="Informe a senha mestre..."
                className="w-full h-11 pl-3.5 pr-11 bg-surface border-2 border-outline-variant rounded-xl focus:border-error focus:ring-2 focus:ring-error/20 text-sm font-semibold text-on-surface outline-none transition-all placeholder:font-normal placeholder:text-outline"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                className="absolute right-3 top-3 text-on-surface-variant hover:text-on-surface p-0.5"
              >
                {mostrarSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {erro && (
              <p className="text-xs font-semibold text-error mt-2 flex items-center gap-1 animate-in fade-in">
                <span>✕</span> {erro}
              </p>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={fecharSolicitacaoSenhaMestre}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-bold bg-error hover:bg-error/90 text-on-error rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Excluindo...
                </>
              ) : (
                'Autorizar & Excluir'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function MasterPasswordModal() {
  const { activePrompt } = useAuth();
  if (!activePrompt) return null;
  return <MasterPasswordDialog activePrompt={activePrompt} key={activePrompt.title || 'active-prompt'} />;
}
