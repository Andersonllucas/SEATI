'use client';

import React, { useState } from 'react';
import { ShieldAlert, KeyRound, Eye, EyeOff, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function PasswordChangePromptModal() {
  const { currentUser, atualizarUsuario } = useAuth();
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [ignoradoNestaSessao, setIgnoradoNestaSessao] = useState(false);

  // Exibe apenas se o usuário logado estiver marcado com senhaProvisoria
  if (!currentUser || !currentUser.senhaProvisoria || ignoradoNestaSessao) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const s = novaSenha.trim();
    if (!s || s.length < 6) {
      setErro('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (s !== confirmaSenha.trim()) {
      setErro('A confirmação de senha não confere com a nova senha.');
      return;
    }

    if (s === '123456') {
      setErro('Por favor, escolha uma senha diferente da provisória padrão.');
      return;
    }

    try {
      setIsSubmitting(true);
      await atualizarUsuario(currentUser.id, {
        senha: s,
        senhaProvisoria: false
      });
      setSucesso(true);
      setTimeout(() => {
        setIgnoradoNestaSessao(true);
      }, 1500);
    } catch (err: any) {
      setErro(err?.message || 'Falha ao redefinir a senha provisória.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="max-w-md w-full bg-surface-container-low border border-amber-500/50 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-600 uppercase tracking-wider">
                Primeiro Acesso Detectado
              </span>
              <h2 className="text-lg font-bold font-display text-on-surface mt-0.5">
                Redefinir Senha Provisória
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIgnoradoNestaSessao(true)}
            className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            title="Lembrar mais tarde"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-on-surface-variant leading-relaxed">
          Olá, <strong>{currentUser.nome}</strong>! Você está utilizando a senha provisória padrão cadastrada pelo administrador. Para a segurança dos dados da sua campanha, cadastre agora a sua senha pessoal definitiva.
        </p>

        {erro && (
          <div className="p-3 rounded-xl bg-error/10 border border-error/30 text-error text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {sucesso ? (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-xs flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Senha redefinida com sucesso! Bom trabalho na campanha.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                Nova Senha Definitiva
              </label>
              <div className="relative">
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  required
                  autoFocus
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3 top-2.5 text-on-surface-variant hover:text-on-surface p-0.5 cursor-pointer"
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                Confirmar Nova Senha
              </label>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                required
                value={confirmaSenha}
                onChange={(e) => setConfirmaSenha(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIgnoradoNestaSessao(true)}
                className="text-xs text-on-surface-variant hover:text-on-surface font-medium hover:underline cursor-pointer"
              >
                Lembrar depois
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <KeyRound className="w-4 h-4" />
                <span>{isSubmitting ? 'Atualizando...' : 'Definir Senha Definitiva'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
