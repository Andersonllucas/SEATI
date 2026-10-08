'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  UserCheck,
  Phone,
  PhoneCall,
  MessageCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Sparkles,
  Save,
  X,
  FileSpreadsheet,
  Check,
  Vote,
  AlertTriangle
} from 'lucide-react';
import {
  useCampaignData,
  Eleitor,
  TipoValidacao,
  StatusValidacao
} from '@/context/CampaignContext';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import Link from 'next/link';
import * as XLSX from 'xlsx';

// Helper de formatação de data e hora
function formatDateTime(isoString?: string): string {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const pad = (n: number) => String(n).padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${day}/${month}/${year} às ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

// Retorna se foi hoje, ontem ou a data
function formatRelativeDate(isoString?: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) return `Hoje às ${hours}:${minutes}`;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return `Ontem às ${hours}:${minutes}`;

    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${hours}:${minutes}`;
  } catch {
    return '';
  }
}

// Helper para converter data para input datetime-local
function toDatetimeLocal(isoString?: string): string {
  if (!isoString) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  try {
    const d = new Date(isoString);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

// Som de sucesso
function playSuccessChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {}
}

const TAGS_OBSERVACOES_RAPIDAS = [
  'Confirmou voto com entusiasmo',
  'Pediu adesivo / santinho para carro',
  'Pediu para participar de reuniões',
  'Ligação caiu / Não atendeu',
  'Pediu para retornar mais tarde',
  'Disse que está indeciso',
  'Número incorreto ou não existe',
  'Informou que já apoia outro candidato',
  'Pediu para não ser contatado'
];

export default function ValidacaoPage() {
  const { eleitores, liderancas, locais, registrarValidacao } = useCampaignData();
  const { currentUser } = useAuth();
  const { currentTenant } = useTenant();

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | StatusValidacao | 'sem_validacao'>('todos');
  const [tipoFilter, setTipoFilter] = useState<'todos' | TipoValidacao>('todos');
  const [liderancaFilter, setLiderancaFilter] = useState('todas');
  const [bairroFilter, setBairroFilter] = useState('todos');
  const [pendenciaFilter, setPendenciaFilter] = useState('todas');

  // Lê parâmetros da URL para abrir com filtros ativos (ex: ?pendencia=sem_telefone)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const pendParam = params.get('pendencia');
      if (pendParam) {
        setPendenciaFilter(pendParam);
      }
    }
  }, []);

  // Conjunto normalizado de todas as combinações (Zona:Seção) já cadastradas nos locais
  const registeredPairs = useMemo(() => {
    const set = new Set<string>();
    (locais || []).forEach((l) => {
      const normZ = (l.zona || '').replace(/\D/g, '').replace(/^0+/, '') || '1';
      const sArr = Array.isArray(l.secoes) ? l.secoes : (l.secoes ? String(l.secoes).split(',') : []);
      if (l.secao) sArr.push(l.secao);
      sArr.forEach((s) => {
        const normS = String(s).replace(/\D/g, '').replace(/^0+/, '');
        if (normS) set.add(`${normZ}:${normS}`);
      });
    });
    return set;
  }, [locais]);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Seleção múltipla para ações em lote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal de Validação Individual
  const [activeEleitor, setActiveEleitor] = useState<Eleitor | null>(null);
  const [formTipo, setFormTipo] = useState<TipoValidacao>('Ligação');
  const [formStatus, setFormStatus] = useState<StatusValidacao>('Confirmado');
  const [formDataHora, setFormDataHora] = useState<string>('');
  const [formObservacoes, setFormObservacoes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // Modal de Validação em Lote
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchTipo, setBatchTipo] = useState<TipoValidacao>('Mensagem');
  const [batchStatus, setBatchStatus] = useState<StatusValidacao>('Confirmado');
  const [batchObs, setBatchObs] = useState('');
  const [isBatchSaving, setIsBatchSaving] = useState(false);

  // Lista de Bairros Únicos
  const bairrosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    eleitores.forEach((e) => {
      if (e.bairro && e.bairro.trim()) set.add(e.bairro.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [eleitores]);

  // Estatísticas Rápidas
  const stats = useMemo(() => {
    let confirmados = 0;
    let pendentes = 0;
    let negados = 0;
    let porLigacao = 0;
    let porMensagem = 0;
    let comValidacao = 0;

    eleitores.forEach((e) => {
      const s = e.statusValidacao;
      if (s === 'Confirmado') confirmados++;
      else if (s === 'Negado') negados++;
      else pendentes++; // Pendente é o default para novos ou explícitos

      if (e.statusValidacao) {
        comValidacao++;
      }

      if (e.tipoValidacao === 'Ligação') porLigacao++;
      else if (e.tipoValidacao === 'Mensagem') porMensagem++;
    });

    const total = eleitores.length;
    const taxaConfirmacao = total > 0 ? Math.round((confirmados / total) * 100) : 0;
    const taxaValidacao = total > 0 ? Math.round((comValidacao / total) * 100) : 0;

    return {
      total,
      confirmados,
      pendentes,
      negados,
      comValidacao,
      porLigacao,
      porMensagem,
      taxaConfirmacao,
      taxaValidacao
    };
  }, [eleitores]);

  // Filtragem dos Eleitores
  const filteredEleitores = useMemo(() => {
    return eleitores.filter((e) => {
      // Filtro Status
      if (statusFilter !== 'todos') {
        if (statusFilter === 'sem_validacao') {
          if (e.statusValidacao) return false;
        } else {
          // Se for Pendente, inclui os sem statusValidacao ou com 'Pendente'
          if (statusFilter === 'Pendente') {
            if (e.statusValidacao && e.statusValidacao !== 'Pendente') return false;
          } else {
            if (e.statusValidacao !== statusFilter) return false;
          }
        }
      }

      // Filtro Tipo
      if (tipoFilter !== 'todos') {
        if (e.tipoValidacao !== tipoFilter) return false;
      }

      // Filtro Liderança
      if (liderancaFilter !== 'todas') {
        if (e.liderancaId !== liderancaFilter && e.lideranca !== liderancaFilter) return false;
      }

      // Filtro Bairro
      if (bairroFilter !== 'todos') {
        if ((e.bairro || '').trim() !== bairroFilter) return false;
      }

      // Busca textual (não considera Liderança pois há filtro dedicado)
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const cleanDigits = term.replace(/\D/g, '');
        const matchNome = (e.nome || '').toLowerCase().includes(term);
        const matchCpf = cleanDigits && (e.cpf || '').replace(/\D/g, '').includes(cleanDigits);
        const matchTel = cleanDigits && (e.telefone || '').replace(/\D/g, '').includes(cleanDigits);
        const matchBairro = (e.bairro || '').toLowerCase().includes(term);
        const matchObs = (e.observacoesValidacao || '').toLowerCase().includes(term);

        if (!matchNome && !matchCpf && !matchTel && !matchBairro && !matchObs) {
          return false;
        }
      }

      // Filtro de Pendências Específicas
      if (pendenciaFilter !== 'todas') {
        const hasNoCpf = !e.cpf || !e.cpf.trim() || e.cpf.replace(/\D/g, '').length < 11;
        const hasNoTitulo = !e.tituloEleitor || !e.tituloEleitor.trim() || e.tituloEleitor.replace(/\D/g, '').length < 5;
        const hasNoTelefone = !e.telefone || !e.telefone.trim() || e.telefone.replace(/\D/g, '').length < 8;
        const hasNoZonaSecao = !e.zona || !e.zona.trim() || !e.secao || !e.secao.trim();
        const hasNoBairro = !e.bairro || !e.bairro.trim();
        const normZ = (e.zona || '').replace(/\D/g, '').replace(/^0+/, '');
        const normS = (e.secao || '').replace(/\D/g, '').replace(/^0+/, '');
        const hasNoLocal = !normZ || !normS || !registeredPairs.has(`${normZ}:${normS}`);
        const hasNoLideranca =
          !e.liderancaId ||
          !e.lideranca ||
          e.lideranca.trim() === '' ||
          e.lideranca.trim().toLowerCase() === 'sem liderança' ||
          e.lideranca.trim().toLowerCase() === 'sem lideranca' ||
          e.lideranca.trim().toLowerCase() === 'sem liderança definida' ||
          e.lideranca.trim().toLowerCase() === 'não informada' ||
          e.lideranca.trim().toLowerCase() === 'nao informada';

        if (pendenciaFilter === 'qualquer') {
          if (!hasNoCpf && !hasNoTitulo && !hasNoTelefone && !hasNoZonaSecao && !hasNoLocal) return false;
        } else if (pendenciaFilter === 'sem_titulo') {
          if (!hasNoTitulo) return false;
        } else if (pendenciaFilter === 'sem_cpf') {
          if (!hasNoCpf) return false;
        } else if (pendenciaFilter === 'sem_telefone') {
          if (!hasNoTelefone) return false;
        } else if (pendenciaFilter === 'sem_zona') {
          if (!hasNoZonaSecao) return false;
        } else if (pendenciaFilter === 'sem_local') {
          if (!hasNoLocal) return false;
        } else if (pendenciaFilter === 'sem_bairro') {
          if (!hasNoBairro) return false;
        } else if (pendenciaFilter === 'sem_lideranca') {
          if (!hasNoLideranca) return false;
        } else if (pendenciaFilter === 'completos') {
          if (hasNoCpf || hasNoTitulo || hasNoTelefone || hasNoZonaSecao || hasNoLocal) return false;
        }
      }

      return true;
    });
  }, [eleitores, statusFilter, tipoFilter, liderancaFilter, bairroFilter, pendenciaFilter, searchTerm, registeredPairs]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filteredEleitores.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedEleitores = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredEleitores.slice(start, start + pageSize);
  }, [filteredEleitores, safeCurrentPage, pageSize]);

  // Abre Modal de Validação Individual
  const handleOpenValidate = (eleitor: Eleitor, preTipo?: TipoValidacao) => {
    setActiveEleitor(eleitor);
    setFormTipo(preTipo || eleitor.tipoValidacao || 'Ligação');
    setFormStatus(eleitor.statusValidacao || 'Confirmado');
    setFormDataHora(toDatetimeLocal(eleitor.dataHoraValidacao));
    setFormObservacoes(eleitor.observacoesValidacao || '');
  };

  // Salva Validação Individual
  const handleSaveValidation = async () => {
    if (!activeEleitor) return;
    setIsSaving(true);

    try {
      const dataHoraIso = formDataHora ? new Date(formDataHora).toISOString() : new Date().toISOString();
      await registrarValidacao(activeEleitor.id, {
        tipo: formTipo,
        status: formStatus,
        dataHora: dataHoraIso,
        observacoes: formObservacoes,
        operadorNome: currentUser?.nome || currentUser?.email || 'Coordenação'
      });

      playSuccessChime();
      setFeedbackToast({
        message: `✓ Validação de "${activeEleitor.nome}" registrada com sucesso!`,
        type: 'success'
      });
      setTimeout(() => setFeedbackToast(null), 3500);
      setActiveEleitor(null);
    } catch (err) {
      console.error('Erro ao salvar validação:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Salva Validação em Lote
  const handleSaveBatchValidation = async () => {
    if (selectedIds.size === 0) return;
    setIsBatchSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const ids = Array.from(selectedIds);
      const BATCH_CHUNK = 20;

      for (let i = 0; i < ids.length; i += BATCH_CHUNK) {
        const chunk = ids.slice(i, i + BATCH_CHUNK);
        await Promise.all(
          chunk.map((id) =>
            registrarValidacao(id, {
              tipo: batchTipo,
              status: batchStatus,
              dataHora: nowIso,
              observacoes: batchObs || `Validação em lote realizada por ${currentUser?.nome || 'Coordenação'}`,
              operadorNome: currentUser?.nome || currentUser?.email || 'Coordenação'
            })
          )
        );
      }

      playSuccessChime();
      setFeedbackToast({
        message: `✓ ${ids.length} eleitores atualizados com status "${batchStatus}"!`,
        type: 'success'
      });
      setTimeout(() => setFeedbackToast(null), 3500);
      setSelectedIds(new Set());
      setIsBatchModalOpen(false);
      setBatchObs('');
    } catch (err) {
      console.error('Erro ao salvar lote:', err);
    } finally {
      setIsBatchSaving(false);
    }
  };

  // Disparo direto de WhatsApp com link
  const handleOpenWhatsApp = (eleitor: Eleitor) => {
    const cleanPhone = (eleitor.telefone || '').replace(/\D/g, '');
    if (!cleanPhone) return;

    const primeiroNome = (eleitor.nome || '').split(' ')[0];
    const campanhaNome = currentTenant?.nome || 'nossa equipe';
    const text = encodeURIComponent(
      `Olá, ${primeiroNome}! Tudo bem? Aqui é da equipe do ${campanhaNome}. Gostaria de confirmar seu apoio e saber se você precisa de algum material ou santinho para a eleição. Abraço!`
    );

    window.open(`https://wa.me/55${cleanPhone}?text=${text}`, '_blank');
    // Já abre a janela de validação sugerindo tipo "Mensagem"
    handleOpenValidate(eleitor, 'Mensagem');
  };

  // Disparo de ligação
  const handleCall = (eleitor: Eleitor) => {
    const cleanPhone = (eleitor.telefone || '').replace(/\D/g, '');
    if (!cleanPhone) return;
    window.location.href = `tel:${cleanPhone}`;
    // Abre a janela de validação sugerindo tipo "Ligação"
    handleOpenValidate(eleitor, 'Ligação');
  };

  // Funções de Seleção de Eleitores (mesma lógica avançada da Base de Eleitor)
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

  // Exportar Relatório de Validações em Excel
  const handleExportExcel = () => {
    const rows = filteredEleitores.map((e, index) => {
      return {
        '#': index + 1,
        'Nome do Eleitor': e.nome,
        'Telefone': e.telefone || '-',
        'CPF': e.cpf || '-',
        'Bairro': e.bairro || '-',
        'Zona': e.zona || '-',
        'Seção': e.secao || '-',
        'Liderança': e.lideranca || '-',
        'Status da Validação': e.statusValidacao || 'Pendente',
        'Canal / Tipo': e.tipoValidacao || '-',
        'Data e Horário': e.dataHoraValidacao ? formatDateTime(e.dataHoraValidacao) : 'Não validado',
        'Validado Por': e.operadorValidacao || '-',
        'Observações': e.observacoesValidacao || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório de Validações');
    XLSX.writeFile(wb, `Validacao_Eleitores_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-3 md:p-4 space-y-3 max-w-[1600px] mx-auto flex-1 h-full flex flex-col relative">
      {/* Toast Feedback */}
      {feedbackToast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-fadeIn border border-white/10">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackToast.message}</span>
          <button onClick={() => setFeedbackToast(null)} className="ml-2 text-white/60 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Banner & Header - Compacto e Elegante */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
              <UserCheck className="w-5 h-5 text-secondary" />
            </div>
            <h1 className="text-lg md:text-xl text-on-surface font-bold tracking-tight whitespace-nowrap">
              Validação do Eleitor
            </h1>
          </div>
          <span className="text-[11px] bg-secondary/15 text-secondary font-bold px-2.5 py-0.5 rounded-full hidden sm:inline-block whitespace-nowrap">
            Checagem de Voto & Contato
          </span>
          <span className="text-xs text-on-surface-variant hidden xl:inline truncate">
            • Registro de confirmação por ligação ou mensagem com horário e histórico
          </span>
        </div>

        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto py-0.5 shrink-0">
          <Link
            href="/cumprimento-votos"
            className="px-3 py-1.5 bg-primary text-on-primary hover:bg-secondary rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap shrink-0"
            title="Ir para a Validação Pós-Eleição (Cumprimento de Votos)"
          >
            <Vote className="w-3.5 h-3.5 text-primary-fixed" />
            <span>Pós-Eleição (Urnas)</span>
          </Link>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-1.5 border border-outline-variant bg-surface hover:bg-surface-container text-on-surface rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            title="Exportar planilha completa de validações"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar Excel</span>
          </button>

          <Link
            href="/eleitores"
            className="px-3 py-1.5 border border-outline-variant bg-surface hover:bg-surface-container text-on-surface rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap shrink-0"
            title="Voltar para a Base Geral de Eleitores"
          >
            <Users className="w-3.5 h-3.5 text-secondary" />
            <span>Base Geral</span>
          </Link>
        </div>
      </div>

      {/* Metrics Cards Compactos (Mesmo Padrão Ultra-Compacto) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
        {/* Card 1: Confirmados */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-emerald-300/60 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Confirmados
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <h3 className="text-lg md:text-xl font-black text-emerald-800">{stats.confirmados}</h3>
              <span className="text-[11px] text-emerald-700/80 font-medium">({stats.taxaConfirmacao}% da base)</span>
            </div>
          </div>
          <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
            <Check className="w-4 h-4" />
          </div>
        </div>

        {/* Card 2: Pendentes */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-amber-300/60 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-600" /> Pendentes
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <h3 className="text-lg md:text-xl font-black text-amber-800">{stats.pendentes}</h3>
              <span className="text-[11px] text-amber-700/80 font-medium">a contatar</span>
            </div>
          </div>
          <div className="p-1.5 bg-amber-100 rounded-lg text-amber-700">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* Card 3: Negados */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-rose-300/60 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1">
              <XCircle className="w-3 h-3 text-rose-600" /> Negados / Recusa
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <h3 className="text-lg md:text-xl font-black text-rose-800">{stats.negados}</h3>
              <span className="text-[11px] text-rose-700/80 font-medium">eleitores</span>
            </div>
          </div>
          <div className="p-1.5 bg-rose-100 rounded-lg text-rose-700">
            <XCircle className="w-4 h-4" />
          </div>
        </div>

        {/* Card 4: Canais de Contato */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-outline-variant/60 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Canais Utilizados
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs">
              <span className="inline-flex items-center gap-1 text-sky-700 font-bold">
                <Phone className="w-3 h-3" /> {stats.porLigacao} Lig.
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                <MessageCircle className="w-3 h-3" /> {stats.porMensagem} Msg.
              </span>
            </div>
          </div>
          <div className="p-1.5 bg-surface-container rounded-lg text-secondary">
            <Sparkles className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm overflow-hidden flex flex-col flex-1">
        {/* Toolbar - Compacta em Linha Única */}
        <div className="px-3.5 py-2 bg-surface border-b border-outline-variant/50 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs md:text-sm text-on-surface font-bold">Lista de Validação</h2>
            <span className="text-[11px] bg-surface-container text-on-surface px-2 py-0.5 rounded-full font-medium">
              {filteredEleitores.length} de {eleitores.length}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filtro Status da Validação */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary font-medium"
            >
              <option value="todos">Status: Todos</option>
              <option value="Confirmado">✓ Apenas Confirmados</option>
              <option value="Pendente">⏳ Apenas Pendentes</option>
              <option value="Negado">✕ Apenas Negados</option>
              <option value="sem_validacao">Sem Contato Registrado</option>
            </select>

            {/* Filtro Tipo de Validação */}
            <select
              value={tipoFilter}
              onChange={(e) => {
                setTipoFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary"
            >
              <option value="todos">Canal: Todos</option>
              <option value="Ligação">📞 Por Ligação</option>
              <option value="Mensagem">💬 Por Mensagem</option>
            </select>

            {/* Filtro Liderança */}
            <select
              value={liderancaFilter}
              onChange={(e) => {
                setLiderancaFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary max-w-[150px]"
            >
              <option value="todas">Todas Lideranças</option>
              {liderancas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>

            {/* Filtro Bairro */}
            {bairrosDisponiveis.length > 0 && (
              <select
                value={bairroFilter}
                onChange={(e) => {
                  setBairroFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary max-w-[130px]"
              >
                <option value="todos">Todos Bairros</option>
                {bairrosDisponiveis.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}

            {/* Filtro por Pendência Cadastral */}
            <select
              value={pendenciaFilter}
              onChange={(e) => {
                setPendenciaFilter(e.target.value);
                setCurrentPage(1);
              }}
              className={`h-8 border rounded-md px-2 text-xs focus:outline-none focus:border-secondary transition-colors ${
                pendenciaFilter !== 'todas'
                  ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold'
                  : 'bg-surface-container-lowest border-outline-variant/50 text-on-surface'
              }`}
              title="Filtrar eleitores por tipo de informação cadastral pendente"
            >
              <option value="todas">Pendências: Todas</option>
              <option value="qualquer">⚠️ Qualquer Informação Pendente</option>
              <option value="sem_titulo">🎫 Sem Título de Eleitor</option>
              <option value="sem_cpf">📄 Sem CPF (Pendente)</option>
              <option value="sem_zona">🗳️ Sem Zona / Seção</option>
              <option value="sem_local">🏫 Sem Local de Votação Cadastrado</option>
              <option value="sem_telefone">📱 Sem Telefone / WhatsApp</option>
              <option value="sem_lideranca">👥 Sem Liderança Vinculada</option>
              <option value="sem_bairro">📍 Sem Bairro</option>
              <option value="completos">✅ Cadastros Completos (Sem Pendências)</option>
            </select>

            {/* Busca textual */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Buscar eleitor, telefone, CPF..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-36 sm:w-48 h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md pl-8 pr-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
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
              title="Quantidade por página"
            >
              <option value={15}>15 por pág.</option>
              <option value={25}>25 por pág.</option>
              <option value={50}>50 por pág.</option>
              <option value={100}>100 por pág.</option>
            </select>
          </div>
        </div>

        {/* Banner de Filtro de Pendência Ativo */}
        {pendenciaFilter !== 'todas' && (
          <div className="px-3.5 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3 text-xs text-amber-950 animate-fadeIn">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                Filtro de Pendências ativo: Exibindo apenas os <strong>{filteredEleitores.length}</strong> eleitor(es) com {
                  pendenciaFilter === 'qualquer' ? 'qualquer informação pendente' :
                  pendenciaFilter === 'sem_titulo' ? 'Título de Eleitor não preenchido' :
                  pendenciaFilter === 'sem_cpf' ? 'CPF não preenchido' :
                  pendenciaFilter === 'sem_zona' ? 'Zona ou Seção não preenchida' :
                  pendenciaFilter === 'sem_local' ? 'Local de Votação não cadastrado no sistema' :
                  pendenciaFilter === 'sem_telefone' ? 'Telefone/WhatsApp não preenchido' :
                  pendenciaFilter === 'sem_lideranca' ? 'Liderança não vinculada' :
                  pendenciaFilter === 'sem_bairro' ? 'Bairro não preenchido' :
                  'cadastro 100% completo (sem pendências)'
                }.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPendenciaFilter('todas');
                setCurrentPage(1);
              }}
              className="text-xs font-bold text-amber-800 hover:underline flex items-center gap-1 cursor-pointer ml-1 shrink-0"
            >
              <X className="w-3.5 h-3.5" /> Limpar Pendência
            </button>
          </div>
        )}

        {/* Barra de Ações em Lote */}
        {selectedIds.size > 0 && (
          <div className="px-3.5 py-2 bg-primary/10 border-b border-primary/20 flex flex-wrap items-center justify-between gap-2.5 text-xs text-on-surface animate-fadeIn">
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
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(true)}
                className="px-3 py-1.5 bg-primary text-on-primary hover:bg-secondary rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Registrar Validação em Lote ({selectedIds.size})
              </button>
            </div>
          </div>
        )}

        {/* Tabela de Validações */}
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[950px]">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/60 text-xs text-on-surface-variant uppercase font-semibold">
                <th className="py-2 px-3 md:py-2.5 md:px-3.5 w-10">
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
                <th className="py-2 px-3 md:py-2.5 md:px-3.5">Eleitor & Telefone</th>
                <th className="py-2 px-3 md:py-2.5 md:px-3.5">Status da Validação</th>
                <th className="py-2 px-3 md:py-2.5 md:px-3.5">Canal / Tipo</th>
                <th className="py-2 px-3 md:py-2.5 md:px-3.5">Horário da Validação</th>
                <th className="py-2 px-3 md:py-2.5 md:px-3.5">Liderança</th>
                <th className="py-2 px-3 md:py-2.5 md:px-3.5">Observações</th>
                <th className="py-2 px-3 md:py-2.5 md:px-3.5 text-right">Ação de Validação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30 text-sm">
              {filteredEleitores.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-on-surface-variant">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UserCheck className="w-8 h-8 text-outline-variant" />
                      <p className="font-semibold text-on-surface">Nenhum eleitor encontrado nos filtros</p>
                      <p className="text-xs text-on-surface-variant">
                        Altere os filtros acima para listar os eleitores para validação.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedEleitores.map((eleitor) => {
                  const isSelected = selectedIds.has(eleitor.id);
                  const statusVal = eleitor.statusValidacao || 'Pendente';
                  const hasPhone = !!eleitor.telefone && eleitor.telefone.replace(/\D/g, '').length >= 10;

                  return (
                    <tr
                      key={eleitor.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-secondary/10 hover:bg-secondary/15 ring-1 ring-inset ring-secondary/30'
                          : statusVal === 'Confirmado'
                          ? 'hover:bg-emerald-50/30'
                          : statusVal === 'Negado'
                          ? 'hover:bg-rose-50/30'
                          : 'hover:bg-surface-container-low'
                      }`}
                    >
                      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(eleitor.id)}
                          className="rounded border-outline-variant text-secondary focus:ring-secondary w-4 h-4 cursor-pointer"
                        />
                      </td>

                      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
                        <p className="font-semibold text-xs md:text-sm text-on-surface leading-tight">
                          {eleitor.nome}
                        </p>
                        <p className="text-[10px] md:text-[11px] text-on-surface-variant mt-0.5 leading-none">
                          {eleitor.telefone || 'Sem telefone'} • {eleitor.bairro || 'Sem bairro'}
                        </p>
                      </td>

                      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
                        {statusVal === 'Confirmado' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Confirmado
                          </span>
                        ) : statusVal === 'Negado' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                            <XCircle className="w-3 h-3 text-rose-600" /> Negado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                            <Clock className="w-3 h-3 text-amber-600" /> Pendente
                          </span>
                        )}
                      </td>

                      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
                        {eleitor.tipoValidacao ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-on-surface">
                            {eleitor.tipoValidacao === 'Ligação' ? (
                              <PhoneCall className="w-3.5 h-3.5 text-sky-600" />
                            ) : (
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            )}
                            <span>{eleitor.tipoValidacao}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-on-surface-variant/60 italic">Não contatado</span>
                        )}
                      </td>

                      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
                        {eleitor.dataHoraValidacao ? (
                          <div>
                            <p className="text-xs font-semibold text-on-surface leading-tight">
                              {formatDateTime(eleitor.dataHoraValidacao)}
                            </p>
                            <p className="text-[10px] text-on-surface-variant mt-0.5 leading-none">
                              {formatRelativeDate(eleitor.dataHoraValidacao)}
                              {eleitor.operadorValidacao ? ` • por ${eleitor.operadorValidacao}` : ''}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[11px] text-on-surface-variant/60 italic">-</span>
                        )}
                      </td>

                      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
                        <span className="text-xs font-medium text-on-surface block truncate max-w-[140px]">
                          {eleitor.lideranca || '-'}
                        </span>
                        <span className="text-[10px] text-on-surface-variant">
                          Z: {eleitor.zona || '-'} / S: {eleitor.secao || '-'}
                        </span>
                      </td>

                      <td className="py-1.5 px-3 md:py-2 md:px-3.5">
                        {eleitor.observacoesValidacao ? (
                          <p
                            className="text-xs text-on-surface truncate max-w-[180px]"
                            title={eleitor.observacoesValidacao}
                          >
                            {eleitor.observacoesValidacao}
                          </p>
                        ) : (
                          <span className="text-[11px] text-on-surface-variant/50 italic">-</span>
                        )}
                      </td>

                      <td className="py-1.5 px-3 md:py-2 md:px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {hasPhone && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleCall(eleitor)}
                                className="p-1.5 bg-sky-50 text-sky-700 hover:bg-sky-600 hover:text-white border border-sky-300 hover:border-sky-600 rounded-md transition-colors cursor-pointer shadow-2xs"
                                title="Ligar para o eleitor"
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenWhatsApp(eleitor)}
                                className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-300 hover:border-emerald-600 rounded-md transition-colors cursor-pointer shadow-2xs"
                                title="Enviar mensagem no WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenValidate(eleitor)}
                            className="px-2.5 py-1 bg-primary text-on-primary hover:bg-secondary rounded-md text-xs font-bold transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
                            title="Registrar ou atualizar validação deste eleitor"
                          >
                            <UserCheck className="w-3.5 h-3.5 text-primary-fixed" />
                            <span>Validar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
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
              Exibindo <strong>{(currentPage - 1) * pageSize + 1}</strong> a{' '}
              <strong>{Math.min(currentPage * pageSize, filteredEleitores.length)}</strong> de{' '}
              <strong>{filteredEleitores.length}</strong> eleitores
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

      {/* MODAL DE VALIDAÇÃO INDIVIDUAL */}
      {activeEleitor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-5 py-3.5 bg-surface border-b border-outline-variant/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary/10 rounded-xl text-primary">
                  <UserCheck className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Registrar Validação de Eleitor</h3>
                  <p className="text-xs text-on-surface-variant font-medium">
                    {activeEleitor.nome} • {activeEleitor.telefone || 'Sem telefone'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveEleitor(null)}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              {/* 1. TIPO DA VALIDAÇÃO (MENSAGEM OU LIGAÇÃO) */}
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1.5 uppercase tracking-wider">
                  1. Tipo de Contato Realizado
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormTipo('Ligação')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      formTipo === 'Ligação'
                        ? 'border-sky-500 bg-sky-50 text-sky-900 ring-2 ring-sky-500/20'
                        : 'border-outline-variant/60 hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    <PhoneCall className={`w-4 h-4 ${formTipo === 'Ligação' ? 'text-sky-600' : 'text-on-surface-variant'}`} />
                    <span>Ligação Telefônica</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormTipo('Mensagem')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      formTipo === 'Mensagem'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20'
                        : 'border-outline-variant/60 hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    <MessageCircle className={`w-4 h-4 ${formTipo === 'Mensagem' ? 'text-emerald-600' : 'text-on-surface-variant'}`} />
                    <span>Mensagem (WhatsApp)</span>
                  </button>
                </div>
              </div>

              {/* 2. STATUS DA VALIDAÇÃO (CONFIRMADO, PENDENTE OU NEGADO) */}
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1.5 uppercase tracking-wider">
                  2. Status do Eleitor após o Contato
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormStatus('Confirmado')}
                    className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      formStatus === 'Confirmado'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/30'
                        : 'border-outline-variant/60 hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    <CheckCircle2 className={`w-4 h-4 ${formStatus === 'Confirmado' ? 'text-emerald-600' : 'text-on-surface-variant'}`} />
                    <span>Confirmado</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormStatus('Pendente')}
                    className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      formStatus === 'Pendente'
                        ? 'border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-500/30'
                        : 'border-outline-variant/60 hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    <Clock className={`w-4 h-4 ${formStatus === 'Pendente' ? 'text-amber-600' : 'text-on-surface-variant'}`} />
                    <span>Pendente</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormStatus('Negado')}
                    className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      formStatus === 'Negado'
                        ? 'border-rose-600 bg-rose-50 text-rose-950 ring-2 ring-rose-500/30'
                        : 'border-outline-variant/60 hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    <XCircle className={`w-4 h-4 ${formStatus === 'Negado' ? 'text-rose-600' : 'text-on-surface-variant'}`} />
                    <span>Negado</span>
                  </button>
                </div>
              </div>

              {/* 3. HORÁRIO EM QUE O ELEITOR FOI VALIDADO */}
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1.5 uppercase tracking-wider">
                  3. Horário e Data da Validação
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <input
                    type="datetime-local"
                    value={formDataHora}
                    onChange={(e) => setFormDataHora(e.target.value)}
                    className="w-full h-10 border border-outline-variant rounded-xl pl-9 pr-3 text-xs bg-surface text-on-surface focus:outline-none focus:border-secondary font-medium"
                  />
                </div>
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Horário registrado oficialmente para auditoria da coordenação.
                </p>
              </div>

              {/* 4. OBSERVAÇÕES / RETORNO DO ELEITOR */}
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1.5 uppercase tracking-wider">
                  4. Observações do Contato
                </label>
                <textarea
                  rows={2}
                  value={formObservacoes}
                  onChange={(e) => setFormObservacoes(e.target.value)}
                  placeholder="Ex: Confirmou apoio com firmeza, pediu santinhos para a família..."
                  className="w-full border border-outline-variant rounded-xl p-2.5 text-xs bg-surface text-on-surface focus:outline-none focus:border-secondary resize-none"
                />

                {/* Tags Rápidas */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {TAGS_OBSERVACOES_RAPIDAS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setFormObservacoes((prev) => (prev ? `${prev}; ${tag}` : tag));
                      }}
                      className="text-[10px] bg-surface-container hover:bg-surface-container-high text-on-surface px-2 py-0.5 rounded-full border border-outline-variant/40 transition-colors cursor-pointer"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* HISTÓRICO DE VALIDAÇÕES ANTERIORES DO ELEITOR */}
              {activeEleitor.historicoValidacoes && activeEleitor.historicoValidacoes.length > 0 && (
                <div className="pt-3 border-t border-outline-variant/40">
                  <p className="text-xs font-bold text-on-surface mb-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-secondary" /> Histórico de Contatos Anteriores
                  </p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                    {activeEleitor.historicoValidacoes.map((reg) => (
                      <div
                        key={reg.id}
                        className="p-2 rounded-lg bg-surface-container text-xs flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          {reg.tipo === 'Ligação' ? (
                            <PhoneCall className="w-3 h-3 text-sky-600" />
                          ) : (
                            <MessageCircle className="w-3 h-3 text-emerald-600" />
                          )}
                          <span className="font-semibold text-on-surface">{reg.status}</span>
                          <span className="text-[11px] text-on-surface-variant truncate max-w-[140px]">
                            {reg.observacoes || '-'}
                          </span>
                        </div>
                        <span className="text-[10px] text-on-surface-variant font-mono">
                          {formatRelativeDate(reg.dataHora)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-surface border-t border-outline-variant/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveEleitor(null)}
                className="px-3.5 py-2 border border-outline-variant rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveValidation}
                disabled={isSaving}
                className="px-4 py-2 bg-primary text-on-primary hover:bg-secondary rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Salvando...' : 'Salvar Validação'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VALIDAÇÃO EM LOTE */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 bg-surface border-b border-outline-variant/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-on-surface">
                  Validar {selectedIds.size} Eleitores em Lote
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Tipo de Validação</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchTipo('Ligação')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                      batchTipo === 'Ligação'
                        ? 'border-sky-500 bg-sky-50 text-sky-900 font-bold'
                        : 'border-outline-variant text-on-surface'
                    }`}
                  >
                    <PhoneCall className="w-3.5 h-3.5" /> Ligação
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchTipo('Mensagem')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                      batchTipo === 'Mensagem'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold'
                        : 'border-outline-variant text-on-surface'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Mensagem
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Status da Validação</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchStatus('Confirmado')}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                      batchStatus === 'Confirmado'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold'
                        : 'border-outline-variant text-on-surface'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Confirmado
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchStatus('Pendente')}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                      batchStatus === 'Pendente'
                        ? 'border-amber-600 bg-amber-50 text-amber-950 font-bold'
                        : 'border-outline-variant text-on-surface'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-600" /> Pendente
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchStatus('Negado')}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                      batchStatus === 'Negado'
                        ? 'border-rose-600 bg-rose-50 text-rose-950 font-bold'
                        : 'border-outline-variant text-on-surface'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-600" /> Negado
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Observação do Lote</label>
                <input
                  type="text"
                  placeholder="Ex: Disparo de confirmação via WhatsApp realizado"
                  value={batchObs}
                  onChange={(e) => setBatchObs(e.target.value)}
                  className="w-full h-9 border border-outline-variant rounded-lg px-3 text-xs bg-surface text-on-surface focus:outline-none focus:border-secondary"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-surface border-t border-outline-variant/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="px-3.5 py-1.5 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveBatchValidation}
                disabled={isBatchSaving}
                className="px-4 py-1.5 bg-primary text-on-primary hover:bg-secondary rounded-lg text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isBatchSaving ? 'Atualizando...' : 'Confirmar Atualização em Lote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
