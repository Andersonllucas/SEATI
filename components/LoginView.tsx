'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Vote,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  X,
  CheckCircle2,
  Clock,
  Globe,
  Sparkles,
  Shield,
  Users
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';

export function LoginView({ onLoginSuccess }: { onLoginSuccess?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { login, currentUser, isLoading } = useAuth();
  const { currentTenant, subdomain, tenantError } = useTenant();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrarMe, setLembrarMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  // Security: Brute-force protection state
  const [tentativasFalhas, setTentativasFalhas] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setErro(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  // If already logged in, redirect or trigger onLoginSuccess
  useEffect(() => {
    if (!isLoading && currentUser) {
      if (onLoginSuccess) {
        onLoginSuccess();
      } else if (pathname === '/login') {
        try {
          router.replace('/');
        } catch {
          window.location.href = '/';
        }
      }
    }
  }, [currentUser, isLoading, onLoginSuccess, pathname, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    // Check if currently locked out
    if (lockoutSeconds > 0) {
      setErro(`Bloqueio temporário de segurança. Aguarde ${lockoutSeconds}s antes de tentar novamente.`);
      return;
    }

    const cleanEmail = email.trim();
    const cleanSenha = senha.trim();

    if (!cleanEmail) {
      setErro('Por favor, informe o seu e-mail cadastrado.');
      return;
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErro('Por favor, digite um formato de e-mail válido.');
      return;
    }

    if (!cleanSenha) {
      setErro('Por favor, informe a sua senha de acesso.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await login(cleanEmail, cleanSenha, lembrarMe);

      if (res.success) {
        setSucesso(true);
        setTentativasFalhas(0);
        setTimeout(() => {
          if (onLoginSuccess) {
            onLoginSuccess();
          } else {
            try {
              router.replace('/');
            } catch {
              window.location.href = '/';
            }
          }
        }, 300);
      } else {
        const novasTentativas = tentativasFalhas + 1;
        setTentativasFalhas(novasTentativas);

        // If reached 5 failed attempts, lock out for 60 seconds
        if (novasTentativas >= 5) {
          setLockoutSeconds(60);
          setErro('Muitas tentativas consecutivas sem sucesso. Por segurança, o acesso foi temporariamente bloqueado por 60 segundos.');
        } else {
          const restantes = 5 - novasTentativas;
          setErro(
            `${res.error || 'Credenciais inválidas.'} ${
              restantes <= 3 ? `(${restantes} ${restantes === 1 ? 'tentativa restante' : 'tentativas restantes'} antes do bloqueio)` : ''
            }`
          );
        }
      }
    } catch (err: any) {
      setErro(err?.message || 'Erro inesperado ao conectar ao servidor seguro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col justify-between relative overflow-hidden text-slate-100">
      {/* Background architectural grid and ambient gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e3a8a_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 z-10 my-auto">
        <div className="w-full max-w-md space-y-6">
          {/* Logo & Institutional Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-900/40 border border-blue-400/20 mb-2">
              <Vote className="w-9 h-9" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-display">
              {currentTenant?.nome || 'SCE - ADTI'}
            </h1>
            <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-slate-400 max-w-sm mx-auto flex-wrap">
              <span>Gestão Eleitoral &bull; Acesso Seguro</span>
              {subdomain && subdomain !== 'admin' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  <Globe className="w-3 h-3 text-blue-400" />
                  {subdomain}.adti.app.br
                </span>
              )}
            </div>
          </div>

          {/* Tenant Warning/Error if any */}
          {tenantError && (
            <div className="p-4 bg-amber-950/80 border border-amber-600/50 rounded-2xl flex items-start gap-3 text-amber-200 text-xs shadow-lg">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold text-amber-300 text-sm mb-0.5">Aviso de Subdomínio</strong>
                {tenantError.message}
              </div>
            </div>
          )}

          {/* Login Card */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl shadow-black/80 p-6 sm:p-8 backdrop-blur-md">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-white tracking-tight">
                Autenticação de Usuário
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Insira suas credenciais cadastradas para acessar o painel restrito.
              </p>
            </div>

            {/* Lockout Warning */}
            {lockoutSeconds > 0 && (
              <div className="mb-5 p-3.5 bg-amber-950/70 border border-amber-600/50 rounded-xl flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-spin" />
                <div className="text-xs text-amber-200 leading-relaxed font-medium">
                  Acesso temporariamente bloqueado por segurança. Tente novamente em{' '}
                  <strong className="text-amber-300 font-bold">{lockoutSeconds} segundos</strong>.
                </div>
              </div>
            )}

            {/* Error Banner */}
            {erro && lockoutSeconds === 0 && (
              <div className="mb-5 p-3.5 bg-red-950/70 border border-red-700/60 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs text-red-200 leading-relaxed font-medium">
                  {erro}
                </div>
              </div>
            )}

            {/* Success Banner */}
            {sucesso && (
              <div className="mb-5 p-3.5 bg-emerald-950/70 border border-emerald-600/60 rounded-xl flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-xs text-emerald-200 font-semibold">
                  Credenciais validadas com sucesso! Carregando painel...
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email field */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-sky-400" />
                  E-mail de Acesso
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    disabled={submitting || sucesso || lockoutSeconds > 0}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (erro && lockoutSeconds === 0) setErro(null);
                    }}
                    placeholder="nome@campanha.com"
                    className="w-full h-11 pl-3.5 pr-4 bg-slate-800/90 border border-slate-700 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 text-sm font-medium text-white outline-none transition-all placeholder:text-slate-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-sky-400" />
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => setHelpModalOpen(true)}
                    className="text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline transition-colors cursor-pointer"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    disabled={submitting || sucesso || lockoutSeconds > 0}
                    value={senha}
                    onChange={(e) => {
                      setSenha(e.target.value);
                      if (erro && lockoutSeconds === 0) setErro(null);
                    }}
                    placeholder="••••••••••••"
                    className="w-full h-11 pl-3.5 pr-11 bg-slate-800/90 border border-slate-700 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 text-sm font-medium text-white outline-none transition-all placeholder:text-slate-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={submitting || sucesso}
                    onClick={() => setMostrarSenha(!mostrarSenha)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-sky-300 p-0.5 cursor-pointer transition-colors"
                    title={mostrarSenha ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {mostrarSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Remember checkbox */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={lembrarMe}
                    disabled={submitting || sucesso}
                    onChange={(e) => setLembrarMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-blue-500/30 bg-slate-800 cursor-pointer"
                  />
                  <span>Permanecer conectado neste navegador</span>
                </label>
              </div>

              {/* Quick Fill / Demo Credentials Buttons */}
              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                    <span>Acesso Rápido de Demonstração</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={submitting || sucesso || lockoutSeconds > 0}
                    onClick={() => {
                      const domain = (subdomain && subdomain !== 'admin' ? subdomain : 'demo');
                      setEmail(`admin@${domain}.local`);
                      setSenha('123456');
                      setErro(null);
                    }}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-left transition-all cursor-pointer group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      <span>Admin</span>
                    </div>
                    <span className="block text-[10px] text-slate-400 font-mono truncate mt-0.5">
                      admin@{(subdomain && subdomain !== 'admin' ? subdomain : 'demo')}.local
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting || sucesso || lockoutSeconds > 0}
                    onClick={() => {
                      const domain = (subdomain && subdomain !== 'admin' ? subdomain : 'demo');
                      setEmail(`operador@${domain}.local`);
                      setSenha('123456');
                      setErro(null);
                    }}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-left transition-all cursor-pointer group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
                      <Users className="w-3.5 h-3.5 text-sky-400" />
                      <span>Operador</span>
                    </div>
                    <span className="block text-[10px] text-slate-400 font-mono truncate mt-0.5">
                      operador@{(subdomain && subdomain !== 'admin' ? subdomain : 'demo')}.local
                    </span>
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting || sucesso || lockoutSeconds > 0}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:via-indigo-500 hover:to-blue-400 active:scale-[0.99] text-white font-bold text-base tracking-wide shadow-xl shadow-blue-600/35 hover:shadow-blue-500/50 border border-blue-400/40 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {submitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verificando credenciais...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>Entrar no Sistema</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Institutional Security Badge */}
          <div className="text-center space-y-1.5 text-slate-400 text-xs">
            <p className="flex items-center justify-center gap-1.5 font-medium text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Autenticação Segura & Trilha de Auditoria Ativa
            </p>
            <p className="text-[11px] text-slate-500">
              Acesso exclusivo a operadores e administradores cadastrados da campanha.
            </p>
          </div>
        </div>
      </main>

      {/* Institutional Footer */}
      <footer className="w-full text-center py-4 text-[11px] text-slate-600 z-10 border-t border-slate-900">
        SEATI &bull; Sistema Eleitoral AnderTech &bull; Todos os direitos reservados
      </footer>

      {/* Institutional Password Recovery Info Modal */}
      {helpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Recuperação de Acesso
                  </h3>
                  <p className="text-xs text-slate-400">
                    Protocolo de segurança da campanha
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHelpModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed bg-slate-800/60 p-4 rounded-xl border border-slate-700/80">
              <p>
                Por estritas normas de conformidade eleitoral e proteção de dados, senhas não podem ser redefinidas por formulários públicos sem autorização prévia.
              </p>
              <div className="space-y-1.5 text-slate-300">
                <p className="font-semibold text-white">Como proceder:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Entre em contato direto com o <strong>Administrador Geral</strong> da campanha.</li>
                  <li>O Administrador autenticado pode atualizar sua credencial de acesso diretamente no painel interno em <strong>Configurações &gt; Usuários</strong>.</li>
                  <li>Todas as tentativas de acesso e alterações cadastrais são registradas com data e identificador na trilha de auditoria.</li>
                </ul>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setHelpModalOpen(false)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-md shadow-blue-600/30"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
