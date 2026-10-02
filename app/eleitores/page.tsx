'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  UserPlus,
  Edit,
  X,
  Save,
  AlertTriangle,
  Search,
  ShieldCheck,
  Users,
  CheckCircle2,
  Sparkles,
  ShieldAlert,
  Fingerprint,
  Trash2,
  Check,
  RotateCcw,
  Zap,
  ChevronLeft,
  ChevronRight,
  Download,
  MessageSquare,
  Phone,
  Copy,
  FileText,
  FileSpreadsheet,
  Share2,
  UserCheck
} from 'lucide-react';
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { getActiveDb } from '@/lib/firebase';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { useCampaignData, Eleitor, formatTituloUtil } from '@/context/CampaignContext';
import { exportVotersReal } from '@/lib/importExportUtils';
import { ESTADOS_BRASIL } from '@/lib/locaisCatalog';
import { VoterRow } from '@/components/VoterRow';
import { BairroSelector } from '@/components/BairroSelector';
import { ShareFieldLinkModal } from '@/components/ShareFieldLinkModal';

const STATUS_OPTIONS = [
  {
    id: 'Pendente',
    title: 'Pendente',
    desc: 'Novo cadastro aguardando checagem da coordenação',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300'
  },
  {
    id: 'Auditado',
    title: 'Auditado',
    desc: 'Registro oficial consolidado após auditoria de duplicidade',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-300'
  },
  {
    id: 'Confirmado',
    title: 'Confirmado',
    desc: 'Eleitor contactado que assegurou voto na chapa',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300'
  },
  {
    id: 'Negado',
    title: 'Negado',
    desc: 'Eleitor contactado que recusou apoio ou voto',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300'
  },
  {
    id: 'Voto Certo',
    title: 'Voto Certo',
    desc: 'Alta fidelidade e total engajamento comunitário',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300'
  },
  {
    id: 'Apoiador',
    title: 'Apoiador Ativo',
    desc: 'Multiplicador de votos e participante de ações',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300'
  },
  {
    id: 'Validado',
    title: 'Validado',
    desc: 'Dados cadastrais e domiciliares auditados',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-300'
  }
] as const;

function getStatusBadgeColor(status?: string): string {
  const st = (status || '').toLowerCase().trim();
  if (st.includes('auditad')) return 'bg-orange-100 text-orange-800 border-orange-300';
  if (st.includes('negado') || st.includes('recusa')) return 'bg-rose-100 text-rose-800 border-rose-300';
  if (st.includes('confirmado')) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (st.includes('voto certo')) return 'bg-blue-100 text-blue-800 border-blue-300';
  if (st.includes('apoiador')) return 'bg-purple-100 text-purple-800 border-purple-300';
  if (st.includes('validado')) return 'bg-teal-100 text-teal-800 border-teal-300';
  if (st.includes('pendente')) return 'bg-amber-100 text-amber-800 border-amber-300';
  return 'bg-amber-100 text-amber-800 border-amber-300';
}

