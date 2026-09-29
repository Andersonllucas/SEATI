'use client';

import React, { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  FileText,
  UserCheck,
  Users,
  UserPlus,
  Lock,
  Flag,
  Search,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Trash2,
  Edit2,
  Sparkles,
  Sliders,
  User,
  MapPin,
  Compass,
  Headphones
} from 'lucide-react';
import { useAuth, AppUser, UserRole, UserStatus, LogTipo } from '@/context/AuthContext';
import { ESTADOS_BRASIL, CIDADES_DISPONIVEIS } from '@/lib/locaisCatalog';
import { HeaderButtonsManager } from '@/components/HeaderButtonsManager';

function ConfiguracoesContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const getTabFromParam = (param: string | null): 'usuarios' | 'seguranca' | 'logs' | 'parametros' => {
    if (!param) return 'usuarios';
    const clean = param.toLowerCase().trim();
    if (clean === 'auditoria' || clean === 'logs') return 'logs';
    if (clean === 'seguranca' || clean === 'senha' || clean === 'exclusoes') return 'seguranca';
    if (clean === 'parametros' || clean === 'campanha') return 'parametros';
    if (clean === 'usuarios' || clean === 'operadores') return 'usuarios';
    return 'usuarios';
  };

  const {
    currentUser,
    usuarios,
    logs,
    systemConfig,
    isAdmin,
    cadastrarUsuario,
    atualizarUsuario,
    excluirUsuario,
    atualizarSenhaMestre,
    atualizarConfiguracoes,
    solicitarSenhaMestre,
    isLoading
  } = useAuth();

  // Tabs: 'usuarios' | 'seguranca' | 'logs' | 'parametros'
  const [localTab, setLocalTab] = useState<'usuarios' | 'seguranca' | 'logs' | 'parametros'>('usuarios');
  const activeTab = useMemo(() => {
    if (tabParam) {
      return getTabFromParam(tabParam);
    }
    return localTab;
  }, [tabParam, localTab]);

  const handleTabChange = (tab: 'usuarios' | 'seguranca' | 'logs' | 'parametros') => {
    setLocalTab(tab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/configuracoes?tab=${tab}`);
    }
  };

  // State para Modal de Usuário (Criação / Edição)
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    perfil: 'Operador' as UserRole,
    telefone: '',
    status: 'Ativo' as UserStatus
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);

  // State para Senha Mestre
  const [novaSenhaMestre, setNovaSenhaMestre] = useState('');
  const [confirmaSenhaMestre, setConfirmaSenhaMestre] = useState('');
  const [mostrarSenhaMestreAtual, setMostrarSenhaMestreAtual] = useState(false);
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false);
  const [feedbackSenhaMestre, setFeedbackSenhaMestre] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State para Logs
  const [filtroTipoLog, setFiltroTipoLog] = useState<'TODOS' | LogTipo>('TODOS');
  const [buscaLog, setBuscaLog] = useState('');

  // State para Busca de Usuários
  const [buscaUsuario, setBuscaUsuario] = useState('');

  // State para Parâmetros da Campanha
  const [metaVotos, setMetaVotos] = useState(systemConfig.metaVotos || 6000);
  const [validacaoCpf, setValidacaoCpf] = useState(systemConfig.validacaoCpfObrigatoria ?? true);
  const [bloqueioDuplicados, setBloqueioDuplicados] = useState(systemConfig.bloqueioTituloDuplicado ?? true);
  const [municipioPadrao, setMunicipioPadrao] = useState(systemConfig.municipioPadrao || 'Teresina');
  const [ufPadrao, setUfPadrao] = useState(systemConfig.ufPadrao || 'PI');
  const [contatoSuporte, setContatoSuporte] = useState(systemConfig.contatoSuporte || '(86) 99999-0000');
  const [feedbackParametros, setFeedbackParametros] = useState<string | null>(null);

  // Sync state when systemConfig loads asynchronously without triggering cascading effects
  const [prevConfig, setPrevConfig] = useState(systemConfig);
  if (systemConfig !== prevConfig) {
    setPrevConfig(systemConfig);
    if (systemConfig.municipioPadrao && systemConfig.municipioPadrao !== municipioPadrao) {
      setMunicipioPadrao(systemConfig.municipioPadrao);
    }
    if (systemConfig.ufPadrao && systemConfig.ufPadrao !== ufPadrao) {
      setUfPadrao(systemConfig.ufPadrao);
    }
    if (systemConfig.metaVotos && systemConfig.metaVotos !== metaVotos) {
      setMetaVotos(systemConfig.metaVotos);
    }
    if (systemConfig.validacaoCpfObrigatoria !== undefined && systemConfig.validacaoCpfObrigatoria !== validacaoCpf) {
      setValidacaoCpf(systemConfig.validacaoCpfObrigatoria);
    }
    if (systemConfig.bloqueioTituloDuplicado !== undefined && systemConfig.bloqueioTituloDuplicado !== bloqueioDuplicados) {
      setBloqueioDuplicados(systemConfig.bloqueioTituloDuplicado);
    }
    if (systemConfig.contatoSuporte && systemConfig.contatoSuporte !== contatoSuporte) {
      setContatoSuporte(systemConfig.contatoSuporte);
    }
  }

  // Tecla ESC para fechar janelas/modais abertos
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (userModalOpen) {
          setUserModalOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [userModalOpen]);

  // Usuários filtrados
  const usuariosFiltrados = useMemo(() => {
    if (!buscaUsuario.trim()) return usuarios;
    const term = buscaUsuario.toLowerCase();
    return usuarios.filter(
      (u) =>
        u.nome.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.perfil.toLowerCase().includes(term) ||
        (u.telefone && u.telefone.includes(term))
    );
  }, [usuarios, buscaUsuario]);

  // Logs filtrados
  const logsFiltrados = useMemo(() => {
    return logs.filter((log) => {
      const matchTipo = filtroTipoLog === 'TODOS' || log.tipo === filtroTipoLog;
      if (!matchTipo) return false;
      if (!buscaLog.trim()) return true;

      const term = buscaLog.toLowerCase();
      return (
        log.acao.toLowerCase().includes(term) ||
        log.usuarioNome.toLowerCase().includes(term) ||
        log.usuarioEmail.toLowerCase().includes(term) ||
        log.usuarioPerfil.toLowerCase().includes(term) ||
        (log.detalhes && log.detalhes.toLowerCase().includes(term))
      );
    });
  }, [logs, filtroTipoLog, buscaLog]);

  // Formatador de Data/Hora
  const formatarData = (ts: any) => {
    if (!ts) return 'Nunca';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(d);
    } catch {
      return 'Data indisponível';
    }
  };

  // Abertura do modal de novo usuário
  const handleOpenNewUser = () => {
    setEditingUser(null);
    setFormData({
      nome: '',
      email: '',
      senha: '',
      perfil: 'Operador',
      telefone: '',
      status: 'Ativo'
    });
    setFormError(null);
    setUserModalOpen(true);
  };

  // Abertura do modal de edição de usuário
  const handleOpenEditUser = (user: AppUser) => {
    setEditingUser(user);
    setFormData({
      nome: user.nome,
      email: user.email,
      senha: user.senha || '',
      perfil: user.perfil,
      telefone: user.telefone || '',
      status: user.status
    });
    setFormError(null);
    setUserModalOpen(true);
  };

  // Submissão do modal de usuário
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.nome.trim()) {
      setFormError('Informe o nome completo do usuário.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setFormError('Informe um e-mail válido.');
      return;
    }
    if (!editingUser && (!formData.senha || formData.senha.length < 4)) {
      setFormError('A senha inicial deve conter pelo menos 4 caracteres.');
      return;
    }

    const emailNormalizado = formData.email.trim().toLowerCase();
    
    // Bloqueia cadastro de e-mail duplicado
    const emailJaExiste = usuarios.some(
      (u) => u.email.trim().toLowerCase() === emailNormalizado && u.id !== editingUser?.id
    );
    if (emailJaExiste) {
      setFormError(`Já existe um usuário cadastrado com o e-mail "${emailNormalizado}".`);
      return;
    }

    try {
      setIsSavingUser(true);
      if (editingUser) {
        await atualizarUsuario(editingUser.id, {
          nome: formData.nome.trim(),
          email: emailNormalizado,
          perfil: formData.perfil,
          telefone: formData.telefone.trim(),
          status: formData.status,
          ...(formData.senha.trim() ? { senha: formData.senha.trim() } : {})
        });
      } else {
        await cadastrarUsuario({
          nome: formData.nome.trim(),
          email: emailNormalizado,
          senha: formData.senha.trim(),
          perfil: formData.perfil,
          telefone: formData.telefone.trim(),
          status: formData.status
        });
      }
      setUserModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Erro ao salvar usuário.');
    } finally {
      setIsSavingUser(false);
    }
  };

  // Exclusão de usuário (requer Senha Mestre)
  const handleDeleteUser = (user: AppUser) => {
    if (user.id === currentUser?.id) {
      alert('Você não pode excluir o seu próprio usuário enquanto estiver conectado.');
      return;
    }

    solicitarSenhaMestre({
      title: 'Excluir Usuário',
      description: `Tem certeza que deseja remover o usuário "${user.nome}" (${user.email})? Esta ação exige autorização com a Senha Mestre.`,
      onSuccess: async () => {
        try {
          await excluirUsuario(user.id);
        } catch {
          // Fallback via API administrativa REST
          await fetch('/api/auth/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_user', userId: user.id })
          });
        }
      }
    });
  };

  // Limpeza de usuários duplicados com base no e-mail
  const handleCleanDuplicates = () => {
    solicitarSenhaMestre({
      title: 'Remover Usuários Duplicados',
      description: 'O sistema irá analisar a lista de usuários e remover permanentemente cadastros repetidos com o mesmo e-mail, mantendo a conta principal intacta.',
      onSuccess: async () => {
        try {
          setIsCleaningDuplicates(true);
          const res = await fetch('/api/auth/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'clean_duplicates' })
          });
          const data = await res.json();
          if (data.success) {
            alert(data.message || 'Limpeza de duplicados concluída com sucesso!');
          } else {
            alert(data.error || 'Não foi possível completar a limpeza de duplicados.');
          }
        } catch (err: any) {
          alert('Erro ao conectar ao servidor de limpeza: ' + (err?.message || ''));
        } finally {
          setIsCleaningDuplicates(false);
        }
      }
    });
  };

  // Atualizar Senha Mestre
  const handleUpdateSenhaMestre = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackSenhaMestre(null);

    if (!novaSenhaMestre || novaSenhaMestre.trim().length < 4) {
      setFeedbackSenhaMestre({ type: 'error', text: 'A nova senha mestre deve ter pelo menos 4 dígitos/caracteres.' });
      return;
    }
    if (novaSenhaMestre !== confirmaSenhaMestre) {
      setFeedbackSenhaMestre({ type: 'error', text: 'A confirmação não coincide com a nova senha mestre.' });
      return;
    }

    try {
      await atualizarSenhaMestre(novaSenhaMestre.trim());
      setFeedbackSenhaMestre({ type: 'success', text: 'Senha Mestre atualizada com sucesso!' });
      setNovaSenhaMestre('');
      setConfirmaSenhaMestre('');
    } catch (err: any) {
      setFeedbackSenhaMestre({ type: 'error', text: err?.message || 'Erro ao atualizar senha mestre.' });
    }
  };

  // Salvar Parâmetros da Campanha
  const handleSaveParametros = async () => {
    setFeedbackParametros(null);
    try {
      await atualizarConfiguracoes({
        metaVotos: Number(metaVotos) || 6000,
        validacaoCpfObrigatoria: validacaoCpf,
        bloqueioTituloDuplicado: bloqueioDuplicados,
        municipioPadrao: municipioPadrao.trim() || 'Teresina',
        ufPadrao: ufPadrao.trim().toUpperCase() || 'PI',
        contatoSuporte: contatoSuporte.trim() || '(86) 99999-0000'
      });
      setFeedbackParametros('Parâmetros da campanha salvos com sucesso!');
      setTimeout(() => setFeedbackParametros(null), 3000);
    } catch {
      setFeedbackParametros('Erro ao salvar parâmetros.');
    }
  };

  // 1. GUARDA: Tela Exclusiva para Administrador
  if (!isLoading && !isAdmin) {
    return (
      <div className="p-6 md:p-10 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[75vh]">
        <div className="bg-surface-container-lowest border border-error/30 rounded-2xl p-8 md:p-10 shadow-xl text-center max-w-lg w-full">
          <div className="w-16 h-16 bg-error-container/40 text-error rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
            <ShieldAlert className="w-9 h-9" />
          </div>

          <span className="text-[11px] font-extrabold uppercase tracking-widest text-error px-2.5 py-1 bg-error-container/30 rounded-full inline-block mb-2">
            Acesso Restrito
          </span>
          <h1 className="text-2xl font-bold text-primary tracking-tight">
            Área Exclusiva para Administradores
          </h1>

          <p className="text-sm text-on-surface-variant mt-2.5 leading-relaxed">
            As configurações centrais, cadastro de usuários, gestão da senha mestre e logs de auditoria
            são restritas a contas com perfil de <strong>Administrador</strong>.
          </p>

          <div className="my-6 p-4 bg-surface-container-low border border-outline-variant/60 rounded-xl text-left">
            <p className="text-xs text-on-surface-variant font-medium">Usuário Conectado Atualmente:</p>
            <div className="flex items-center justify-between mt-1">
              <div>
                <p className="text-sm font-bold text-on-surface">{currentUser?.nome || 'Operador Conectado'}</p>
                <p className="text-xs text-on-surface-variant">{currentUser?.email}</p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg">
                {currentUser?.perfil || 'Operador'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-on-surface-variant text-center">
              Para acessar esta área com privilégios de Administrador, solicite permissão ou faça login com a conta de administrador correspondente.
            </p>

            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-sm rounded-xl transition-colors cursor-pointer"
            >
              Voltar ao Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="border-b border-outline-variant/60 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-secondary bg-secondary/10 px-2 py-0.5 rounded">
              Painel Administrativo Exclusivo
            </span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-amber-600" /> Acesso Administrador
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary tracking-tight mt-1">
            Configurações & Auditoria
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Gestão completa de usuários, senhas de segurança, auditoria em tempo real e regras de validação.
          </p>
        </div>

        {/* Indicador do Admin Ativo */}
        <div className="bg-surface-container-low border border-outline-variant/50 p-2.5 rounded-xl flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary text-on-primary flex items-center justify-center font-bold text-sm shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
              Conectado como
            </span>
            <p className="text-xs font-bold text-on-surface">{currentUser?.nome}</p>
          </div>
        </div>
      </div>

      {/* Barra de Abas de Navegação */}
      <div className="flex gap-2 sm:gap-4 border-b border-outline-variant overflow-x-auto custom-scrollbar pb-1">
        <button
          onClick={() => handleTabChange('usuarios')}
          className={`pb-3 px-3 text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all border-b-2 cursor-pointer ${
            activeTab === 'usuarios'
              ? 'text-primary border-primary'
              : 'text-on-surface-variant hover:text-on-surface border-transparent'
          }`}
        >
          <Users className="w-4 h-4" />
          Gestão de Usuários
          <span className="text-[11px] bg-primary/10 text-primary px-1.5 py-0.2 rounded-full font-extrabold ml-1">
            {usuarios.length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('seguranca')}
          className={`pb-3 px-3 text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all border-b-2 cursor-pointer ${
            activeTab === 'seguranca'
              ? 'text-primary border-primary'
              : 'text-on-surface-variant hover:text-on-surface border-transparent'
          }`}
        >
          <KeyRound className="w-4 h-4 text-amber-600" />
          Senha Mestre & Exclusões
        </button>

        <button
          onClick={() => handleTabChange('logs')}
          className={`pb-3 px-3 text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all border-b-2 cursor-pointer ${
            activeTab === 'logs'
              ? 'text-primary border-primary'
              : 'text-on-surface-variant hover:text-on-surface border-transparent'
          }`}
        >
          <FileText className="w-4 h-4 text-blue-600" />
          Logs de Auditoria
          <span className="text-[11px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full font-extrabold ml-1">
            {logs.length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('parametros')}
          className={`pb-3 px-3 text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all border-b-2 cursor-pointer ${
            activeTab === 'parametros'
              ? 'text-primary border-primary'
              : 'text-on-surface-variant hover:text-on-surface border-transparent'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Configurações Gerais & Parâmetros
        </button>
      </div>

      {/* CONTEÚDO DAS ABAS */}

      {/* ABA 1: GESTÃO & CADASTRO DE USUÁRIOS */}
      {activeTab === 'usuarios' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Top banner com ações e contadores */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-outline" />
                <input
                  type="text"
                  value={buscaUsuario}
                  onChange={(e) => setBuscaUsuario(e.target.value)}
                  placeholder="Filtrar por nome, email ou perfil..."
                  className="w-full h-9 pl-9 pr-3 bg-surface border border-outline-variant rounded-lg text-xs outline-none focus:border-primary"
                />
              </div>
              <div className="text-xs text-on-surface-variant hidden md:block">
                Mostrando <strong>{usuariosFiltrados.length}</strong> de <strong>{usuarios.length}</strong> usuários
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCleanDuplicates}
                disabled={isCleaningDuplicates}
                title="Detectar e remover usuários cadastrados com e-mails repetidos"
                className="px-3 py-2 bg-surface-container border border-outline-variant hover:bg-error-container/30 hover:border-error text-on-surface text-xs font-medium rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>{isCleaningDuplicates ? 'Limpando...' : 'Limpar Duplicados'}</span>
              </button>

              <button
                onClick={handleOpenNewUser}
                className="px-4 py-2 bg-primary hover:bg-secondary text-on-primary text-xs font-bold rounded-lg shadow-sm flex items-center gap-2 cursor-pointer transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Cadastrar Novo Usuário
              </button>
            </div>
          </div>

          {/* Tabela de Usuários */}
          <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/60 text-on-surface-variant font-bold uppercase tracking-wider">
                    <th className="p-3.5 pl-4">Usuário</th>
                    <th className="p-3.5">Perfil de Acesso</th>
                    <th className="p-3.5">Telefone</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Último Acesso</th>
                    <th className="p-3.5 text-right pr-4">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/40">
                  {usuariosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-on-surface-variant">
                        Nenhum usuário encontrado com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    usuariosFiltrados.map((u) => {
                      const isMe = u.id === currentUser?.id;
                      return (
                        <tr key={u.id} className="hover:bg-surface-container-low/30 transition-colors">
                          <td className="p-3.5 pl-4">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                                  u.perfil === 'Administrador'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : 'bg-blue-100 text-blue-900 border border-blue-300'
                                }`}
                              >
                                {u.perfil === 'Administrador' ? (
                                  <ShieldCheck className="w-4 h-4 text-amber-700" />
                                ) : (
                                  <User className="w-4 h-4 text-blue-700" />
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-on-surface flex items-center gap-1.5">
                                  <span>{u.nome}</span>
                                  {isMe && (
                                    <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.2 rounded font-extrabold uppercase">
                                      Você
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-on-surface-variant">{u.email}</span>
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                u.perfil === 'Administrador'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-300'
                                  : 'bg-blue-50 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {u.perfil === 'Administrador' ? (
                                <ShieldCheck className="w-3 h-3 text-amber-600" />
                              ) : (
                                <User className="w-3 h-3 text-blue-600" />
                              )}
                              {u.perfil}
                            </span>
                          </td>

                          <td className="p-3.5 text-on-surface-variant font-medium">
                            {u.telefone || '—'}
                          </td>

                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                u.status === 'Ativo'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  u.status === 'Ativo' ? 'bg-emerald-600' : 'bg-zinc-400'
                                }`}
                              />
                              {u.status}
                            </span>
                          </td>

                          <td className="p-3.5 text-on-surface-variant text-[11px]">
                            {formatarData(u.ultimoAcesso)}
                          </td>

                          <td className="p-3.5 text-right pr-4">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenEditUser(u)}
                                title="Editar Usuário"
                                className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              {!isMe && (
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  title="Excluir Usuário (Exige Senha Mestre)"
                                  className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/30 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: SENHA MESTRE & SEGURANÇA */}
      {activeTab === 'seguranca' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
          <div className="lg:col-span-2 space-y-6">
            {/* Card Principal de Senha Mestre */}
            <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 border-b border-outline-variant/40 pb-4 mb-5">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                  <KeyRound className="w-6 h-6 text-amber-700" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-primary">Senha Mestre de Exclusões</h2>
                  <p className="text-xs text-on-surface-variant">
                    Configuração da chave mestra obrigatória para autorizar qualquer exclusão na base.
                  </p>
                </div>
              </div>

              {/* Status da Senha Mestre Atual */}
              <div className="mb-6 p-4 bg-surface-container-low border border-outline-variant/50 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    Senha Mestre Cadastrada
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-mono font-bold text-primary">
                      {mostrarSenhaMestreAtual
                        ? (systemConfig.senhaMestre?.startsWith('pbkdf2:')
                            ? 'Criptografada com Salt (Hash PBKDF2 Protegido)'
                            : systemConfig.senhaMestre)
                        : '••••••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMostrarSenhaMestreAtual(!mostrarSenhaMestreAtual)}
                      className="text-on-surface-variant hover:text-on-surface p-1 rounded transition-colors cursor-pointer"
                      title={mostrarSenhaMestreAtual ? 'Ocultar' : 'Visualizar'}
                    >
                      {mostrarSenhaMestreAtual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Criptografia com Salt Ativa
                </span>
              </div>

              {/* Formulário de Alteração */}
              <form onSubmit={handleUpdateSenhaMestre} className="space-y-4">
                <h3 className="text-sm font-bold text-on-surface">Redefinir Senha Mestre:</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                      Nova Senha Mestre:
                    </label>
                    <div className="relative">
                      <input
                        type={mostrarNovaSenha ? 'text' : 'password'}
                        value={novaSenhaMestre}
                        onChange={(e) => setNovaSenhaMestre(e.target.value)}
                        placeholder="Mínimo 4 caracteres..."
                        className="w-full h-10 px-3 pr-10 bg-surface border border-outline-variant rounded-lg text-sm font-semibold outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarNovaSenha(!mostrarNovaSenha)}
                        className="absolute right-3 top-2.5 text-on-surface-variant hover:text-on-surface"
                      >
                        {mostrarNovaSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                      Confirmar Nova Senha Mestre:
                    </label>
                    <input
                      type={mostrarNovaSenha ? 'text' : 'password'}
                      value={confirmaSenhaMestre}
                      onChange={(e) => setConfirmaSenhaMestre(e.target.value)}
                      placeholder="Repita a nova senha..."
                      className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg text-sm font-semibold outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {feedbackSenhaMestre && (
                  <div
                    className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                      feedbackSenhaMestre.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-error-container/30 text-error border border-error/30'
                    }`}
                  >
                    {feedbackSenhaMestre.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-error" />
                    )}
                    {feedbackSenhaMestre.text}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-primary hover:bg-secondary text-on-primary text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    Salvar Nova Senha Mestre
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Card Lateral Explicativo */}
          <div className="space-y-4">
            <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Como funciona a Senha Mestre?
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                A Senha Mestre é uma camada inviolável contra exclusões acidentais ou não autorizadas por operadores.
              </p>

              <div className="mt-4 space-y-2.5">
                <div className="p-2.5 bg-surface-container-low rounded-lg text-xs text-on-surface flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error shrink-0"></span>
                  <span>Exclusão individual de Eleitores</span>
                </div>
                <div className="p-2.5 bg-surface-container-low rounded-lg text-xs text-on-surface flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error shrink-0"></span>
                  <span>Exclusão em Massa de Eleitores</span>
                </div>
                <div className="p-2.5 bg-surface-container-low rounded-lg text-xs text-on-surface flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error shrink-0"></span>
                  <span>Exclusão de Lideranças & Sub-lideranças</span>
                </div>
                <div className="p-2.5 bg-surface-container-low rounded-lg text-xs text-on-surface flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error shrink-0"></span>
                  <span>Exclusão de Locais de Votação</span>
                </div>
                <div className="p-2.5 bg-surface-container-low rounded-lg text-xs text-on-surface flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error shrink-0"></span>
                  <span>Exclusão de Usuários do Sistema</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: LOGS DE AUDITORIA */}
      {activeTab === 'logs' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Barra de Filtros dos Logs */}
          <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Seletor de Tipo */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <button
                onClick={() => setFiltroTipoLog('TODOS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filtroTipoLog === 'TODOS'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                Todos ({logs.length})
              </button>

              <button
                onClick={() => setFiltroTipoLog('ACESSO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  filtroTipoLog === 'ACESSO'
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Acessos ({logs.filter((l) => l.tipo === 'ACESSO').length})
              </button>

              <button
                onClick={() => setFiltroTipoLog('EXCLUSAO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  filtroTipoLog === 'EXCLUSAO'
                    ? 'bg-error text-on-error shadow-sm'
                    : 'bg-error-container/40 text-error hover:bg-error-container/60'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Exclusões ({logs.filter((l) => l.tipo === 'EXCLUSAO').length})
              </button>

              <button
                onClick={() => setFiltroTipoLog('ALTERACAO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  filtroTipoLog === 'ALTERACAO'
                    ? 'bg-amber-700 text-white shadow-sm'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <Edit2 className="w-3.5 h-3.5" />
                Alterações ({logs.filter((l) => l.tipo === 'ALTERACAO').length})
              </button>
            </div>

            {/* Busca textual */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-outline" />
              <input
                type="text"
                value={buscaLog}
                onChange={(e) => setBuscaLog(e.target.value)}
                placeholder="Buscar por usuário ou ação..."
                className="w-full h-9 pl-9 pr-3 bg-surface border border-outline-variant rounded-lg text-xs outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Feed de Logs */}
          <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl overflow-hidden shadow-sm">
            <div className="p-3.5 bg-surface-container-low border-b border-outline-variant/60 flex items-center justify-between text-xs text-on-surface-variant font-bold">
              <span>Registros de Auditoria ({logsFiltrados.length})</span>
              <span className="text-[11px] font-normal">Atualizado em tempo real via Firestore</span>
            </div>

            <div className="divide-y divide-outline-variant/40 max-h-[600px] overflow-y-auto custom-scrollbar">
              {logsFiltrados.length === 0 ? (
                <div className="p-10 text-center text-on-surface-variant">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-outline" />
                  <p className="text-sm font-semibold">Nenhum registro de log encontrado.</p>
                  <p className="text-xs mt-1">
                    Eventos de acesso, alterações cadastrais e exclusões aparecerão aqui conforme as ações forem realizadas.
                  </p>
                </div>
              ) : (
                logsFiltrados.map((item) => {
                  return (
                    <div key={item.id} className="p-4 hover:bg-surface-container-low/30 transition-colors flex items-start gap-3.5">
                      {/* Ícone conforme tipo */}
                      <div
                        className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                          item.tipo === 'EXCLUSAO'
                            ? 'bg-error-container/40 text-error'
                            : item.tipo === 'ACESSO'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {item.tipo === 'EXCLUSAO' ? (
                          <Trash2 className="w-4 h-4" />
                        ) : item.tipo === 'ACESSO' ? (
                          <UserCheck className="w-4 h-4" />
                        ) : (
                          <Edit2 className="w-4 h-4" />
                        )}
                      </div>

                      {/* Conteúdo do Log */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                item.tipo === 'EXCLUSAO'
                                  ? 'bg-error text-on-error'
                                  : item.tipo === 'ACESSO'
                                  ? 'bg-blue-700 text-white'
                                  : 'bg-amber-700 text-white'
                              }`}
                            >
                              {item.tipo}
                            </span>
                            <span className="text-xs font-bold text-on-surface">
                              {item.usuarioNome}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                item.usuarioPerfil === 'Administrador'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-blue-50 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {item.usuarioPerfil}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatarData(item.data)}</span>
                          </div>
                        </div>

                        <p className="text-xs font-semibold text-on-surface mt-1.5 leading-snug">
                          {item.acao}
                        </p>

                        {item.detalhes && (
                          <p className="text-[11px] text-on-surface-variant mt-1 bg-surface-container-low p-2 rounded-lg font-mono border border-outline-variant/30 leading-relaxed">
                            {item.detalhes}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: CONFIGURAÇÕES GERAIS & PARÂMETROS */}
      {activeTab === 'parametros' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Gerenciador de Botões Rápidos do Cabeçalho (Exclusivo Administrador) */}
          <HeaderButtonsManager />

          {/* Regras e Metas da Campanha */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-outline-variant/40 pb-4">
              <div className="p-2 bg-surface-container-low rounded text-secondary">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-primary">Regras de Validação</h2>
            </div>

            <div className="space-y-4">
              <div
                onClick={() => setValidacaoCpf(!validacaoCpf)}
                className="flex items-start justify-between p-3.5 bg-surface-container-low/40 border border-outline-variant/50 rounded-lg cursor-pointer hover:border-primary transition-all"
              >
                <div className="pr-4">
                  <h3 className="text-sm font-semibold text-on-surface">Validação de CPF Obrigatória</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Impede o cadastro caso os dígitos verificadores do CPF sejam inválidos.
                  </p>
                </div>
                <div
                  className={`w-11 h-6 rounded-full relative shrink-0 transition-colors ${
                    validacaoCpf ? 'bg-primary' : 'bg-outline-variant'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      validacaoCpf ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </div>

              <div
                onClick={() => setBloqueioDuplicados(!bloqueioDuplicados)}
                className="flex items-start justify-between p-3.5 bg-surface-container-low/40 border border-outline-variant/50 rounded-lg cursor-pointer hover:border-primary transition-all"
              >
                <div className="pr-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-on-surface">Bloqueio de Título/CPF Duplicado</h3>
                    <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-extrabold uppercase">
                      Rigor
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Alerta ou impede múltiplos cadastros com o mesmo CPF na base de dados.
                  </p>
                </div>
                <div
                  className={`w-11 h-6 rounded-full relative shrink-0 transition-colors ${
                    bloqueioDuplicados ? 'bg-primary' : 'bg-outline-variant'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      bloqueioDuplicados ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3 border-b border-outline-variant/40 pb-4">
              <div className="p-2 bg-surface-container-low rounded text-secondary">
                <Flag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-primary">Metas & Parâmetros Territoriais</h2>
                <p className="text-xs text-on-surface-variant">
                  Defina o Estado e Município de atuação do sistema eleitoral e a meta de votos da campanha.
                </p>
              </div>
            </div>

            {/* Configuração de Estado e Município */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-surface-container-low/60 rounded-xl border border-outline-variant/60">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-secondary" />
                  Estado (UF) da Campanha *
                </label>
                <select
                  value={ufPadrao}
                  onChange={(e) => setUfPadrao(e.target.value)}
                  className="w-full h-10 border border-outline-variant rounded-lg px-3 text-sm focus:border-primary outline-none font-semibold bg-surface"
                >
                  {ESTADOS_BRASIL.map((est) => (
                    <option key={est.uf} value={est.uf}>
                      {est.uf} - {est.nome}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-on-surface-variant mt-1 block">
                  Define o Tribunal Regional Eleitoral (TRE-{ufPadrao}) padrão para busca de colégios.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-secondary" />
                  Município / Cidade Sede *
                </label>
                <input
                  type="text"
                  value={municipioPadrao}
                  onChange={(e) => setMunicipioPadrao(e.target.value)}
                  placeholder="Ex: Teresina, Parnaíba, Fortaleza, São Paulo..."
                  className="w-full h-10 border border-outline-variant rounded-lg px-3 text-sm focus:border-primary outline-none font-bold bg-surface"
                />
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] text-on-surface-variant">Cidades com pacote do TSE:</span>
                  {CIDADES_DISPONIVEIS.map((c) => (
                    <button
                      key={c.cidade + c.uf}
                      type="button"
                      onClick={() => {
                        setMunicipioPadrao(c.cidade);
                        setUfPadrao(c.uf);
                      }}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors cursor-pointer ${
                        municipioPadrao.toLowerCase() === c.cidade.toLowerCase() && ufPadrao === c.uf
                          ? 'bg-secondary text-white font-bold'
                          : 'bg-surface-container border text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      {c.cidade}-{c.uf}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-on-surface mb-1">
                Meta Global de Votos Cadastrados
              </label>
              <input
                type="number"
                value={metaVotos}
                onChange={(e) => setMetaVotos(Number(e.target.value))}
                className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-primary outline-none font-bold bg-surface"
              />
              <span className="text-xs text-on-surface-variant mt-1 block">
                Utilizada para cálculo das porcentagens de atingimento nos painéis e gráficos do dashboard.
              </span>
            </div>

            {/* Configuração de Contato do Suporte Técnico */}
            <div className="p-4 bg-surface-container-low/60 rounded-xl border border-outline-variant/60 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                <Headphones className="w-3.5 h-3.5 text-secondary" />
                Contato do Suporte Técnico *
              </label>
              <input
                type="text"
                value={contatoSuporte}
                onChange={(e) => setContatoSuporte(e.target.value)}
                placeholder="Ex: (86) 99999-0000, suporte@campanha.com ou link https://..."
                className="w-full h-10 border border-outline-variant rounded-lg px-3 text-sm focus:border-primary outline-none font-semibold bg-surface"
              />
              <span className="text-[11px] text-on-surface-variant block">
                Define o número de WhatsApp, telefone, e-mail ou link que é acionado quando qualquer usuário clica no botão &quot;Suporte Técnico&quot; na barra lateral.
              </span>
            </div>

            {feedbackParametros && (
              <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {feedbackParametros}
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <button
                onClick={handleSaveParametros}
                className="px-6 py-2.5 bg-primary hover:bg-secondary text-on-primary rounded-lg font-semibold shadow-sm transition-colors text-xs cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO DE USUÁRIO */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 bg-surface-container-low border-b border-outline-variant/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary text-on-primary rounded-lg">
                  {editingUser ? <Edit2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                </div>
                <h3 className="text-sm font-bold text-primary">
                  {editingUser ? 'Editar Usuário do Sistema' : 'Cadastrar Novo Usuário'}
                </h3>
              </div>
              <button
                onClick={() => setUserModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Carlos Eduardo de Oliveira"
                  className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    E-mail / Usuário de Acesso *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="usuario@campanha.com"
                    className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg text-sm outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    placeholder="(11) 98765-4321"
                    className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Perfil de Usuário: Administrador vs Operador */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
                  Perfil de Acesso *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, perfil: 'Administrador' })}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      formData.perfil === 'Administrador'
                        ? 'border-amber-500 bg-amber-50/70 shadow-sm ring-1 ring-amber-500'
                        : 'border-outline-variant hover:border-on-surface-variant/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-700" /> Administrador
                      </span>
                      {formData.perfil === 'Administrador' && (
                        <CheckCircle2 className="w-4 h-4 text-amber-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-tight">
                      Acesso total, gestão de usuários, senha mestre e logs de auditoria.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, perfil: 'Operador' })}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      formData.perfil === 'Operador'
                        ? 'border-blue-500 bg-blue-50/70 shadow-sm ring-1 ring-blue-500'
                        : 'border-outline-variant hover:border-on-surface-variant/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-blue-700" /> Operador
                      </span>
                      {formData.perfil === 'Operador' && (
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-tight">
                      Cadastros operacionais. Acesso bloqueado às configurações centrais.
                    </p>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    Senha {editingUser ? '(Opcional se não for mudar)' : '*'}
                  </label>
                  <input
                    type="password"
                    value={formData.senha}
                    onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                    placeholder={editingUser ? 'Manter senha atual...' : 'Senha de acesso'}
                    className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg text-sm outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    Status da Conta *
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as UserStatus })}
                    className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg text-sm outline-none focus:border-primary font-medium"
                  >
                    <option value="Ativo">Ativo (Pode acessar)</option>
                    <option value="Inativo">Inativo (Bloqueado)</option>
                  </select>
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-error-container/30 text-error border border-error/30 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  {formError}
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-outline-variant/40">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-5 py-2 text-xs font-bold bg-primary hover:bg-secondary text-on-primary rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSavingUser ? 'Salvando...' : editingUser ? 'Atualizar Usuário' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConfiguracoesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 max-w-6xl mx-auto flex items-center justify-center min-h-[50vh]">
          <div className="flex flex-col items-center gap-3 text-on-surface-variant">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold">Carregando painel de configurações...</p>
          </div>
        </div>
      }
    >
      <ConfiguracoesContent />
    </Suspense>
  );
}