export default function Eleitores() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [filterOnlyConflicts, setFilterOnlyConflicts] = useState(false);
  const [isSeedingConflict, setIsSeedingConflict] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Global campaign context with instant in-memory cache
  const {
    eleitores,
    liderancas,
    locais,
    isLoaded,
    cpfConflictGroups,
    tituloConflictGroups,
    conflictingCpfVoterIds,
    conflictingTituloVoterIds,
    conflictingVoterIds,
    totalConflitos,
    cleanCpf,
    cleanTitulo,
    deleteEleitorQuick,
    updateEleitorQuick,
    batchDeleteEleitores,
    batchUpdateEleitores
  } = useCampaignData();
  const { solicitarSenhaMestre, registrarLog } = useAuth();
  const { currentTenant } = useTenant();
  const loading = !isLoaded;

  // Estado de aviso permanente no topo da página de eleitores
  const [topBannerFeedback, setTopBannerFeedback] = useState<{
    type: 'success' | 'warn' | 'error';
    title: string;
    message: string;
  } | null>(null);

  // Erro interno no formulário lateral (não fecha e não some sozinho)
  const [drawerFormError, setDrawerFormError] = useState<{
    title: string;
    message: string;
  } | null>(null);

  // Diálogo de confirmação para duplicidades (evita fechar a tela de surpresa)
  const [duplicateConfirmModal, setDuplicateConfirmModal] = useState<{
    cpfConflict?: Eleitor | null;
    tituloConflict?: Eleitor | null;
    payload: Partial<Eleitor>;
    isEdit: boolean;
    targetId?: string;
  } | null>(null);

  // Auto dismiss para o banner do topo da tela (12 segundos)
  useEffect(() => {
    if (topBannerFeedback) {
      const timer = setTimeout(() => setTopBannerFeedback(null), 12000);
      return () => clearTimeout(timer);
    }
  }, [topBannerFeedback]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Batch action modals & menus
  const [isBatchLeaderModalOpen, setIsBatchLeaderModalOpen] = useState(false);
  const [isBatchStatusModalOpen, setIsBatchStatusModalOpen] = useState(false);
  const [isBatchWhatsappModalOpen, setIsBatchWhatsappModalOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [targetBatchLeaderId, setTargetBatchLeaderId] = useState('');
  const [targetBatchStatus, setTargetBatchStatus] = useState('Confirmado');
  const [copiedPhonesFeedback, setCopiedPhonesFeedback] = useState<string | null>(null);

  // Pagination state for ultra-fluid rendering
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // In-app actions & confirmation state (replaces browser confirm/alert for iframe safety)
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [auditActiveTab, setAuditActiveTab] = useState<'cpf' | 'titulo'>('cpf');

  const handleOpenConflictModal = (targetTab: 'cpf' | 'titulo' = 'cpf') => {
    setAuditActiveTab(targetTab);
    setIsConflictModalOpen(true);
  };
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    variant: 'danger' | 'primary';
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Auto dismiss feedback banner
  useEffect(() => {
    if (actionFeedback) {
      const timer = setTimeout(() => setActionFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionFeedback]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLiderancaFilter, setSelectedLiderancaFilter] = useState('todas');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [isShareFieldModalOpen, setIsShareFieldModalOpen] = useState(false);

  // Form State
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [tituloEleitor, setTituloEleitor] = useState('');
  const [telefone, setTelefone] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [zona, setZona] = useState('');
  const [secao, setSecao] = useState('');
  const [formStatus, setFormStatus] = useState<string>('Pendente');
  const [selectedLiderId, setSelectedLiderId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lista única de bairros já cadastrados no sistema (eleitores, lideranças e locais)
  const registeredBairros = useMemo(() => {
    const map = new Map<string, string>();
    const addBairro = (val?: string) => {
      const trimmed = (val || '').trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, trimmed);
      }
    };
    eleitores.forEach((e) => addBairro(e.bairro));
    liderancas.forEach((l) => addBairro(l.bairro));
    (locais || []).forEach((loc) => addBairro(loc.bairro));
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [eleitores, liderancas, locais]);

  const liderancasPrincipais = useMemo(
    () => liderancas.filter((l) => l.tipo === 'Liderança Principal'),
    [liderancas]
  );
  const subLiderancas = useMemo(
    () => liderancas.filter((l) => l.tipo === 'Sub-liderança'),
    [liderancas]
  );
  const ativasLiderancasCount = useMemo(
    () => liderancas.filter((l) => l.status === 'Ativa').length,
    [liderancas]
  );
  const totalEleitoresEmConflito = conflictingVoterIds.size;

  // Live conflict warnings during voter registration
  const liveCpfConflict = useMemo(() => {
    const clean = cleanCpf(cpf);
    if (clean.length < 11) return null;
    return eleitores.find((e) => cleanCpf(e.cpf) === clean && e.id !== editingId) || null;
  }, [cpf, eleitores, editingId, cleanCpf]);

  const liveTituloConflict = useMemo(() => {
    const clean = cleanTitulo(tituloEleitor);
    if (!clean || clean.length < 5) return null;
    return eleitores.find((e) => cleanTitulo(e.tituloEleitor) === clean && e.id !== editingId) || null;
  }, [tituloEleitor, eleitores, editingId, cleanTitulo]);

  const formatCPF = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  };

  // Tecla ESC para fechar janelas/modais abertos
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (duplicateConfirmModal) setDuplicateConfirmModal(null);
        else if (isDrawerOpen) setIsDrawerOpen(false);
        else if (confirmDialog) setConfirmDialog(null);
        else if (isConflictModalOpen) setIsConflictModalOpen(false);
        else if (isBatchLeaderModalOpen) setIsBatchLeaderModalOpen(false);
        else if (isBatchStatusModalOpen) setIsBatchStatusModalOpen(false);
        else if (isBatchWhatsappModalOpen) setIsBatchWhatsappModalOpen(false);
        else if (isExportMenuOpen) setIsExportMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    duplicateConfirmModal,
    isDrawerOpen,
    confirmDialog,
    isConflictModalOpen,
    isBatchLeaderModalOpen,
    isBatchStatusModalOpen,
    isBatchWhatsappModalOpen,
    isExportMenuOpen
  ]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setDrawerFormError(null);
    setDuplicateConfirmModal(null);
    setNome('');
    setCpf('');
    setTituloEleitor('');
    setTelefone('');
    setBairro('');
    setCidade(currentTenant?.cidade || '');
    setEstado(currentTenant?.uf || 'SP');
    setZona('');
    setSecao('');
    setFormStatus('Pendente');
    setSelectedLiderId(liderancas.length > 0 ? liderancas[0].id : '');
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (eleitor: Eleitor) => {
    setEditingId(eleitor.id);
    setDrawerFormError(null);
    setDuplicateConfirmModal(null);
    setNome(eleitor.nome || '');
    setCpf(eleitor.cpf ? formatCPF(eleitor.cpf) : '');
    setTituloEleitor(formatTituloUtil(eleitor.tituloEleitor || ''));
    setTelefone(eleitor.telefone || '');
    setBairro(eleitor.bairro || '');
    setCidade(eleitor.cidade || currentTenant?.cidade || '');
    setEstado(eleitor.estado || currentTenant?.uf || 'SP');
    setZona(eleitor.zona || '');
    setSecao(eleitor.secao || '');
    setFormStatus(eleitor.status || 'Pendente');
    const foundLider = liderancas.find(
      (l) => l.id === eleitor.liderancaId || l.nome === eleitor.lideranca
    );
    setSelectedLiderId(foundLider ? foundLider.id : '');
    setIsDrawerOpen(true);
  };

  // Gravação definitiva no banco (acionada diretamente ou após confirmação de duplicidade)
  const executeSaveVoter = async (
    payload: Partial<Eleitor>,
    isEdit: boolean,
    targetId?: string,
    isDuplicate = false,
    duplicateInfo?: string
  ) => {
    setIsSubmitting(true);
    setDrawerFormError(null);

    try {
      if (isEdit && targetId) {
        await updateDoc(doc(getActiveDb(), 'eleitores', targetId), payload);
        await registrarLog({
          tipo: 'ALTERACAO',
          acao: `Alteração cadastral do eleitor: ${payload.nome}`,
          detalhes: `CPF: ${payload.cpf} | Título: ${payload.tituloEleitor || '-'} | Status: ${payload.status} | Liderança: ${payload.lideranca || '-'} | Zona: ${payload.zona} | Seção: ${payload.secao}${isDuplicate ? ` [DUPLICIDADE: ${duplicateInfo}]` : ''}`,
          entidade: 'Eleitor',
          entidadeId: targetId
        });
      } else {
        const docRef = await addDoc(collection(getActiveDb(), 'eleitores'), {
          ...payload,
          dataCadastro: serverTimestamp()
        });
        await registrarLog({
          tipo: 'ALTERACAO',
          acao: `Novo eleitor cadastrado: ${payload.nome}`,
          detalhes: `CPF: ${payload.cpf} | Título: ${payload.tituloEleitor || '-'} | Status: ${payload.status} | Liderança: ${payload.lideranca || '-'} | Zona: ${payload.zona} | Seção: ${payload.secao}${isDuplicate ? ` [DUPLICIDADE: ${duplicateInfo}]` : ''}`,
          entidade: 'Eleitor',
          entidadeId: docRef.id
        });
      }

      // Fecha a gaveta e o modal de duplicidade com segurança
      setIsDrawerOpen(false);
      setDuplicateConfirmModal(null);

      // Exibe banner de confirmação permanente no topo da página de eleitores
      if (isDuplicate) {
        setTopBannerFeedback({
          type: 'warn',
          title: 'Eleitor Salvo com Alerta de Duplicidade',
          message: `O eleitor "${payload.nome}" foi cadastrado no banco, mas consta em duplicidade (${duplicateInfo}). O caso está registrado na Auditoria de Conflitos.`
        });
      } else {
        setTopBannerFeedback({
          type: 'success',
          title: 'Eleitor Cadastrado com Sucesso',
          message: `"${payload.nome}" foi gravado com sucesso na base oficial da campanha!`
        });
      }
    } catch (error: any) {
      console.error('Error saving voter:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      setDrawerFormError({
        title: 'Falha ao Salvar no Banco de Dados',
        message: `Não foi possível concluir a gravação: ${errMsg}. Os dados digitados não foram perdidos.`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveVoter = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawerFormError(null);

    const trimmedNome = nome.trim();
    const cleanCpfDigits = cleanCpf(cpf);
    const trimmedTitulo = tituloEleitor.trim();
    const cleanTituloDigits = cleanTitulo(tituloEleitor);
    const trimmedZona = zona.trim();
    const trimmedSecao = secao.trim();

    // 1. Validações claras e fixas no formulário (sem sumir)
    if (!trimmedNome || trimmedNome.length < 3) {
      setDrawerFormError({
        title: 'Nome Completo Obrigatório',
        message: 'Por favor, informe o Nome Completo do eleitor (mínimo de 3 letras).'
      });
      return;
    }

    // CPF não é mais obrigatório: se digitado, deve ter 11 dígitos
    if (cleanCpfDigits && cleanCpfDigits.length !== 11) {
      setDrawerFormError({
        title: 'CPF Incompleto (Exige 11 Dígitos)',
        message: `O CPF informado possui ${cleanCpfDigits.length} dígitos. Caso deseje informar o CPF, digite os 11 números ou deixe em branco.`
      });
      return;
    }

    if (!trimmedTitulo) {
      setDrawerFormError({
        title: 'Número do Título Obrigatório',
        message: 'Por favor, informe o Número do Título de Eleitor oficial.'
      });
      return;
    }

    if (!trimmedZona || !trimmedSecao) {
      setDrawerFormError({
        title: 'Zona e Seção Obrigatórias',
        message: 'Preencha a Zona e a Seção Eleitoral do eleitor para a apuração.'
      });
      return;
    }

    const selectedLider = liderancas.find((l) => l.id === selectedLiderId);
    const liderancaNome = selectedLider ? selectedLider.nome : 'Sem Liderança Definida';
    const formattedTitulo = formatTituloUtil(trimmedTitulo);

    const payload: Partial<Eleitor> = {
      nome: trimmedNome,
      cpf: cleanCpfDigits ? formatCPF(cleanCpfDigits) : '',
      tituloEleitor: formattedTitulo,
      telefone: telefone.trim(),
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      estado: estado.trim(),
      zona: trimmedZona,
      secao: trimmedSecao,
      lideranca: liderancaNome,
      liderancaId: selectedLiderId || '',
      status: formStatus || 'Pendente'
    };

    // 2. Verificação de conflito em tempo real (CPF ou Título de Eleitor)
    const existingCpfMatch = cleanCpfDigits.length === 11
      ? eleitores.find((v) => cleanCpf(v.cpf) === cleanCpfDigits && v.id !== editingId)
      : null;

    const existingTituloMatch = cleanTituloDigits.length >= 5
      ? eleitores.find(
          (v) => cleanTitulo(v.tituloEleitor) === cleanTituloDigits && v.id !== editingId
        )
      : null;

    // SE HOUVER DUPLICIDADE (CPF OU TÍTULO): NÃO FECHA A GAVETA! Abre o diálogo de decisão explícito
    if (existingCpfMatch || existingTituloMatch) {
      setDuplicateConfirmModal({
        cpfConflict: existingCpfMatch || null,
        tituloConflict: existingTituloMatch || null,
        payload,
        isEdit: !!editingId,
        targetId: editingId || undefined
      });
      return;
    }

    // Se não há duplicidades, salva diretamente
    await executeSaveVoter(payload, !!editingId, editingId || undefined, false);
  };

  // Delete single voter action
  const executeDeleteVoter = async (id: string, nomeEleitor?: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteDoc(doc(getActiveDb(), 'eleitores', id));
      setActionFeedback(`Cadastro de "${nomeEleitor || 'Eleitor'}" removido com sucesso.`);
      setConfirmDialog(null);
    } catch (error) {
      console.error('Error deleting voter:', error);
      setActionError('Falha ao remover o registro. Verifique a conexão com o banco.');
    } finally {
      setActionLoading(false);
    }
  };

  const triggerDeleteVoter = (id: string, nomeEleitor?: string) => {
    solicitarSenhaMestre({
      title: 'Excluir Cadastro de Eleitor',
      description: `Para remover o cadastro de "${nomeEleitor || 'este eleitor'}", informe a Senha Mestre do sistema.`,
      onSuccess: async () => {
        await executeDeleteVoter(id, nomeEleitor);
        await registrarLog({
          tipo: 'EXCLUSAO',
          acao: `Exclusão do eleitor: ${nomeEleitor || id}`,
          detalhes: `Registro removido da base de dados com confirmação de Senha Mestre. ID: ${id}`,
          entidade: 'Eleitor',
          entidadeId: id
        });
      }
    });
  };

  // Conflict Resolution: Keep one voter, delete duplicate(s)
  const executeKeepVoter = async (keepVoter: Eleitor, otherVoterIds: string[]) => {
    setActionLoading(true);
    setActionError(null);
    try {
      // 1. Delete all conflicting duplicate voter records
      for (const id of otherVoterIds) {
        if (deleteEleitorQuick) {
          await deleteEleitorQuick(id);
        } else {
          await deleteDoc(doc(getActiveDb(), 'eleitores', id));
        }
      }
      // 2. Mark the kept voter as audited with orange status
      if (updateEleitorQuick) {
        await updateEleitorQuick(keepVoter.id, {
          status: 'Auditado'
        });
      } else {
        await updateDoc(doc(getActiveDb(), 'eleitores', keepVoter.id), {
          status: 'Auditado'
        });
      }
      setActionFeedback(
        `Cadastro de "${keepVoter.nome}" mantido como oficial e marcado como "Auditado"! ${otherVoterIds.length} duplicidade(s) removida(s).`
      );
      setConfirmDialog(null);
    } catch (err) {
      console.error('Erro ao resolver conflito:', err);
      setActionError('Falha ao consolidar registros no banco de dados. Tente novamente.');
    } finally {
      setActionLoading(false);
    }
  };

  const triggerKeepVoter = (keepVoter: Eleitor, otherVoterIds: string[]) => {
    setConfirmDialog({
      title: 'Consolidar e Manter Eleitor',
      description: `Deseja consolidar o cadastro de "${keepVoter.nome}" (vinculado a ${keepVoter.lideranca}) como o registro oficial e excluir as outras ${otherVoterIds.length} ocorrência(s) conflitante(s)? O status do eleitor mantido será alterado para "Auditado" (laranja).`,
      confirmLabel: 'Confirmar e Manter',
      variant: 'primary',
      onConfirm: () => executeKeepVoter(keepVoter, otherVoterIds)
    });
  };

  // Simulate demo conflict for testing
  const handleSeedConflictDemo = async () => {
    try {
      setIsSeedingConflict(true);
      setActionError(null);
      const demoCpf = '389.142.908-11';
      const leader1 = liderancas[0]?.nome || 'Carlos Silveira';
      const leader1Id = liderancas[0]?.id || '';
      const leader2 = liderancas[1]?.nome || 'Dra. Elena Vasconcelos';
      const leader2Id = liderancas[1]?.id || '';

      await addDoc(collection(getActiveDb(), 'eleitores'), {
        nome: 'Ricardo Antunes Pereira',
        cpf: demoCpf,
        telefone: '(11) 98765-4321',
        bairro: 'Centro',
        zona: '001',
        secao: '012',
        lideranca: leader1,
        liderancaId: leader1Id,
        status: 'Validado',
        dataCadastro: serverTimestamp()
      });

      await addDoc(collection(getActiveDb(), 'eleitores'), {
        nome: 'Ricardo A. Pereira (Duplicado)',
        cpf: demoCpf,
        telefone: '(11) 98765-4321',
        bairro: 'Centro',
        zona: '001',
        secao: '012',
        lideranca: leader2,
        liderancaId: leader2Id,
        status: 'Validado',
        dataCadastro: serverTimestamp()
      });

      setActionFeedback('2 registros de teste com o mesmo CPF foram adicionados para auditoria.');
    } catch (err) {
      console.error('Erro ao simular conflito:', err);
      setActionError('Erro ao criar registros de teste no banco de dados.');
    } finally {
      setIsSeedingConflict(false);
    }
  };

  // Filter voters based on search, leadership, status, and conflict filter
  const filteredEleitores = useMemo(() => {
    return eleitores.filter((eleitor) => {
      if (filterOnlyConflicts && !conflictingVoterIds.has(eleitor.id)) {
        return false;
      }

      const matchesSearch =
        (eleitor.nome?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (eleitor.cpf || '').includes(searchTerm) ||
        (eleitor.lideranca?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (eleitor.bairro?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (eleitor.zona || '').includes(searchTerm);

      const matchesLideranca =
        selectedLiderancaFilter === 'todas'
          ? true
          : eleitor.liderancaId === selectedLiderancaFilter ||
            eleitor.lideranca === selectedLiderancaFilter;

      const matchesStatus =
        statusFilter === 'todos'
          ? true
          : statusFilter === 'conflito'
          ? conflictingVoterIds.has(eleitor.id)
          : statusFilter === 'Pendente'
          ? (eleitor.status === 'Pendente de confirmação' || eleitor.status === 'Pendente' || !eleitor.status)
          : statusFilter === 'Auditado'
          ? (eleitor.status === 'Auditado' || eleitor.status === 'Auditado e Validado')
          : (eleitor.status || 'Pendente') === statusFilter;

      return matchesSearch && matchesLideranca && matchesStatus;
    });
  }, [
    eleitores,
    searchTerm,
    selectedLiderancaFilter,
    statusFilter,
    filterOnlyConflicts,
    conflictingVoterIds
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredEleitores.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedEleitores = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredEleitores.slice(start, start + pageSize);
  }, [filteredEleitores, safeCurrentPage, pageSize]);

  // Selection helpers & computed states
  const isAllCurrentPageSelected = useMemo(() => {
    if (paginatedEleitores.length === 0) return false;
    return paginatedEleitores.every((e) => selectedIds.has(e.id));
  }, [paginatedEleitores, selectedIds]);

  const isSomeCurrentPageSelected = useMemo(() => {
    if (isAllCurrentPageSelected) return false;
    return paginatedEleitores.some((e) => selectedIds.has(e.id));
  }, [paginatedEleitores, selectedIds, isAllCurrentPageSelected]);

  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAllCurrentPage = () => {
    if (isAllCurrentPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedEleitores.forEach((e) => next.delete(e.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedEleitores.forEach((e) => next.add(e.id));
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredEleitores.map((e) => e.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Batch actions
  const handleTriggerBatchDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    solicitarSenhaMestre({
      title: `Exclusão em Massa de ${count} Eleitor${count > 1 ? 'es' : ''}`,
      description: `Você está excluindo ${count} registros permanentemente. Esta ação exige autorização com a Senha Mestre.`,
      onSuccess: async () => {
        setActionLoading(true);
        setActionError(null);
        try {
          await batchDeleteEleitores(Array.from(selectedIds));
          await registrarLog({
            tipo: 'EXCLUSAO',
            acao: `Exclusão em massa de ${count} eleitor${count > 1 ? 'es' : ''}`,
            detalhes: `${count} registros removidos da base com confirmação de Senha Mestre.`,
            entidade: 'Eleitor'
          });
          setActionFeedback(`${count} eleitor${count > 1 ? 'es foram excluídos' : ' foi excluído'} com sucesso.`);
          clearSelection();
        } catch (err) {
          console.error('Erro ao excluir eleitores em lote:', err);
          setActionError('Falha ao excluir eleitores selecionados.');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  const handleExecuteBatchLeader = async () => {
    if (selectedIds.size === 0 || !targetBatchLeaderId) return;
    const targetLeader = liderancas.find((l) => l.id === targetBatchLeaderId);
    if (!targetLeader) return;

    setActionLoading(true);
    setActionError(null);
    try {
      const count = selectedIds.size;
      await batchUpdateEleitores(Array.from(selectedIds), {
        lideranca: targetLeader.nome,
        liderancaId: targetLeader.id
      });
      setActionFeedback(`${count} eleitor${count > 1 ? 'es foram vinculados' : ' foi vinculado'} à liderança "${targetLeader.nome}".`);
      setIsBatchLeaderModalOpen(false);
      clearSelection();
    } catch (err) {
      console.error('Erro ao vincular liderança em lote:', err);
      setActionError('Falha ao transferir liderança dos eleitores selecionados.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteBatchStatus = async () => {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const count = selectedIds.size;
      await batchUpdateEleitores(Array.from(selectedIds), {
        status: targetBatchStatus
      });
      setActionFeedback(`Status de ${count} eleitor${count > 1 ? 'es foi alterado' : ' foi alterado'} para "${targetBatchStatus}".`);
      setIsBatchStatusModalOpen(false);
      clearSelection();
    } catch (err) {
      console.error('Erro ao atualizar status em lote:', err);
      setActionError('Falha ao atualizar o status dos eleitores selecionados.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportSelected = (format: 'xlsx' | 'csv' | 'pdf') => {
    if (selectedIds.size === 0) return;
    const selectedVoters = eleitores.filter((e) => selectedIds.has(e.id));
    exportVotersReal(selectedVoters, conflictingVoterIds, format);
    setActionFeedback(`Exportação de ${selectedVoters.length} eleitor${selectedVoters.length > 1 ? 'es' : ''} gerada com sucesso (${format.toUpperCase()})!`);
    setIsExportMenuOpen(false);
  };

  const selectedVotersData = useMemo(() => {
    return eleitores.filter((e) => selectedIds.has(e.id));
  }, [eleitores, selectedIds]);

  const selectedPhonesList = useMemo(() => {
    return selectedVotersData
      .map((e) => ({
        nome: e.nome,
        telefone: e.telefone,
        clean: e.telefone ? e.telefone.replace(/\D/g, '') : ''
      }))
      .filter((p) => p.clean.length >= 10);
  }, [selectedVotersData]);

  const handleCopyPhonesOnly = () => {
    const numbers = selectedPhonesList.map((p) => p.clean).join(', ');
    navigator.clipboard.writeText(numbers);
    setCopiedPhonesFeedback('Telefones copiados para a área de transferência!');
    setTimeout(() => setCopiedPhonesFeedback(null), 3000);
  };

  const handleCopyFormattedList = () => {
    const text = selectedPhonesList.map((p) => `${p.nome}: ${p.telefone}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedPhonesFeedback('Lista com nomes e telefones copiada!');
    setTimeout(() => setCopiedPhonesFeedback(null), 3000);
  };

  return (
    <div className="p-3 md:p-4 space-y-3 max-w-[1600px] mx-auto flex-1 h-full flex flex-col relative">
      {/* Top Banner & Header - Compacto e Elegante */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="text-lg md:text-xl text-on-surface font-bold tracking-tight whitespace-nowrap">
            Base de Eleitores
          </h1>
          <span className="text-xs text-on-surface-variant hidden xl:inline truncate">
            • Cadastre novos eleitores, audite duplicidades e gerencie lideranças
          </span>
        </div>

        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto py-0.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-3 py-1.5 bg-primary text-on-primary hover:bg-secondary rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap shrink-0"
            title="Abrir cadastro de novo eleitor no formulário lateral"
          >
            <UserPlus className="w-3.5 h-3.5 text-primary-fixed" />
            <span>Novo Eleitor</span>
          </button>

          <Link
            href="/validacao"
            className="px-3 py-1.5 border border-secondary/30 bg-secondary/10 hover:bg-secondary/20 text-secondary rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap shrink-0"
            title="Central de Validação de Eleitores (Ligação / Mensagem)"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Validações</span>
          </Link>

          <Link
            href="/cadastro-em-massa"
            className="px-3 py-1.5 border border-outline-variant bg-surface hover:bg-surface-container text-on-surface rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap shrink-0"
            title="Ambiente otimizado para cadastro contínuo de vários eleitores"
          >
            <Zap className="w-3.5 h-3.5 text-secondary" />
            <span>Cadastro em Lote</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsShareFieldModalOpen(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            title="Gerar link público ou QR Code para a equipe de campo"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Link de Campo</span>
          </button>
        </div>
      </div>

      {/* Metrics Cards Compactos (Otimização de Espaço Vertical para Valorizar a Tabela) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 shrink-0">
        {/* Card 1: Total Eleitores */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-outline-variant/60 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Total de Eleitores
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <h3 className="text-lg md:text-xl font-black text-on-surface">{eleitores.length}</h3>
              <span className="text-[11px] text-on-surface-variant">cadastrados no banco</span>
            </div>
          </div>
          <div className="p-2 bg-surface-container rounded-lg text-secondary">
            <Users className="w-4 h-4" />
          </div>
        </div>

        {/* Card 2: Lideranças Ativas */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-outline-variant/60 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Lideranças Ativas
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <h3 className="text-lg md:text-xl font-black text-secondary">{ativasLiderancasCount || 0}</h3>
              <span className="text-[11px] text-on-surface-variant">articuladores</span>
            </div>
          </div>
          <Link
            href="/liderancas"
            prefetch={true}
            className="text-[11px] text-secondary hover:underline font-semibold bg-surface-container hover:bg-surface-container-high px-2.5 py-1 rounded transition-colors"
          >
            Gerenciar
          </Link>
        </div>

        {/* Card 3: Duplicidades Detectadas */}
        <div
          className={`px-3.5 py-2 rounded-xl border transition-all flex items-center justify-between ${
            filterOnlyConflicts
              ? 'ring-2 ring-error border-error bg-error-container/10'
              : totalConflitos > 0
              ? 'border-error/40 bg-surface-container-lowest shadow-xs'
              : 'border-outline-variant/60 bg-surface-container-lowest shadow-xs'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                Duplicidades
              </p>
              {totalConflitos > 0 ? (
                <span className="text-[10px] bg-rose-100 text-rose-800 border border-rose-300 font-bold px-2 py-0.5 rounded-full">
                  {totalConflitos} {totalConflitos === 1 ? 'conflito' : 'conflitos'}
                </span>
              ) : (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold px-2 py-0.5 rounded-full">
                  Zero
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <h3 className={`text-lg md:text-xl font-black ${totalConflitos > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {totalConflitos}
              </h3>
              <span className="text-[11px] text-on-surface-variant truncate max-w-[130px] sm:max-w-none">
                {totalConflitos > 0 ? `${totalEleitoresEmConflito} com mesmo CPF` : 'base íntegra'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {totalConflitos > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenConflictModal(cpfConflictGroups.length === 0 && tituloConflictGroups.length > 0 ? 'titulo' : 'cpf')}
                  className="text-xs bg-rose-100 text-rose-900 hover:bg-rose-200 border border-rose-300 font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  title="Auditar duplicidades de documentos"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-700" /> Auditar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterOnlyConflicts((prev) => !prev);
                    setCurrentPage(1);
                  }}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    filterOnlyConflicts
                      ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold'
                      : 'bg-surface-container hover:bg-surface-container-high border-outline-variant/60 text-on-surface'
                  }`}
                  title="Filtrar eleitores com conflito na tabela abaixo"
                >
                  {filterOnlyConflicts ? 'Ver Todos' : 'Filtrar'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenConflictModal('cpf')}
                className="text-[11px] text-secondary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Fingerprint className="w-3.5 h-3.5" /> Detalhes
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BANNER DE NOTIFICAÇÃO PERSISTENTE (NÃO SOME RÁPIDO) */}
      {topBannerFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold animate-fadeIn shadow-sm ${
            topBannerFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : topBannerFeedback.type === 'warn'
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-start gap-3">
            {topBannerFeedback.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
            {topBannerFeedback.type === 'warn' && <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
            {topBannerFeedback.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
            <div>
              <p className="font-bold text-sm">{topBannerFeedback.title}</p>
              <p className="font-normal mt-0.5 leading-relaxed">{topBannerFeedback.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTopBannerFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-on-surface-variant cursor-pointer shrink-0"
            title="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table Container */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm overflow-hidden flex flex-col flex-1">
        {/* Toolbar - Compacta em Linha Única */}
        <div className="px-3.5 py-2 bg-surface border-b border-outline-variant/50 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs md:text-sm text-on-surface font-bold">Listagem Geral</h2>
            <span className="text-[11px] bg-surface-container text-on-surface px-2 py-0.5 rounded-full font-medium">
              {filteredEleitores.length} de {eleitores.length}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter by Leadership */}
            <select
              value={selectedLiderancaFilter}
              onChange={(e) => {
                setSelectedLiderancaFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary max-w-[170px]"
            >
              <option value="todas">Todas as Lideranças</option>
              {liderancasPrincipais.length > 0 && (
                <optgroup label="Lideranças Principais">
                  {liderancasPrincipais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </optgroup>
              )}
              {subLiderancas.length > 0 && (
                <optgroup label="Sub-lideranças">
                  {subLiderancas.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} (Sub de {l.liderancaPaiNome || 'Coordenação'})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            {/* Filter by Status/Conflict */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary"
            >
              <option value="todos">Todos os Status</option>
              <option value="conflito">⚠️ Apenas com Conflito de CPF</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.title}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Buscar eleitor, CPF, zona..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-40 sm:w-52 h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md pl-8 pr-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
              />
            </div>

            {/* Seletor de registros por página */}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2 text-xs text-on-surface-variant focus:outline-none"
              title="Quantidade de eleitores exibidos por página"
            >
              <option value={15}>15 por pág.</option>
              <option value={25}>25 por pág.</option>
              <option value={50}>50 por pág.</option>
              <option value={100}>100 por pág.</option>
            </select>
          </div>
        </div>

        {/* Conflict Filter Banner if active */}
        {filterOnlyConflicts && (
          <div className="px-4 py-2.5 bg-error-container/40 border-b border-error/30 flex items-center justify-between gap-3 text-xs text-on-surface">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-error shrink-0" />
              <span>
                Filtro ativo: Exibindo apenas os <strong>{filteredEleitores.length}</strong> eleitores com <strong>conflito de CPF</strong>.
              </span>
            </div>
            <button
              onClick={() => {
                setFilterOnlyConflicts(false);
                setCurrentPage(1);
              }}
              className="text-xs font-bold text-error hover:underline flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Limpar Filtro
            </button>
          </div>
        )}

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-2.5 bg-primary/10 border-b border-primary/20 flex flex-wrap items-center justify-between gap-3 text-xs text-on-surface animate-fadeIn">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="flex items-center gap-1.5 font-bold text-xs bg-primary text-on-primary px-2.5 py-1 rounded-full shadow-xs">
                <Check className="w-3.5 h-3.5 stroke-[3]" /> {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
              </span>
              {selectedIds.size < filteredEleitores.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-xs text-secondary hover:underline font-semibold cursor-pointer"
                >
                  Selecionar todos os {filteredEleitores.length} da busca
                </button>
              )}
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-on-surface-variant hover:text-on-surface underline cursor-pointer"
              >
                Desmarcar todos
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Vincular Liderança */}
              <button
                type="button"
                onClick={() => {
                  setTargetBatchLeaderId(liderancas.length > 0 ? liderancas[0].id : '');
                  setIsBatchLeaderModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-md bg-surface-container-lowest border border-outline-variant/60 text-xs font-semibold text-on-surface hover:bg-surface-container flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-secondary" />
                Vincular Liderança
              </button>

              {/* Alterar Status */}
              <button
                type="button"
                onClick={() => setIsBatchStatusModalOpen(true)}
                className="px-3 py-1.5 rounded-md bg-surface-container-lowest border border-outline-variant/60 text-xs font-semibold text-on-surface hover:bg-surface-container flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-secondary" />
                Alterar Status
              </button>

              {/* Exportar Selecionados */}
              <div className="relative inline-block">
                <button
                  type="button"
                  onClick={() => setIsExportMenuOpen((prev) => !prev)}
                  className="px-3 py-1.5 rounded-md bg-surface-container-lowest border border-outline-variant/60 text-xs font-semibold text-on-surface hover:bg-surface-container flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-secondary" />
                  Exportar ({selectedIds.size})
                </button>
                {isExportMenuOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg py-1 z-30">
                    <button
                      type="button"
                      onClick={() => handleExportSelected('pdf')}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2 text-on-surface font-medium cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-error" /> Documento PDF (.pdf)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSelected('xlsx')}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2 text-on-surface font-medium cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSelected('csv')}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2 text-on-surface font-medium cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-secondary" /> CSV (.csv)
                    </button>
                  </div>
                )}
              </div>

              {/* Lista WhatsApp */}
              <button
                type="button"
                onClick={() => setIsBatchWhatsappModalOpen(true)}
                className="px-3 py-1.5 rounded-md bg-surface-container-lowest border border-outline-variant/60 text-xs font-semibold text-on-surface hover:bg-surface-container flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                Lista WhatsApp
              </button>

              {/* Excluir Selecionados */}
              <button
                type="button"
                onClick={handleTriggerBatchDelete}
                className="px-3 py-1.5 rounded-md bg-error text-on-error text-xs font-semibold hover:bg-error/90 flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir ({selectedIds.size})
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/60 text-xs text-on-surface-variant uppercase font-semibold">
                <th className="py-2 px-3 md:py-2 md:px-3.5 w-10">
                  <input
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = isSomeCurrentPageSelected;
                      }
                    }}
                    type="checkbox"
                    checked={isAllCurrentPageSelected}
                    onChange={toggleSelectAllCurrentPage}
                    className="rounded border-outline-variant text-secondary focus:ring-secondary w-4 h-4 cursor-pointer"
                    title={
                      isAllCurrentPageSelected
                        ? 'Desmarcar todos desta página'
                        : 'Selecionar todos desta página'
                    }
                  />
                </th>
                <th className="py-2 px-3 md:py-2 md:px-3.5">Nome do Eleitor</th>
                <th className="py-2 px-3 md:py-2 md:px-3.5">CPF</th>
                <th className="py-2 px-3 md:py-2 md:px-3.5">Título</th>
                <th className="py-2 px-2 md:py-2 md:px-2.5 text-center">Auditoria</th>
                <th className="py-2 px-3 md:py-2 md:px-3.5">Zona / Seção</th>
                <th className="py-2 px-3 md:py-2 md:px-3.5">Liderança / Articulador</th>
                <th className="py-2 px-3 md:py-2 md:px-3.5 text-center">WhatsApp</th>
                <th className="py-2 px-3 md:py-2 md:px-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-on-surface-variant">
                    Carregando dados de eleitores...
                  </td>
                </tr>
              ) : filteredEleitores.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-on-surface-variant">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-outline-variant" />
                      <p className="font-semibold text-on-surface">Nenhum eleitor encontrado</p>
                      <p className="text-xs text-on-surface-variant">
                        Cadastre um novo eleitor vinculado a uma liderança ou altere os filtros de busca.
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          type="button"
                          onClick={handleOpenCreate}
                          className="px-3.5 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-semibold hover:bg-secondary transition-colors cursor-pointer shadow-xs"
                        >
                          + Cadastrar Eleitor
                        </button>
                        <Link
                          href="/cadastro-em-massa"
                          className="px-3 py-1.5 border border-outline-variant bg-surface rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
                        >
                          Ir para Cadastro em Lote
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedEleitores.map((eleitor) => {
                  const linkedLeader = liderancas.find(
                    (l) => l.id === eleitor.liderancaId || l.nome === eleitor.lideranca
                  );
                  const isCpfConflict = conflictingCpfVoterIds.has(eleitor.id);
                  const isTituloConflict = conflictingTituloVoterIds.has(eleitor.id);
                  const group = cpfConflictGroups.find(
                    (g) => g.cpfClean === cleanCpf(eleitor.cpf)
                  );

                  return (
                    <VoterRow
                      key={eleitor.id}
                      eleitor={eleitor}
                      linkedLeader={linkedLeader}
                      isConflict={isCpfConflict}
                      conflictCount={group?.count}
                      isTituloConflict={isTituloConflict}
                      isSelected={selectedIds.has(eleitor.id)}
                      onToggleSelect={() => toggleSelectOne(eleitor.id)}
                      onAuditConflict={(type) => handleOpenConflictModal(type)}
                      onEdit={() => handleOpenEdit(eleitor)}
                      onDelete={() => triggerDeleteVoter(eleitor.id, eleitor.nome)}
                      statusBadgeClass={getStatusBadgeColor(eleitor.status)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredEleitores.length > 0 && (
          <div className="px-3.5 py-2 bg-surface-container-low/40 border-t border-outline-variant/40 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-on-surface-variant shrink-0">
            <div>
              Exibindo <strong>{(currentPage - 1) * pageSize + 1}</strong> a <strong>{Math.min(currentPage * pageSize, filteredEleitores.length)}</strong> de <strong>{filteredEleitores.length}</strong> eleitores
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-2.5 py-1 rounded border border-outline-variant bg-surface-container-lowest text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container flex items-center gap-1 font-semibold transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>
              <span className="px-2 font-mono font-bold text-primary">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-2.5 py-1 rounded border border-outline-variant bg-surface-container-lowest text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container flex items-center gap-1 font-semibold transition-colors"
              >
                Próxima <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Overlay */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      {/* Side Drawer */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-[500px] bg-surface-container-lowest shadow-2xl border-l border-outline-variant z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="px-6 py-5 bg-primary text-on-primary flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-surface-container-lowest/10 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-primary-fixed" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">
                {editingId ? 'Editar Eleitor' : 'Cadastro de Eleitor'}
              </h2>
              <p className="text-xs text-inverse-primary">Campanha Eleitoral {new Date().getFullYear()}</p>
            </div>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="hover:bg-surface-container-lowest/20 p-1.5 rounded transition-colors text-on-primary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="bg-surface-container-low border border-secondary/30 rounded-lg p-4 flex gap-3">
            <ShieldCheck className="w-5 h-5 text-secondary shrink-0" />
            <div>
              <p className="text-sm font-semibold text-on-surface">Validação & Vinculação Territorial</p>
              <p className="text-xs text-on-surface-variant mt-1">
                Ao selecionar a liderança ou sub-liderança, a captação contabiliza automaticamente na meta do articulador.
              </p>
            </div>
          </div>

          <form id="eleitor-form" onSubmit={handleSaveVoter} className="space-y-4">
            {/* AVISO DE ERRO FIXO NO FORMULÁRIO (NUNCA SOME RÁPIDO) */}
            {drawerFormError && (
              <div className="p-3.5 bg-rose-50 border-2 border-rose-300 rounded-xl text-rose-950 text-xs shadow-sm animate-fadeIn space-y-1">
                <div className="flex items-center justify-between font-bold text-rose-900">
                  <div className="flex items-center gap-1.5 text-sm">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{drawerFormError.title}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerFormError(null)}
                    className="p-1 text-rose-700 hover:text-rose-950 rounded cursor-pointer"
                    title="Fechar erro"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="leading-relaxed font-medium">{drawerFormError.message}</p>
              </div>
            )}

            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30 pb-2">
              Identificação Oficial
            </h3>

            <div>
              <label className="block text-xs font-semibold mb-1.5 text-on-surface">
                Nome Completo <span className="text-error">*</span>
              </label>
              <input
                type="text"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Carlos Eduardo Silveira"
                className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none placeholder:text-outline/70 bg-surface text-on-surface"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <label className="block text-xs font-semibold text-on-surface">
                    CPF Oficial <span className="text-[11px] text-on-surface-variant font-normal">(Opcional)</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={cpf}
                  onChange={(e) => setCpf(formatCPF(e.target.value))}
                  placeholder="000.000.000-00 (opcional)"
                  className={`w-full h-10 border rounded-md px-3 text-sm outline-none font-mono placeholder:text-outline/70 bg-surface text-on-surface ${
                    liveCpfConflict
                      ? 'border-error ring-1 ring-error'
                      : 'border-outline-variant focus:border-secondary'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 text-on-surface">
                  Número do Título <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={tituloEleitor}
                  onChange={(e) => setTituloEleitor(formatTituloUtil(e.target.value))}
                  placeholder="0000.0000.0000"
                  className={`w-full h-10 border rounded-md px-3 text-sm outline-none font-mono placeholder:text-outline/70 bg-surface text-on-surface ${
                    liveTituloConflict
                      ? 'border-error ring-1 ring-error'
                      : 'border-outline-variant focus:border-secondary'
                  }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-on-surface">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(11) 98888-7777"
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none font-mono placeholder:text-outline/70 bg-surface text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 text-on-surface">
                  Status do Eleitor
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none bg-surface text-on-surface font-medium"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.title} ({opt.desc})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ALERTA DE CONFLITO EM TEMPO REAL: CPF */}
            {liveCpfConflict && (
              <div className="p-3 bg-error-container/60 border border-error/50 rounded-lg text-xs text-on-error-container space-y-1 animate-fadeIn">
                <div className="flex items-center gap-1.5 font-bold text-error">
                  <AlertTriangle className="w-4 h-4 text-error shrink-0" />
                  <span>Conflito de CPF Detectado no Banco!</span>
                </div>
                <p className="leading-relaxed">
                  Este CPF já está registrado para <strong>{liveCpfConflict.nome}</strong> sob a liderança{' '}
                  <strong>{liveCpfConflict.lideranca || 'Não definida'}</strong> (Zona {liveCpfConflict.zona} / Seção {liveCpfConflict.secao}).
                </p>
                <p className="text-[11px] text-on-surface-variant font-medium">
                  Salvar este formulário registrará duplicidade e acionará a auditoria de colisão.
                </p>
              </div>
            )}

            {/* ALERTA DE CONFLITO EM TEMPO REAL: NÚMERO DO TÍTULO */}
            {liveTituloConflict && (
              <div className="p-3 bg-amber-50 border border-amber-400 rounded-lg text-xs text-amber-950 space-y-1 animate-fadeIn">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Conflito de Título de Eleitor Detectado no Banco!</span>
                </div>
                <p className="leading-relaxed text-amber-900">
                  O Título <strong>{liveTituloConflict.tituloEleitor}</strong> já está cadastrado para <strong>{liveTituloConflict.nome}</strong> sob a liderança{' '}
                  <strong>{liveTituloConflict.lideranca || 'Não definida'}</strong> (Zona {liveTituloConflict.zona} / Seção {liveTituloConflict.secao}).
                </p>
                <p className="text-[11px] text-amber-800 font-medium">
                  Ao salvar, o sistema abrirá a confirmação para você decidir se deseja corrigir a numeração ou salvar duplicado.
                </p>
              </div>
            )}

            {/* Estado e Cidade do Eleitor */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-on-surface">
                  Estado (UF)
                </label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none bg-surface text-on-surface font-medium cursor-pointer"
                >
                  <option value="">Selecione UF...</option>
                  {ESTADOS_BRASIL.map((est) => (
                    <option key={est.uf} value={est.uf}>
                      {est.uf} - {est.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1.5 text-on-surface">
                  Cidade / Município
                </label>
                <input
                  type="text"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  placeholder="Cidade do eleitor..."
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none placeholder:text-outline/70 bg-surface text-on-surface"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-on-surface">
                  Bairro / Localidade
                </label>
                <BairroSelector
                  value={bairro}
                  onChange={setBairro}
                  bairrosList={registeredBairros}
                  placeholder="Selecione ou digite o bairro..."
                  className="bg-surface text-on-surface border-outline-variant focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-on-surface">
                  Zona <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={zona}
                  onChange={(e) => setZona(e.target.value)}
                  placeholder="042"
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none font-mono bg-surface text-on-surface"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-on-surface">
                  Seção <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={secao}
                  onChange={(e) => setSecao(e.target.value)}
                  placeholder="0145"
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none font-mono bg-surface text-on-surface"
                />
              </div>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30 pb-2 mt-6">
              Vínculo Político & Articulação
            </h3>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-on-surface">
                  Liderança ou Sub-liderança Responsável <span className="text-error">*</span>
                </label>
                <Link
                  href="/liderancas"
                  className="text-[11px] text-secondary hover:underline font-semibold flex items-center gap-1"
                >
                  <Users className="w-3 h-3" /> Gerenciar Lideranças
                </Link>
              </div>

              {liderancas.length === 0 ? (
                <div className="p-3 bg-surface-container-low border border-outline-variant rounded-md text-xs text-on-surface-variant">
                  <p className="font-semibold text-on-surface">Nenhuma liderança cadastrada no banco.</p>
                  <p className="mt-1">
                    Cadastre uma liderança em{' '}
                    <Link href="/liderancas" className="text-secondary font-bold underline">
                      Lideranças & Sub
                    </Link>{' '}
                    para associar este eleitor.
                  </p>
                </div>
              ) : (
                <select
                  required
                  value={selectedLiderId}
                  onChange={(e) => setSelectedLiderId(e.target.value)}
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none bg-surface text-on-surface"
                >
                  <option value="">Selecione quem captou este eleitor...</option>
                  {liderancasPrincipais.length > 0 && (
                    <optgroup label="Lideranças Principais (Polos)">
                      {liderancasPrincipais.map((l) => (
                        <option key={l.id} value={l.id}>
                          ⭐ {l.nome} ({l.regiao} - {l.bairro})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {subLiderancas.length > 0 && (
                    <optgroup label="Sub-lideranças">
                      {subLiderancas.map((l) => (
                        <option key={l.id} value={l.id}>
                          ↳ {l.nome} (Sub de {l.liderancaPaiNome || 'Principal'}) - {l.bairro}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </div>
          </form>
        </div>

        <div className="p-4 bg-surface border-t border-outline-variant/60 flex items-center justify-end gap-3 shadow-inner">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(false)}
            className="px-5 py-2 border border-outline-variant rounded-md text-sm font-medium hover:bg-surface-container-low transition-colors text-on-surface"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="eleitor-form"
            disabled={isSubmitting}
            className="px-6 py-2 bg-primary-container text-on-primary rounded-md text-sm font-semibold flex items-center gap-2 hover:bg-secondary transition-colors shadow disabled:opacity-70"
          >
            <Save className="w-4 h-4" /> {isSubmitting ? 'Salvando...' : 'Salvar Eleitor'}
          </button>
        </div>
      </div>

      {/* ==================== MODAL: AUDITORIA & RESOLUÇÃO DE CONFLITOS DE CPF ==================== */}
      {isConflictModalOpen && (
        <div className="fixed inset-0 bg-primary/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-5 bg-surface border-b border-outline-variant/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-error-container/60 border border-error/30 flex items-center justify-center text-error">
                  <Fingerprint className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-on-surface">Auditoria de Conflitos & Duplicidades</h2>
                    <span className="text-xs bg-error text-on-error px-2 py-0.5 rounded-full font-bold">
                      {totalConflitos} {totalConflitos === 1 ? 'conflito' : 'conflitos'}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Motor de detecção de colisão: eleitores registrados com o mesmo CPF ou Título sob lideranças concorrentes
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsConflictModalOpen(false)}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas de Navegação de Conflito: CPF vs Título de Eleitor */}
            <div className="flex border-b border-outline-variant/50 px-6 pt-2 bg-surface-container-low gap-3">
              <button
                type="button"
                onClick={() => setAuditActiveTab('cpf')}
                className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
                  auditActiveTab === 'cpf'
                    ? 'border-error text-error'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Fingerprint className="w-4 h-4" />
                <span>Conflitos de CPF</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  cpfConflictGroups.length > 0 ? 'bg-error text-on-error' : 'bg-surface-container text-on-surface-variant'
                }`}>
                  {cpfConflictGroups.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAuditActiveTab('titulo')}
                className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
                  auditActiveTab === 'titulo'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Conflitos de Título de Eleitor</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  tituloConflictGroups.length > 0 ? 'bg-amber-600 text-white' : 'bg-surface-container text-on-surface-variant'
                }`}>
                  {tituloConflictGroups.length}
                </span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              {/* Action Feedback Banners */}
              {actionFeedback && (
                <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-semibold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{actionFeedback}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActionFeedback(null)}
                    className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {actionError && (
                <div className="p-3 bg-error-container border border-error/40 text-on-error-container rounded-lg text-xs font-semibold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-error shrink-0" />
                    <span>{actionError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActionError(null)}
                    className="text-error hover:underline cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {totalConflitos === 0 ? (
                <div className="text-center py-12 px-4 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-on-surface">Base de Dados 100% Íntegra</h3>
                    <p className="text-sm text-on-surface-variant max-w-md mx-auto mt-1">
                      Nenhum conflito de CPF ou Título de Eleitor detectado. Todos os {eleitores.length} eleitores cadastrados possuem identificadores únicos.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-outline-variant/30 max-w-md mx-auto">
                    <p className="text-xs text-on-surface-variant mb-3">
                      Deseja testar como o motor de auditoria e resolução de duplicidades funciona na prática?
                    </p>
                    <button
                      type="button"
                      onClick={handleSeedConflictDemo}
                      disabled={isSeedingConflict}
                      className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/60 text-secondary text-xs font-bold rounded-lg transition-colors flex items-center gap-2 mx-auto cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      {isSeedingConflict ? 'Criando registros...' : 'Simular 2 Eleitores com Mesmo CPF (Teste)'}
                    </button>
                  </div>
                </div>
              ) : auditActiveTab === 'cpf' ? (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-error-container/30 border border-error/40 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                    <div className="text-xs text-on-surface space-y-1">
                      <p className="font-bold text-error text-sm">
                        Atenção: Foram encontradas {cpfConflictGroups.length} ocorrência(s) de CPF duplicado na base eleitoral.
                      </p>
                      <p className="text-on-surface-variant">
                        Dois ou mais registros compartilham o mesmo número de CPF. Analise abaixo as lideranças envolvidas e decida qual cadastro manter ou excluir para garantir fidelidade de votos.
                      </p>
                    </div>
                  </div>

                  {cpfConflictGroups.length === 0 ? (
                    <div className="text-center py-8 text-on-surface-variant bg-surface-container-low rounded-xl border border-outline-variant/40">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                      <p className="font-bold text-sm">Nenhum conflito de CPF ativo no momento.</p>
                    </div>
                  ) : (
                    cpfConflictGroups.map((group, idx) => (
                      <div
                        key={group.cpfClean}
                        className="border-2 border-error/30 rounded-xl overflow-hidden bg-surface-container-lowest shadow-sm"
                      >
                        {/* Conflict Header */}
                        <div className="p-4 bg-surface-container-low border-b border-error/20 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold bg-error text-on-error px-2 py-0.5 rounded">
                              Caso #{idx + 1}
                            </span>
                            <span className="font-mono text-base font-bold text-on-surface">
                              CPF: {group.formattedCpf}
                            </span>
                            <span className="text-xs text-error font-semibold">
                              ({group.count} cadastros em colisão)
                            </span>
                          </div>

                          <div className="text-xs text-on-surface-variant">
                            Lideranças disputando: <strong className="text-primary">{group.liderancas.join(' vs. ')}</strong>
                          </div>
                        </div>

                        {/* Colliding Voters Cards */}
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {group.voters.map((voter) => {
                            const otherVoterIds = group.voters
                              .filter((v) => v.id !== voter.id)
                              .map((v) => v.id);

                            return (
                              <div
                                key={voter.id}
                                className="border border-outline-variant/60 rounded-xl p-4 bg-surface flex flex-col justify-between hover:border-secondary/60 transition-colors"
                              >
                                <div className="space-y-2">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <h4 className="text-base font-bold text-on-surface">{voter.nome}</h4>
                                      <p className="text-xs text-on-surface-variant">
                                        {voter.bairro ? `${voter.bairro} • ` : ''}
                                        {voter.telefone || 'Sem telefone'}
                                      </p>
                                    </div>
                                    <span className="text-[10px] bg-surface-container text-on-surface-variant px-2 py-0.5 rounded font-mono font-medium">
                                      Zona {voter.zona} / {voter.secao}
                                    </span>
                                  </div>

                                  <div className="p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/40 space-y-1">
                                    <span className="text-[10px] uppercase font-bold text-on-surface-variant block tracking-wider">
                                      Liderança Vinculada
                                    </span>
                                    <p className="text-sm font-bold text-primary flex items-center gap-1.5">
                                      <Users className="w-3.5 h-3.5 text-secondary" />
                                      {voter.lideranca}
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center gap-2">
                                  {otherVoterIds.length > 0 && (
                                    <button
                                      type="button"
                                      disabled={actionLoading}
                                      onClick={() => triggerKeepVoter(voter, otherVoterIds)}
                                      className="flex-1 py-1.5 px-2 bg-primary text-on-primary hover:bg-secondary rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                                    >
                                      <Check className="w-3.5 h-3.5" /> Manter Este
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsConflictModalOpen(false);
                                      handleOpenEdit(voter);
                                    }}
                                    className="py-1.5 px-2.5 border border-outline-variant rounded text-xs font-medium text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                                    title="Editar este eleitor"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => triggerDeleteVoter(voter.id, voter.nome)}
                                    className="py-1.5 px-2.5 bg-error/10 hover:bg-error/20 text-error rounded text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                                    title="Excluir cadastro duplicado"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="text-xs text-on-surface space-y-1">
                      <p className="font-bold text-amber-900 text-sm">
                        Atenção: Foram encontradas {tituloConflictGroups.length} ocorrência(s) de Título de Eleitor duplicado na base.
                      </p>
                      <p className="text-on-surface-variant">
                        Dois ou mais eleitores compartilham o mesmo Número do Título. Você pode manter o registro correto e remover os excedentes para evitar fraudes ou duplicação.
                      </p>
                    </div>
                  </div>

                  {tituloConflictGroups.length === 0 ? (
                    <div className="text-center py-8 text-on-surface-variant bg-surface-container-low rounded-xl border border-outline-variant/40">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                      <p className="font-bold text-sm">Nenhum conflito de Título de Eleitor ativo no momento.</p>
                    </div>
                  ) : (
                    tituloConflictGroups.map((group, idx) => (
                      <div
                        key={group.tituloClean}
                        className="border-2 border-amber-300 rounded-xl overflow-hidden bg-surface-container-lowest shadow-sm"
                      >
                        {/* Conflict Header */}
                        <div className="p-4 bg-amber-50/70 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold bg-amber-600 text-white px-2 py-0.5 rounded">
                              Caso #{idx + 1}
                            </span>
                            <span className="font-mono text-base font-bold text-amber-950">
                              Título: {group.formattedTitulo}
                            </span>
                            <span className="text-xs text-amber-800 font-semibold">
                              ({group.count} cadastros em colisão)
                            </span>
                          </div>

                          <div className="text-xs text-on-surface-variant">
                            Lideranças disputando: <strong className="text-primary">{group.liderancas.join(' vs. ')}</strong>
                          </div>
                        </div>

                        {/* Colliding Voters Cards */}
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {group.voters.map((voter) => {
                            const otherVoterIds = group.voters
                              .filter((v) => v.id !== voter.id)
                              .map((v) => v.id);

                            return (
                              <div
                                key={voter.id}
                                className="border border-outline-variant/60 rounded-xl p-4 bg-surface flex flex-col justify-between hover:border-secondary/60 transition-colors"
                              >
                                <div className="space-y-2">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <h4 className="text-base font-bold text-on-surface">{voter.nome}</h4>
                                      <p className="text-xs text-on-surface-variant">
                                        {voter.bairro ? `${voter.bairro} • ` : ''}
                                        CPF: {voter.cpf || 'Não informado'}
                                      </p>
                                    </div>
                                    <span className="text-[10px] bg-surface-container text-on-surface-variant px-2 py-0.5 rounded font-mono font-medium">
                                      Zona {voter.zona} / {voter.secao}
                                    </span>
                                  </div>

                                  <div className="p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/40 space-y-1">
                                    <span className="text-[10px] uppercase font-bold text-on-surface-variant block tracking-wider">
                                      Liderança Vinculada
                                    </span>
                                    <p className="text-sm font-bold text-primary flex items-center gap-1.5">
                                      <Users className="w-3.5 h-3.5 text-secondary" />
                                      {voter.lideranca}
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center gap-2">
                                  {otherVoterIds.length > 0 && (
                                    <button
                                      type="button"
                                      disabled={actionLoading}
                                      onClick={() => triggerKeepVoter(voter, otherVoterIds)}
                                      className="flex-1 py-1.5 px-2 bg-primary text-on-primary hover:bg-secondary rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                                    >
                                      <Check className="w-3.5 h-3.5" /> Manter Este
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsConflictModalOpen(false);
                                      handleOpenEdit(voter);
                                    }}
                                    className="py-1.5 px-2.5 border border-outline-variant rounded text-xs font-medium text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                                    title="Editar este eleitor"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => triggerDeleteVoter(voter.id, voter.nome)}
                                    className="py-1.5 px-2.5 bg-error/10 hover:bg-error/20 text-error rounded text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                                    title="Excluir cadastro duplicado"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-surface border-t border-outline-variant/60 flex items-center justify-between">
              <span className="text-xs text-on-surface-variant font-medium">
                Auditoria em tempo real conectada ao banco Firestore.
              </span>
              <div className="flex items-center gap-2">
                {totalConflitos > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterOnlyConflicts(true);
                      setCurrentPage(1);
                      setIsConflictModalOpen(false);
                    }}
                    className="px-3 py-1.5 bg-error text-on-error rounded text-xs font-bold hover:bg-error/90 transition-colors cursor-pointer"
                  >
                    Filtrar Conflitos na Lista
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsConflictModalOpen(false)}
                  className="px-4 py-1.5 border border-outline-variant rounded text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: CONFIRMAÇÃO DE AÇÃO (IFRAME SAFE) ==================== */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-primary/70 backdrop-blur-xs z-70 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-fadeIn">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  confirmDialog.variant === 'danger'
                    ? 'bg-error-container text-error'
                    : 'bg-primary-container text-on-primary'
                }`}
              >
                {confirmDialog.variant === 'danger' ? (
                  <Trash2 className="w-5 h-5" />
                ) : (
                  <ShieldCheck className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-on-surface">{confirmDialog.title}</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {confirmDialog.description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/30">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50 ${
                  confirmDialog.variant === 'danger'
                    ? 'bg-error text-on-error hover:bg-error/90'
                    : 'bg-primary text-on-primary hover:bg-secondary'
                }`}
              >
                {actionLoading && <RotateCcw className="w-3.5 h-3.5 animate-spin" />}
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: VINCULAR LIDERANÇA EM MASSA ==================== */}
      {isBatchLeaderModalOpen && (
        <div className="fixed inset-0 bg-primary/70 backdrop-blur-xs z-70 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl max-w-lg w-full p-5 space-y-4 animate-fadeIn">
            <div className="flex items-start justify-between pb-3 border-b border-outline-variant/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary-container text-on-primary rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface">Vincular Liderança em Massa</h3>
                  <p className="text-xs text-on-surface-variant">
                    Associar os <strong>{selectedIds.size}</strong> eleitores selecionados a um articulador
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBatchLeaderModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-on-surface block">
                Selecione a Liderança Destino:
              </label>
              <select
                value={targetBatchLeaderId}
                onChange={(e) => setTargetBatchLeaderId(e.target.value)}
                className="w-full h-10 bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm text-on-surface focus:outline-none focus:border-secondary"
              >
                <option value="" disabled>
                  Escolha um articulador...
                </option>
                <optgroup label="Lideranças Principais">
                  {liderancasPrincipais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} ({l.bairro || 'Geral'}) - Meta: {l.metaVotos || 0} votos
                    </option>
                  ))}
                </optgroup>
                {subLiderancas.length > 0 && (
                  <optgroup label="Sub-lideranças">
                    {subLiderancas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome} (Sub de {l.liderancaPaiNome || 'Geral'})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/30 text-xs text-on-surface-variant leading-relaxed">
                Ao confirmar, todos os <strong>{selectedIds.size}</strong> eleitores marcados terão seu vínculo de campanha transferido diretamente no banco de dados para a liderança selecionada.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/30">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setIsBatchLeaderModalOpen(false)}
                className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={actionLoading || !targetBatchLeaderId}
                onClick={handleExecuteBatchLeader}
                className="px-4 py-2 bg-primary text-on-primary hover:bg-secondary rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {actionLoading && <RotateCcw className="w-3.5 h-3.5 animate-spin" />}
                Vincular {selectedIds.size} Eleitores
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: ALTERAR STATUS EM MASSA ==================== */}
      {isBatchStatusModalOpen && (
        <div className="fixed inset-0 bg-primary/70 backdrop-blur-xs z-70 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-fadeIn">
            <div className="flex items-start justify-between pb-3 border-b border-outline-variant/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary-container text-on-primary rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface">Alterar Status em Massa</h3>
                  <p className="text-xs text-on-surface-variant">
                    Atualizar o status de <strong>{selectedIds.size}</strong> eleitores
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBatchStatusModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {STATUS_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  onClick={() => setTargetBatchStatus(opt.id)}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    targetBatchStatus === opt.id
                      ? 'border-secondary bg-secondary-container/20 ring-1 ring-secondary'
                      : 'border-outline-variant/60 hover:bg-surface-container-low'
                  }`}
                >
                  <input
                    type="radio"
                    name="batchStatus"
                    checked={targetBatchStatus === opt.id}
                    onChange={() => setTargetBatchStatus(opt.id)}
                    className="mt-0.5 text-secondary focus:ring-secondary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-on-surface">{opt.title}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${opt.badgeColor}`}>
                        {opt.id}
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/30">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setIsBatchStatusModalOpen(false)}
                className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleExecuteBatchStatus}
                className="px-4 py-2 bg-primary text-on-primary hover:bg-secondary rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {actionLoading && <RotateCcw className="w-3.5 h-3.5 animate-spin" />}
                Aplicar Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: LISTA WHATSAPP & TRANSMISSÃO ==================== */}
      {isBatchWhatsappModalOpen && (
        <div className="fixed inset-0 bg-primary/70 backdrop-blur-xs z-70 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl max-w-xl w-full p-5 space-y-4 animate-fadeIn">
            <div className="flex items-start justify-between pb-3 border-b border-outline-variant/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-600 text-white rounded-xl">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface">Lista de Transmissão WhatsApp</h3>
                  <p className="text-xs text-on-surface-variant">
                    <strong>{selectedPhonesList.length}</strong> contatos com telefone válido entre <strong>{selectedIds.size}</strong> selecionados
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBatchWhatsappModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {copiedPhonesFeedback && (
              <div className="p-2.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-700" />
                {copiedPhonesFeedback}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyPhonesOnly}
                disabled={selectedPhonesList.length === 0}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Copy className="w-3.5 h-3.5" /> Copiar Telefones (Vírgula)
              </button>
              <button
                type="button"
                onClick={handleCopyFormattedList}
                disabled={selectedPhonesList.length === 0}
                className="px-3 py-2 border border-outline-variant hover:bg-surface-container text-on-surface text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Copy className="w-3.5 h-3.5 text-secondary" /> Copiar Nomes e Telefones
              </button>
            </div>

            <div className="border border-outline-variant/60 rounded-xl overflow-hidden">
              <div className="bg-surface-container-low px-3 py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center justify-between">
                <span>Eleitor</span>
                <span>Telefone</span>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-outline-variant/30 custom-scrollbar text-xs">
                {selectedVotersData.map((v) => {
                  const clean = v.telefone ? v.telefone.replace(/\D/g, '') : '';
                  const hasValidPhone = clean.length >= 10;
                  return (
                    <div key={v.id} className="p-2.5 flex items-center justify-between hover:bg-surface-container-low/50">
                      <div>
                        <p className="font-semibold text-on-surface">{v.nome}</p>
                        <p className="text-[10px] text-on-surface-variant">Líder: {v.lideranca}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono ${hasValidPhone ? 'text-on-surface font-semibold' : 'text-error font-normal italic'}`}>
                          {v.telefone || 'Sem número'}
                        </span>
                        {hasValidPhone && (
                          <a
                            href={`https://wa.me/55${clean}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="Conversar no WhatsApp"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30 text-xs text-on-surface-variant">
              <span>Dica: Cole os números separados por vírgula na criação de lista de transmissão.</span>
              <button
                type="button"
                onClick={() => setIsBatchWhatsappModalOpen(false)}
                className="px-4 py-1.5 border border-outline-variant rounded-lg font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL DE CONFIRMAÇÃO DE DUPLICIDADE (CPF OU TÍTULO) ==================== */}
      {duplicateConfirmModal && (
        <div className="fixed inset-0 bg-primary/75 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface-container-lowest border-2 border-amber-500 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scaleIn">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-amber-100 text-amber-900 rounded-2xl border border-amber-300 shrink-0 mt-0.5">
                <AlertTriangle className="w-6 h-6 text-amber-700" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full inline-block">
                  Duplicidade Detectada no Banco
                </span>
                <h3 className="text-lg font-bold text-on-surface leading-tight">
                  {duplicateConfirmModal.cpfConflict && duplicateConfirmModal.tituloConflict
                    ? 'Atenção: CPF e Título já Cadastrados!'
                    : duplicateConfirmModal.cpfConflict
                    ? 'Atenção: CPF já Cadastrado no Sistema!'
                    : 'Atenção: Título de Eleitor já Cadastrado!'}
                </h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Identificamos registro(s) existente(s) com a mesma numeração na base oficial da campanha.
                </p>
              </div>
            </div>

            {/* Informações detalhadas do conflito */}
            <div className="space-y-2.5 max-h-[40vh] overflow-y-auto custom-scrollbar">
              {duplicateConfirmModal.cpfConflict && (
                <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl space-y-1 text-xs text-rose-950">
                  <div className="flex items-center justify-between font-bold text-rose-900">
                    <span className="flex items-center gap-1.5 font-mono">
                      <Fingerprint className="w-4 h-4 text-rose-600" /> CPF: {duplicateConfirmModal.cpfConflict.cpf}
                    </span>
                    <span className="text-[10px] bg-rose-200 text-rose-900 px-1.5 py-0.5 rounded font-bold">
                      Já Cadastrado
                    </span>
                  </div>
                  <p className="text-rose-900 font-bold text-sm">
                    Pertence a: {duplicateConfirmModal.cpfConflict.nome}
                  </p>
                  <p className="text-[11px] text-rose-800 leading-snug">
                    Liderança: <strong>{duplicateConfirmModal.cpfConflict.lideranca || 'Sem Liderança'}</strong> • Zona {duplicateConfirmModal.cpfConflict.zona} / Seção {duplicateConfirmModal.cpfConflict.secao}
                    {duplicateConfirmModal.cpfConflict.bairro ? ` • Bairro: ${duplicateConfirmModal.cpfConflict.bairro}` : ''}
                  </p>
                </div>
              )}

              {duplicateConfirmModal.tituloConflict && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-1 text-xs text-amber-950">
                  <div className="flex items-center justify-between font-bold text-amber-900">
                    <span className="flex items-center gap-1.5 font-mono">
                      <FileText className="w-4 h-4 text-amber-700" /> Título: {duplicateConfirmModal.tituloConflict.tituloEleitor}
                    </span>
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                      Já Cadastrado
                    </span>
                  </div>
                  <p className="text-amber-900 font-bold text-sm">
                    Pertence a: {duplicateConfirmModal.tituloConflict.nome}
                  </p>
                  <p className="text-[11px] text-amber-800 leading-snug">
                    Liderança: <strong>{duplicateConfirmModal.tituloConflict.lideranca || 'Sem Liderança'}</strong> • Zona {duplicateConfirmModal.tituloConflict.zona} / Seção {duplicateConfirmModal.tituloConflict.secao}
                    {duplicateConfirmModal.tituloConflict.bairro ? ` • Bairro: ${duplicateConfirmModal.tituloConflict.bairro}` : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/60 text-xs text-on-surface-variant leading-relaxed">
              💡 <strong>Como deseja prosseguir?</strong> Você pode clicar em <strong>&quot;Voltar e Corrigir os Dados&quot;</strong> para alterar a numeração sem perder nada do que digitou, ou salvar mesmo assim para registrar a colisão na <strong>Auditoria de Conflitos</strong>.
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-2 border-t border-outline-variant/40">
              <button
                type="button"
                onClick={() => setDuplicateConfirmModal(null)}
                className="w-full sm:w-auto px-4 py-2.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Voltar e Corrigir os Dados
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  const conflictDesc = [
                    duplicateConfirmModal.cpfConflict ? `CPF com ${duplicateConfirmModal.cpfConflict.nome}` : '',
                    duplicateConfirmModal.tituloConflict ? `Título com ${duplicateConfirmModal.tituloConflict.nome}` : ''
                  ].filter(Boolean).join(' e ');

                  await executeSaveVoter(
                    duplicateConfirmModal.payload,
                    duplicateConfirmModal.isEdit,
                    duplicateConfirmModal.targetId,
                    true,
                    conflictDesc
                  );
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Salvar Duplicado Mesmo Assim
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== NOTIFICAÇÃO FLUTUANTE PERSISTENTE (NUNCA SOME RÁPIDO) ==================== */}
      {topBannerFeedback && (
        <div
          className="fixed top-5 right-5 z-[99999] max-w-md w-[calc(100vw-2.5rem)] sm:w-[440px] animate-fadeIn"
          role="alert"
        >
          <div
            className={`p-4 rounded-2xl border-2 shadow-2xl backdrop-blur-md transition-all ${
              topBannerFeedback.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-400 text-emerald-50 shadow-emerald-950/50'
                : topBannerFeedback.type === 'warn'
                ? 'bg-amber-950/95 border-amber-400 text-amber-50 shadow-amber-950/50'
                : 'bg-rose-950/95 border-rose-400 text-rose-50 shadow-rose-950/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                  topBannerFeedback.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : topBannerFeedback.type === 'warn'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {topBannerFeedback.type === 'success' && <CheckCircle2 className="w-6 h-6" />}
                {topBannerFeedback.type === 'warn' && <AlertTriangle className="w-6 h-6" />}
                {topBannerFeedback.type === 'error' && <AlertTriangle className="w-6 h-6" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-sm leading-snug tracking-tight">
                    {topBannerFeedback.title}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setTopBannerFeedback(null)}
                    className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="Fechar notificação agora"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs mt-1 text-white/90 leading-relaxed font-normal">
                  {topBannerFeedback.message}
                </p>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/15 text-[11px]">
                  <span className="text-white/60 font-mono">
                    Permanece visível por 12s
                  </span>
                  <button
                    type="button"
                    onClick={() => setTopBannerFeedback(null)}
                    className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold transition-colors cursor-pointer"
                  >
                    Entendi / Fechar
                  </button>
                </div>
              </div>
            </div>

            {/* Barra de progresso visual decrescente */}
            <div className="mt-3 h-1 w-full bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/80 rounded-full"
                style={{
                  animation: 'shrinkWidth 12s linear forwards'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal para Gerar e Compartilhar Link de Campo */}
      <ShareFieldLinkModal
        isOpen={isShareFieldModalOpen}
        onClose={() => setIsShareFieldModalOpen(false)}
      />
    </div>
  );
}
