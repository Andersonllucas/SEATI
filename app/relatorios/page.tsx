'use client';

import React, { useState, useMemo } from 'react';
import {
  Printer,
  Download,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Users,
  MapPin,
  Award,
  CheckSquare,
  Search,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Table,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useCampaignData, Lideranca, formatTituloUtil } from '@/context/CampaignContext';
import { useTenant } from '@/context/TenantContext';
import { useAuth } from '@/context/AuthContext';
import {
  ReportMode,
  generateReportPDF,
  generateReportExcel,
  generateReportCSV
} from '@/lib/reportsExportUtils';
import { formatCpf } from '@/lib/importExportUtils';

const STATUS_OPCOES = [
  'Pendente',
  'Auditado',
  'Confirmado',
  'Negado',
  'Voto Certo',
  'Apoiador',
  'Validado'
];

// Helper seguro para converter secoes (string | string[] | undefined) em array de strings
function toSecArray(secoes?: string | string[]): string[] {
  if (!secoes) return [];
  if (Array.isArray(secoes)) return secoes.map((s) => String(s).trim()).filter(Boolean);
  return String(secoes)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function RelatoriosPage() {
  const {
    eleitores,
    liderancas,
    locais,
    conflictingCpfVoterIds,
    conflictingTituloVoterIds,
    conflictingVoterIds,
    totalEleitores
  } = useCampaignData();

  const { currentTenant, subdomain } = useTenant();
  const { currentUser } = useAuth();

  // 1. MODO DO RELATÓRIO
  const [reportMode, setReportMode] = useState<ReportMode>('nominal');

  // 2. FILTROS SELECIONADOS
  const [selectedZona, setSelectedZona] = useState<string>('todas');
  const [selectedSecao, setSelectedSecao] = useState<string>('todas');
  const [selectedLiderPrincipalId, setSelectedLiderPrincipalId] = useState<string>('todos');
  const [selectedSubLiderId, setSelectedSubLiderId] = useState<string>('todos');
  const [selectedBairro, setSelectedBairro] = useState<string>('todos');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [selectedPendencia, setSelectedPendencia] = useState<string>('todas');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // 3. PAGINAÇÃO E CONTROLES DE VISUALIZAÇÃO
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50); // 25, 50, 100 ou -1 (todos)
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  // 4. MAXIMIZAÇÃO E ESPAÇO DE VISUALIZAÇÃO DA TABELA
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(false);
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
  const [showMetrics, setShowMetrics] = useState<boolean>(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedZona !== 'todas') count++;
    if (selectedSecao !== 'todas') count++;
    if (selectedLiderPrincipalId !== 'todos') count++;
    if (selectedSubLiderId !== 'todos') count++;
    if (selectedBairro !== 'todos') count++;
    if (selectedStatus !== 'todos') count++;
    if (selectedPendencia !== 'todas') count++;
    return count;
  }, [selectedZona, selectedSecao, selectedLiderPrincipalId, selectedSubLiderId, selectedBairro, selectedStatus, selectedPendencia]);

  // Mapeamentos de Lideranças
  const { liderancasPrincipais, subLiderancas, leaderByIdMap } = useMemo(() => {
    const principais: Lideranca[] = [];
    const subs: Lideranca[] = [];
    const map = new Map<string, Lideranca>();

    liderancas.forEach((l) => {
      map.set(l.id, l);
      if (l.nome) map.set(l.nome.trim().toLowerCase(), l);

      if (l.tipo === 'Sub-liderança') {
        subs.push(l);
      } else {
        principais.push(l);
      }
    });

    principais.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    subs.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    return {
      liderancasPrincipais: principais,
      subLiderancas: subs,
      leaderByIdMap: map
    };
  }, [liderancas]);

  // Sub-lideranças filtradas com base na Liderança Principal selecionada
  const availableSubLiderancas = useMemo(() => {
    if (selectedLiderPrincipalId === 'todos') {
      return subLiderancas;
    }
    const selectedPrincipal = leaderByIdMap.get(selectedLiderPrincipalId);
    if (!selectedPrincipal) return subLiderancas;

    return subLiderancas.filter(
      (s) =>
        s.liderancaPaiId === selectedPrincipal.id ||
        (s.liderancaPaiNome && s.liderancaPaiNome.trim().toLowerCase() === selectedPrincipal.nome.trim().toLowerCase())
    );
  }, [selectedLiderPrincipalId, subLiderancas, leaderByIdMap]);

  // Lista única de Zonas Eleitorais disponíveis
  const availableZonas = useMemo(() => {
    const set = new Set<string>();
    eleitores.forEach((e) => {
      if (e.zona && e.zona.trim()) set.add(e.zona.trim());
    });
    locais.forEach((loc) => {
      if (loc.zona && loc.zona.trim()) set.add(loc.zona.trim());
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [eleitores, locais]);

  // Lista única de Seções Eleitorais disponíveis (filtrada por Zona se selecionada)
  const availableSecoes = useMemo(() => {
    const set = new Set<string>();
    eleitores.forEach((e) => {
      if (selectedZona === 'todas' || e.zona?.trim() === selectedZona) {
        if (e.secao && e.secao.trim()) set.add(e.secao.trim());
      }
    });
    locais.forEach((loc) => {
      if (selectedZona === 'todas' || loc.zona?.trim() === selectedZona) {
        toSecArray(loc.secoes).forEach((sec) => {
          if (sec && String(sec).trim()) set.add(String(sec).trim());
        });
      }
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [eleitores, locais, selectedZona]);

  // Lista única de Bairros disponíveis
  const availableBairros = useMemo(() => {
    const set = new Set<string>();
    eleitores.forEach((e) => {
      if (e.bairro && e.bairro.trim()) set.add(e.bairro.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [eleitores]);

  // Mapeamento de Locais de Votação (Zona + Seção -> Nome da Escola)
  const localPorZonaSecao = useMemo(() => {
    const map = new Map<string, string>();
    locais.forEach((loc) => {
      const zNorm = (loc.zona || '').padStart(3, '0');
      toSecArray(loc.secoes).forEach((sec) => {
        const sNorm = String(sec).padStart(4, '0');
        map.set(`${zNorm}-${sNorm}`, `${loc.nome} (${loc.bairro || ''})`);
      });
    });
    return map;
  }, [locais]);

  // Conjunto de Zonas e Seções oficiais cadastradas em locais de votação
  const registeredPairs = useMemo(() => {
    const set = new Set<string>();
    locais.forEach((loc) => {
      const zNorm = (loc.zona || '').replace(/\D/g, '').replace(/^0+/, '');
      toSecArray(loc.secoes).forEach((sec) => {
        const sNorm = String(sec).replace(/\D/g, '').replace(/^0+/, '');
        if (zNorm && sNorm) set.add(`${zNorm}:${sNorm}`);
      });
      if (loc.secao) {
        const sNorm = String(loc.secao).replace(/\D/g, '').replace(/^0+/, '');
        if (zNorm && sNorm) set.add(`${zNorm}:${sNorm}`);
      }
    });
    return set;
  }, [locais]);

  // APLICAÇÃO DOS FILTROS NA BASE DE ELEITORES
  const filteredEleitores = useMemo(() => {
    return eleitores.filter((e) => {
      // Filtro Zona
      if (selectedZona !== 'todas' && e.zona?.trim() !== selectedZona) {
        return false;
      }

      // Filtro Seção
      if (selectedSecao !== 'todas' && e.secao?.trim() !== selectedSecao) {
        return false;
      }

      // Identificação da liderança do eleitor
      const voterLeader = e.liderancaId
        ? leaderByIdMap.get(e.liderancaId)
        : leaderByIdMap.get((e.lideranca || '').trim().toLowerCase());

      // Filtro por Liderança Principal
      if (selectedLiderPrincipalId !== 'todos') {
        if (selectedLiderPrincipalId === 'sem_lideranca') {
          const l = (e.lideranca || '').trim().toLowerCase();
          const hasNoLid = !e.liderancaId || l === '' || l === 'sem liderança' || l === 'sem lideranca' || l === 'não informada' || l === 'nao informada' || l === 'sem liderança definida';
          if (!hasNoLid) return false;
        } else {
          const principalSelected = leaderByIdMap.get(selectedLiderPrincipalId);
          if (!voterLeader || !principalSelected) return false;

          const isDirectPrincipal = voterLeader.id === principalSelected.id;
          const isSubOfThisPrincipal =
            voterLeader.tipo === 'Sub-liderança' &&
            (voterLeader.liderancaPaiId === principalSelected.id ||
              voterLeader.liderancaPaiNome?.trim().toLowerCase() === principalSelected.nome.trim().toLowerCase());

          if (!isDirectPrincipal && !isSubOfThisPrincipal) {
            return false;
          }
        }
      }

      // Filtro por Sub-liderança
      if (selectedSubLiderId !== 'todos') {
        if (!voterLeader || voterLeader.id !== selectedSubLiderId) {
          return false;
        }
      }

      // Filtro Bairro
      if (selectedBairro !== 'todos' && e.bairro?.trim().toLowerCase() !== selectedBairro.trim().toLowerCase()) {
        return false;
      }

      // Filtro Status
      if (selectedStatus !== 'todos') {
        if (selectedStatus === 'conflito') {
          if (!conflictingVoterIds.has(e.id)) return false;
        } else if (selectedStatus === 'conflito_cpf') {
          if (!conflictingCpfVoterIds.has(e.id)) return false;
        } else if (selectedStatus === 'conflito_titulo') {
          if (!conflictingTituloVoterIds.has(e.id)) return false;
        } else if (selectedStatus === 'sem_doc') {
          if (e.cpf || e.tituloEleitor) return false;
        } else if (selectedStatus === 'Pendente') {
          const s = e.status || 'Pendente';
          if (s !== 'Pendente' && s !== 'Pendente de confirmação') return false;
        } else if (selectedStatus === 'Auditado') {
          const s = e.status || '';
          if (s !== 'Auditado' && s !== 'Auditado e Validado') return false;
        } else {
          if ((e.status || 'Pendente') !== selectedStatus) return false;
        }
      }

      // Filtro Pendência de Informação Cadastral (Título, CPF, Local de Votação, etc.)
      if (selectedPendencia !== 'todas') {
        const hasNoCpf = !e.cpf || !e.cpf.trim() || e.cpf.replace(/\D/g, '').length < 11;
        const hasNoTitulo = !e.tituloEleitor || !e.tituloEleitor.trim() || e.tituloEleitor.replace(/\D/g, '').length < 5;
        const hasNoTelefone = !e.telefone || !e.telefone.trim() || e.telefone.replace(/\D/g, '').length < 8;
        const hasNoZonaSecao = !e.zona || !e.zona.trim() || !e.secao || !e.secao.trim();
        const hasNoBairro = !e.bairro || !e.bairro.trim();
        const hasNoLideranca = !e.liderancaId && (!e.lideranca || e.lideranca.trim() === '' || e.lideranca === 'Sem Liderança' || e.lideranca === 'Sem Liderança Definida');
        const normZ = (e.zona || '').replace(/\D/g, '').replace(/^0+/, '');
        const normS = (e.secao || '').replace(/\D/g, '').replace(/^0+/, '');
        const hasNoLocal = !normZ || !normS || !registeredPairs.has(`${normZ}:${normS}`);

        if (selectedPendencia === 'qualquer') {
          if (!hasNoCpf && !hasNoTitulo && !hasNoTelefone && !hasNoZonaSecao && !hasNoLocal) return false;
        } else if (selectedPendencia === 'sem_titulo') {
          if (!hasNoTitulo) return false;
        } else if (selectedPendencia === 'sem_cpf') {
          if (!hasNoCpf) return false;
        } else if (selectedPendencia === 'sem_zona') {
          if (!hasNoZonaSecao) return false;
        } else if (selectedPendencia === 'sem_local') {
          if (!hasNoLocal) return false;
        } else if (selectedPendencia === 'sem_telefone') {
          if (!hasNoTelefone) return false;
        } else if (selectedPendencia === 'sem_lideranca') {
          if (!hasNoLideranca) return false;
        } else if (selectedPendencia === 'sem_bairro') {
          if (!hasNoBairro) return false;
        } else if (selectedPendencia === 'completos') {
          if (hasNoCpf || hasNoTitulo || hasNoTelefone || hasNoZonaSecao || hasNoLocal) return false;
        }
      }

      // Busca por texto na tabela (NÃO considera Liderança pois há filtros dedicados de liderança principal e sub-liderança)
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const cleanDigits = term.replace(/\D/g, '');
        const nomeMatch = (e.nome || '').toLowerCase().includes(term);
        const cpfMatch = cleanDigits ? (e.cpf || '').replace(/\D/g, '').includes(cleanDigits) : false;
        const tituloMatch = cleanDigits ? (e.tituloEleitor || '').replace(/\D/g, '').includes(cleanDigits) : false;
        const telMatch = cleanDigits ? (e.telefone || '').replace(/\D/g, '').includes(cleanDigits) : false;
        const bairroMatch = (e.bairro || '').toLowerCase().includes(term);
        const zonaMatch = (e.zona || '').includes(term);
        const secaoMatch = (e.secao || '').includes(term);

        if (!nomeMatch && !cpfMatch && !tituloMatch && !telMatch && !bairroMatch && !zonaMatch && !secaoMatch) {
          return false;
        }
      }

      return true;
    });
  }, [
    eleitores,
    selectedZona,
    selectedSecao,
    selectedLiderPrincipalId,
    selectedSubLiderId,
    selectedBairro,
    selectedStatus,
    selectedPendencia,
    searchTerm,
    leaderByIdMap,
    conflictingVoterIds,
    conflictingCpfVoterIds,
    conflictingTituloVoterIds,
    registeredPairs
  ]);

  // Lista ordenada por nome ou zona/seção dependendo do modo
  const sortedEleitores = useMemo(() => {
    const list = [...filteredEleitores];
    if (reportMode === 'zona_secao' || reportMode === 'folha_fiscal') {
      list.sort((a, b) => {
        const zComp = Number(a.zona || 0) - Number(b.zona || 0);
        if (zComp !== 0) return zComp;
        const sComp = Number(a.secao || 0) - Number(b.secao || 0);
        if (sComp !== 0) return sComp;
        return (a.nome || '').localeCompare(b.nome || '');
      });
    } else if (reportMode === 'lider_sublider') {
      list.sort((a, b) => {
        const lComp = (a.lideranca || '').localeCompare(b.lideranca || '');
        if (lComp !== 0) return lComp;
        return (a.nome || '').localeCompare(b.nome || '');
      });
    } else {
      list.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    }
    return list;
  }, [filteredEleitores, reportMode]);

  // Paginação dos eleitores na tela (em impressão, exibe todos)
  const paginatedEleitores = useMemo(() => {
    if (pageSize === -1) return sortedEleitores;
    const startIndex = (currentPage - 1) * pageSize;
    return sortedEleitores.slice(startIndex, startIndex + pageSize);
  }, [sortedEleitores, currentPage, pageSize]);

  const totalPages = pageSize === -1 ? 1 : Math.ceil(sortedEleitores.length / pageSize) || 1;

  // Texto descritivo dos filtros ativos para o cabeçalho
  const activeFiltersSummary = useMemo(() => {
    const parts: string[] = [];
    if (selectedZona !== 'todas') parts.push(`Zona: ${selectedZona}`);
    if (selectedSecao !== 'todas') parts.push(`Seção: ${selectedSecao}`);

    if (selectedLiderPrincipalId !== 'todos') {
      const p = leaderByIdMap.get(selectedLiderPrincipalId);
      if (p) parts.push(`Líder: ${p.nome}`);
    }
    if (selectedSubLiderId !== 'todos') {
      const s = leaderByIdMap.get(selectedSubLiderId);
      if (s) parts.push(`Sub-líder: ${s.nome}`);
    }
    if (selectedBairro !== 'todos') parts.push(`Bairro: ${selectedBairro}`);
    if (selectedStatus !== 'todos') {
      parts.push(selectedStatus === 'conflito' ? 'Apenas Conflitos de CPF' : `Status: ${selectedStatus}`);
    }
    if (selectedPendencia !== 'todas') {
      const pendMap: Record<string, string> = {
        qualquer: 'Pendência: Qualquer Info',
        sem_titulo: 'Pendência: Sem Título',
        sem_cpf: 'Pendência: Sem CPF',
        sem_zona: 'Pendência: Sem Zona/Seção',
        sem_local: 'Pendência: Sem Local de Votação Cadastrado',
        sem_telefone: 'Pendência: Sem Telefone',
        sem_lideranca: 'Pendência: Sem Liderança',
        sem_bairro: 'Pendência: Sem Bairro',
        completos: 'Situação: Cadastro Completo'
      };
      parts.push(pendMap[selectedPendencia] || `Pendência: ${selectedPendencia}`);
    }
    if (searchTerm.trim()) parts.push(`Busca: "${searchTerm}"`);

    return parts.length > 0 ? parts.join('  |  ') : 'Todos os registros (Sem filtros restritivos)';
  }, [
    selectedZona,
    selectedSecao,
    selectedLiderPrincipalId,
    selectedSubLiderId,
    selectedBairro,
    selectedStatus,
    selectedPendencia,
    searchTerm,
    leaderByIdMap
  ]);

  // Título dinâmico do relatório
  const reportTitle = useMemo(() => {
    switch (reportMode) {
      case 'zona_secao':
        return 'Relatório Territorial por Zona e Seção';
      case 'lider_sublider':
        return 'Relatório de Articulação por Líder e Sub-líder';
      case 'folha_fiscal':
        return 'Caderno de Urna & Fiscais de Campo (Dia da Eleição)';
      default:
        return 'Relatório Nominal Geral de Eleitores';
    }
  }, [reportMode]);

  const campaignDisplayName = currentTenant?.nome || (subdomain && subdomain !== 'demo' ? `Campanha ${subdomain}` : 'Campanha Eleitoral 2026');

  // Limpeza de todos os filtros
  const handleResetFilters = () => {
    setSelectedZona('todas');
    setSelectedSecao('todas');
    setSelectedLiderPrincipalId('todos');
    setSelectedSubLiderId('todos');
    setSelectedBairro('todos');
    setSelectedStatus('todos');
    setSelectedPendencia('todas');
    setSearchTerm('');
    setCurrentPage(1);
  };

  // DISPARO DE IMPRESSÃO VIA NAVEGADOR
  const handlePrint = () => {
    window.print();
  };

  // EXPORTAÇÃO PDF VIA JSPDF
  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      await generateReportPDF({
        title: reportTitle,
        activeFiltersText: activeFiltersSummary,
        campaignName: campaignDisplayName,
        reportMode,
        voters: sortedEleitores,
        liderancas,
        locais,
        conflictingIds: conflictingVoterIds,
        conflictingCpfIds: conflictingCpfVoterIds,
        conflictingTituloIds: conflictingTituloVoterIds
      });
      setExportFeedback('Relatório PDF gerado com sucesso!');
      setTimeout(() => setExportFeedback(null), 3500);
    } catch (err: any) {
      alert(`Falha ao exportar PDF: ${err?.message || 'Tente novamente'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // EXPORTAÇÃO EXCEL (.XLSX)
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      await generateReportExcel({
        title: reportTitle,
        activeFiltersText: activeFiltersSummary,
        campaignName: campaignDisplayName,
        reportMode,
        voters: sortedEleitores,
        liderancas,
        locais,
        conflictingIds: conflictingVoterIds,
        conflictingCpfIds: conflictingCpfVoterIds,
        conflictingTituloIds: conflictingTituloVoterIds
      });
      setExportFeedback('Planilha Excel (.xlsx) baixada com sucesso!');
      setTimeout(() => setExportFeedback(null), 3500);
    } catch (err: any) {
      alert(`Falha ao exportar Excel: ${err?.message || 'Tente novamente'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // EXPORTAÇÃO CSV
  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      await generateReportCSV({
        title: reportTitle,
        activeFiltersText: activeFiltersSummary,
        campaignName: campaignDisplayName,
        reportMode,
        voters: sortedEleitores,
        liderancas,
        locais,
        conflictingIds: conflictingVoterIds,
        conflictingCpfIds: conflictingCpfVoterIds,
        conflictingTituloIds: conflictingTituloVoterIds
      });
      setExportFeedback('Arquivo CSV baixado com sucesso!');
      setTimeout(() => setExportFeedback(null), 3500);
    } catch (err: any) {
      alert(`Falha ao exportar CSV: ${err?.message || 'Tente novamente'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Estatísticas calculadas no filtro ativo
  const stats = useMemo(() => {
    const zonasSet = new Set<string>();
    const secoesSet = new Set<string>();
    const lideresSet = new Set<string>();
    let comTelefone = 0;
    let comTitulo = 0;
    let conflitosCount = 0;

    sortedEleitores.forEach((e) => {
      if (e.zona) zonasSet.add(e.zona.trim());
      if (e.zona && e.secao) secoesSet.add(`${e.zona}-${e.secao}`);
      if (e.lideranca) lideresSet.add(e.lideranca.trim().toLowerCase());
      if (e.telefone && e.telefone.replace(/\D/g, '').length >= 8) comTelefone++;
      if (e.tituloEleitor && e.tituloEleitor.replace(/\D/g, '').length >= 8) comTitulo++;
      if (conflictingVoterIds.has(e.id)) conflitosCount++;
    });

    return {
      total: sortedEleitores.length,
      zonasCount: zonasSet.size,
      secoesCount: secoesSet.size,
      lideresCount: lideresSet.size,
      comTelefone,
      comTitulo,
      conflitosCount
    };
  }, [sortedEleitores, conflictingVoterIds]);

  return (
    <div className={`w-full max-w-[1920px] mx-auto p-2.5 sm:p-4 flex-1 h-full flex flex-col relative ${isFocusMode ? 'space-y-2' : 'space-y-3'}`}>
      {/* ========================================================
          CABEÇALHO OFICIAL DE IMPRESSÃO (VISÍVEL APENAS NO PRINT)
          ======================================================== */}
      <div className="hidden print-only mb-6 pb-4 border-b-2 border-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-tight text-slate-950">
              {campaignDisplayName}
            </h1>
            <h2 className="text-sm font-semibold text-slate-800 mt-0.5">
              {reportTitle}
            </h2>
          </div>
          <div className="text-right text-[10px] text-slate-600 font-mono">
            <p>Emissão: {new Date().toLocaleString('pt-BR')}</p>
            <p>Operador: {currentUser?.nome || 'Coordenação de Campanha'}</p>
            <p>Total Listado: {sortedEleitores.length} eleitor(es)</p>
          </div>
        </div>
        <div className="mt-3 p-2 bg-slate-100 rounded text-[10px] text-slate-700">
          <span className="font-bold">Filtros Aplicados: </span>
          <span>{activeFiltersSummary}</span>
        </div>
      </div>

      {/* ========================================================
          TOPO INSTITUCIONAL DA TELA (OCULTO NA IMPRESSÃO)
          ======================================================== */}
      {isFocusMode ? (
        /* Barra Ultra-Compacta em Modo Foco (Máxima Área Útil para a Tabela) */
        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl px-3 py-2 flex items-center justify-between gap-3 shadow-xs shrink-0 no-print">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-secondary bg-secondary/15 px-2 py-0.5 rounded-full shrink-0">
              Modo Expandido
            </span>
            <span className="text-xs font-bold text-on-surface truncate">
              {reportTitle}
            </span>
            <span className="text-[11px] bg-surface-container px-2 py-0.5 rounded-md text-on-surface-variant font-medium shrink-0">
              {sortedEleitores.length} registros
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsFocusMode(false)}
              className="px-2.5 py-1.5 bg-surface hover:bg-surface-container border border-outline-variant text-on-surface rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Restaurar painel superior e controles completos"
            >
              <Minimize2 className="w-3.5 h-3.5 text-secondary" />
              <span>Restaurar Painel</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-2.5 py-1.5 bg-primary hover:bg-secondary text-on-primary rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Imprimir relatório"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              disabled={isExporting || sortedEleitores.length === 0}
              onClick={handleExportExcel}
              className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Exportar Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
          </div>
        </div>
      ) : (
        /* Topo Padrão Compacto com Botões Lineares */
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 no-print">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-wider bg-secondary/15 px-2 py-0.5 rounded-full">
                Inteligência & Auditoria
              </span>
              <span className="text-[11px] text-on-surface-variant">
                • Central de Relatórios Oficiais e Listagens para Campanha
              </span>
            </div>
            <h1 className="text-lg md:text-xl text-on-surface font-bold tracking-tight">
              Relatórios Eleitorais & Impressão
            </h1>
          </div>

          {/* BOTÕES DE AÇÃO LINEARES */}
          <div className="flex items-center gap-2 flex-nowrap overflow-x-auto py-0.5 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-primary hover:bg-secondary text-on-primary rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              title="Imprimir visualização em folha A4 no navegador"
            >
              <Printer className="w-3.5 h-3.5 text-primary-fixed" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              disabled={isExporting || sortedEleitores.length === 0}
              onClick={handleExportPDF}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              title="Baixar em formato PDF"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>

            <button
              type="button"
              disabled={isExporting || sortedEleitores.length === 0}
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              title="Baixar planilha formatada em Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>

            <button
              type="button"
              disabled={isExporting || sortedEleitores.length === 0}
              onClick={handleExportCSV}
              className="px-3 py-1.5 border border-outline-variant bg-surface hover:bg-surface-container text-on-surface disabled:opacity-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
              title="Baixar em formato CSV"
            >
              <Download className="w-3.5 h-3.5 text-secondary" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFocusMode(true)}
              className="px-3 py-1.5 bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/35 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
              title="Maximizar tabela para obter o maior espaço de visualização na tela"
            >
              <Maximize2 className="w-3.5 h-3.5 text-secondary" />
              <span>Maximizar Tabela</span>
            </button>
          </div>
        </div>
      )}

      {/* FEEDBACK DE EXPORTAÇÃO */}
      {exportFeedback && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-2xs animate-fadeIn no-print shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{exportFeedback}</span>
        </div>
      )}

      {/* ========================================================
          BARRA DE CONTROLE: ABAS + BUSCA + FILTROS RÁPIDOS (NO-PRINT)
          ======================================================== */}
      <div className="bg-surface-container-low p-2 rounded-xl border border-outline-variant/60 flex flex-col gap-2 shrink-0 no-print">
        {/* Linha 1: Abas de Seleção de Modelo */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setReportMode('nominal');
              setCurrentPage(1);
            }}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              reportMode === 'nominal'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>1. Nominal Geral</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setReportMode('zona_secao');
              setCurrentPage(1);
            }}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              reportMode === 'zona_secao'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>2. Por Zona & Seção</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setReportMode('lider_sublider');
              setCurrentPage(1);
            }}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              reportMode === 'lider_sublider'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>3. Por Líder & Sub-líder</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setReportMode('folha_fiscal');
              setCurrentPage(1);
            }}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              reportMode === 'folha_fiscal'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
            <span>4. Caderno de Fiscais (Dia D)</span>
          </button>
        </div>

        {/* Linha 2: Busca Rápida + Filtro Rápido de Pendência + Botão de Filtros Expansíveis + Métricas Toggle */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-outline-variant/30">
          {/* Busca por texto */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Pesquisar eleitor, CPF, título, telefone ou bairro..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-8 bg-surface border border-outline-variant/60 rounded-md pl-8 pr-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
            />
          </div>

          {/* Filtro Rápido de Informações Pendentes (Título, CPF, etc.) */}
          <select
            value={selectedPendencia}
            onChange={(e) => {
              setSelectedPendencia(e.target.value);
              setCurrentPage(1);
            }}
            className={`h-8 border rounded-md px-2 text-xs focus:outline-none focus:border-secondary transition-colors shrink-0 ${
              selectedPendencia !== 'todas'
                ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold'
                : 'bg-surface border-outline-variant/60 text-on-surface'
            }`}
            title="Filtrar eleitores por informação cadastral pendente (Título, CPF, Zona, etc.)"
          >
            <option value="todas">Situação: Todas as Informações</option>
            <option value="qualquer">⚠️ Qualquer Informação Pendente</option>
            <option value="sem_titulo">🎫 Sem Título de Eleitor</option>
            <option value="sem_cpf">📄 Sem CPF (Pendente)</option>
            <option value="sem_zona">🗳️ Sem Zona / Seção</option>
            <option value="sem_local">🏫 Sem Local de Votação Cadastrado</option>
            <option value="sem_telefone">📱 Sem Telefone / Contato</option>
            <option value="sem_lideranca">👥 Sem Liderança Vinculada</option>
            <option value="sem_bairro">📍 Sem Bairro</option>
            <option value="completos">✅ Cadastros 100% Completos</option>
          </select>

          {/* Botão de Toggle de Filtros Avançados */}
          <button
            type="button"
            onClick={() => setIsFiltersOpen((prev) => !prev)}
            className={`h-8 px-2.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
              isFiltersOpen || activeFiltersCount > 0
                ? 'bg-secondary/15 text-secondary border-secondary/35'
                : 'bg-surface hover:bg-surface-container text-on-surface border-outline-variant/60'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-secondary" />
            <span>Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-secondary text-on-secondary text-[10px] flex items-center justify-center font-black">
                {activeFiltersCount}
              </span>
            )}
            {isFiltersOpen ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
          </button>

          {/* Botão de Toggle de Indicadores/Métricas */}
          <button
            type="button"
            onClick={() => setShowMetrics((prev) => !prev)}
            className={`h-8 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer border ${
              showMetrics
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-surface hover:bg-surface-container text-on-surface-variant border-outline-variant/60'
            }`}
            title="Exibir ou ocultar barra de indicadores numéricos"
          >
            <span>{showMetrics ? 'Ocultar Indicadores' : 'Ver Indicadores'}</span>
          </button>

          {/* Botão de Limpar Filtros quando ativo */}
          {(activeFiltersCount > 0 || searchTerm.trim()) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="h-8 px-2 text-xs text-error hover:bg-error/10 rounded-md font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              title="Limpar todos os filtros aplicados"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpar</span>
            </button>
          )}

          {/* Seletor de registros por página */}
          <div className="flex items-center gap-1.5 shrink-0 text-xs text-on-surface-variant ml-auto">
            <span>Exibir:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-8 bg-surface border border-outline-variant/60 rounded-md px-2 text-xs text-on-surface focus:outline-none"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={-1}>Todos ({sortedEleitores.length})</option>
            </select>
          </div>
        </div>

        {/* Linha 3: Barra de Indicadores Compacta (Expansível) */}
        {showMetrics && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-outline-variant/30 animate-fadeIn">
            <div className="bg-surface border border-outline-variant/50 rounded-lg px-2.5 py-1.5 text-center">
              <span className="text-[10px] text-on-surface-variant uppercase font-bold block">No Filtro</span>
              <span className="text-sm font-black text-on-surface">{stats.total} <span className="text-[10px] font-normal text-on-surface-variant">/ {totalEleitores}</span></span>
            </div>
            <div className="bg-surface border border-outline-variant/50 rounded-lg px-2.5 py-1.5 text-center">
              <span className="text-[10px] text-on-surface-variant uppercase font-bold block">Zonas</span>
              <span className="text-sm font-black text-secondary">{stats.zonasCount}</span>
            </div>
            <div className="bg-surface border border-outline-variant/50 rounded-lg px-2.5 py-1.5 text-center">
              <span className="text-[10px] text-on-surface-variant uppercase font-bold block">Seções</span>
              <span className="text-sm font-black text-secondary">{stats.secoesCount}</span>
            </div>
            <div className="bg-surface border border-outline-variant/50 rounded-lg px-2.5 py-1.5 text-center">
              <span className="text-[10px] text-on-surface-variant uppercase font-bold block">Lideranças</span>
              <span className="text-sm font-black text-on-surface">{stats.lideresCount}</span>
            </div>
            <div className="bg-surface border border-outline-variant/50 rounded-lg px-2.5 py-1.5 text-center">
              <span className="text-[10px] text-on-surface-variant uppercase font-bold block">Com Contato</span>
              <span className="text-sm font-black text-emerald-700">{stats.comTelefone} <span className="text-[10px] font-normal">({stats.total > 0 ? Math.round((stats.comTelefone / stats.total) * 100) : 0}%)</span></span>
            </div>
            <div className="bg-surface border border-outline-variant/50 rounded-lg px-2.5 py-1.5 text-center">
              <span className="text-[10px] text-on-surface-variant uppercase font-bold block">Duplicidades</span>
              <span className={`text-sm font-black ${stats.conflitosCount > 0 ? 'text-error' : 'text-emerald-700'}`}>{stats.conflitosCount}</span>
            </div>
          </div>
        )}

        {/* Linha 4: Filtros Avançados Expansíveis */}
        {isFiltersOpen && (
          <div className="pt-2 border-t border-outline-variant/40 animate-fadeIn space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
              {/* 1. FILTRO ZONA */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-0.5">
                  Zona
                </label>
                <select
                  value={selectedZona}
                  onChange={(e) => {
                    setSelectedZona(e.target.value);
                    setSelectedSecao('todas');
                    setCurrentPage(1);
                  }}
                  className="w-full h-8 bg-surface border border-outline-variant/60 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary"
                >
                  <option value="todas">Todas as Zonas ({availableZonas.length})</option>
                  {availableZonas.map((z) => (
                    <option key={z} value={z}>
                      Zona {z}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. FILTRO SEÇÃO */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-0.5">
                  Seção
                </label>
                <select
                  value={selectedSecao}
                  onChange={(e) => {
                    setSelectedSecao(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full h-8 bg-surface border border-outline-variant/60 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary"
                >
                  <option value="todas">Todas as Seções ({availableSecoes.length})</option>
                  {availableSecoes.map((s) => (
                    <option key={s} value={s}>
                      Seção {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. FILTRO LIDERANÇA PRINCIPAL */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-0.5">
                  Líder Principal
                </label>
                <select
                  value={selectedLiderPrincipalId}
                  onChange={(e) => {
                    setSelectedLiderPrincipalId(e.target.value);
                    setSelectedSubLiderId('todos');
                    setCurrentPage(1);
                  }}
                  className="w-full h-8 bg-surface border border-outline-variant/60 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary"
                >
                  <option value="todos">Todos os Líderes Principais</option>
                  <option value="sem_lideranca">⚠️ Apenas Sem Liderança</option>
                  {liderancasPrincipais.map((lp) => (
                    <option key={lp.id} value={lp.id}>
                      {lp.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. FILTRO SUB-LIDERANÇA */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-0.5">
                  Sub-líder
                </label>
                <select
                  value={selectedSubLiderId}
                  onChange={(e) => {
                    setSelectedSubLiderId(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full h-8 bg-surface border border-outline-variant/60 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary"
                >
                  <option value="todos">Todas as Sub-lideranças ({availableSubLiderancas.length})</option>
                  {availableSubLiderancas.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.nome} {sub.liderancaPaiNome ? `(Sub de ${sub.liderancaPaiNome})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. FILTRO BAIRRO */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-0.5">
                  Bairro
                </label>
                <select
                  value={selectedBairro}
                  onChange={(e) => {
                    setSelectedBairro(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full h-8 bg-surface border border-outline-variant/60 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary"
                >
                  <option value="todos">Todos os Bairros ({availableBairros.length})</option>
                  {availableBairros.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* 6. FILTRO STATUS */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-0.5">
                  Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full h-8 bg-surface border border-outline-variant/60 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="conflito">⚠️ Todos os Conflitos / Duplicidades</option>
                  <option value="conflito_cpf">⚠️ Apenas Conflitos de CPF</option>
                  <option value="conflito_titulo">⚠️ Apenas Duplicidades de Título</option>
                  <option value="sem_doc">📄 Sem Documentação (CPF/Título)</option>
                  {STATUS_OPCOES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* 7. FILTRO PENDÊNCIA CADASTRAL */}
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-0.5">
                  Pendência
                </label>
                <select
                  value={selectedPendencia}
                  onChange={(e) => {
                    setSelectedPendencia(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`w-full h-8 border rounded-md px-2 text-xs focus:outline-none focus:border-secondary ${
                    selectedPendencia !== 'todas'
                      ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold'
                      : 'bg-surface border border-outline-variant/60 text-on-surface'
                  }`}
                >
                  <option value="todas">Todas as Situações</option>
                  <option value="qualquer">⚠️ Qualquer Pendência</option>
                  <option value="sem_titulo">🎫 Sem Título de Eleitor</option>
                  <option value="sem_cpf">📄 Sem CPF</option>
                  <option value="sem_zona">🗳️ Sem Zona / Seção</option>
                  <option value="sem_local">🏫 Sem Local de Votação Cadastrado</option>
                  <option value="sem_telefone">📱 Sem Telefone / Contato</option>
                  <option value="sem_lideranca">👥 Sem Liderança</option>
                  <option value="sem_bairro">📍 Sem Bairro</option>
                  <option value="completos">✅ Cadastros Completos</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Banner de Pendência Ativa no Relatório */}
        {selectedPendencia !== 'todas' && (
          <div className="px-3.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-3 text-xs text-amber-950 animate-fadeIn">
            <div className="flex items-center gap-2 font-medium">
              <span className="font-bold">⚠️ Filtro de Pendência Ativo:</span>
              <span>
                Exibindo apenas os <strong>{filteredEleitores.length}</strong> eleitores com {
                  selectedPendencia === 'qualquer' ? 'qualquer informação pendente' :
                  selectedPendencia === 'sem_titulo' ? 'Título de Eleitor não preenchido' :
                  selectedPendencia === 'sem_cpf' ? 'CPF não preenchido' :
                  selectedPendencia === 'sem_zona' ? 'Zona ou Seção não preenchida' :
                  selectedPendencia === 'sem_local' ? 'Local de Votação não cadastrado no sistema' :
                  selectedPendencia === 'sem_telefone' ? 'Telefone/WhatsApp não preenchido' :
                  selectedPendencia === 'sem_lideranca' ? 'Liderança não vinculada' :
                  selectedPendencia === 'sem_bairro' ? 'Bairro não preenchido' :
                  'cadastro completo sem pendências'
                }.
              </span>
            </div>
            <button
              onClick={() => {
                setSelectedPendencia('todas');
                setCurrentPage(1);
              }}
              className="text-xs font-bold text-amber-800 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3 h-3" /> Limpar Pendência
            </button>
          </div>
        )}
      </div>

      {/* ========================================================
          PRÉ-VISUALIZAÇÃO DA TABELA DO RELATÓRIO (ESPAÇO MAXIMIZADO)
          ======================================================== */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-xs overflow-hidden flex flex-col flex-1 min-h-[480px] print-container">
        {/* Barra superior de status do relatório */}
        <div className="px-3.5 py-2 bg-surface border-b border-outline-variant/50 flex flex-wrap items-center justify-between gap-2.5 no-print shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xs md:text-sm font-bold text-on-surface">{reportTitle}</h3>
            <span className="text-[11px] bg-secondary/15 text-secondary px-2.5 py-0.5 rounded-full font-bold">
              {sortedEleitores.length} registros
            </span>
            {activeFiltersCount > 0 && (
              <span className="text-[11px] text-on-surface-variant hidden sm:inline">
                • {activeFiltersSummary}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-on-surface-variant font-medium">
            <span>Página {currentPage} de {totalPages}</span>
            <button
              type="button"
              onClick={() => setIsFocusMode((prev) => !prev)}
              className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded transition-colors"
              title={isFocusMode ? "Sair do modo tela cheia" : "Maximizar área da tabela"}
            >
              {isFocusMode ? <Minimize2 className="w-3.5 h-3.5 text-secondary" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* TABELA DE DADOS COM SCROLL E HEADER FIXO (STICKY) */}
        <div className={`overflow-auto flex-1 ${isFocusMode ? 'max-h-[calc(100vh-140px)]' : 'max-h-[calc(100vh-270px)]'}`}>
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 shadow-2xs">
              <tr className="bg-primary text-on-primary">
                <th className="py-2.5 px-3 font-semibold text-center w-12 sticky top-0 bg-primary">#</th>

                {/* Colunas variáveis conforme o modelo */}
                {reportMode === 'zona_secao' ? (
                  <>
                    <th className="py-2.5 px-3 font-semibold text-center w-16">Zona</th>
                    <th className="py-2.5 px-3 font-semibold text-center w-16">Seção</th>
                    <th className="py-2.5 px-3 font-semibold">Local de Votação (Colégio)</th>
                    <th className="py-2.5 px-3 font-semibold">Nome do Eleitor</th>
                    <th className="py-2.5 px-3 font-semibold">CPF</th>
                    <th className="py-2.5 px-3 font-semibold">Título</th>
                    <th className="py-2.5 px-3 font-semibold">Telefone</th>
                    <th className="py-2.5 px-3 font-semibold">Bairro</th>
                    <th className="py-2.5 px-3 font-semibold">Liderança</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                  </>
                ) : reportMode === 'lider_sublider' ? (
                  <>
                    <th className="py-2.5 px-3 font-semibold">Liderança Principal</th>
                    <th className="py-2.5 px-3 font-semibold">Sub-liderança</th>
                    <th className="py-2.5 px-3 font-semibold">Nome do Eleitor</th>
                    <th className="py-2.5 px-3 font-semibold">CPF</th>
                    <th className="py-2.5 px-3 font-semibold">Telefone</th>
                    <th className="py-2.5 px-3 font-semibold">Bairro</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Zona / Seção</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Auditoria</th>
                  </>
                ) : reportMode === 'folha_fiscal' ? (
                  <>
                    <th className="py-2.5 px-3 font-semibold">Nome do Eleitor</th>
                    <th className="py-2.5 px-3 font-semibold">Título Eleitoral</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Zona / Seção</th>
                    <th className="py-2.5 px-3 font-semibold">Bairro</th>
                    <th className="py-2.5 px-3 font-semibold">Telefone</th>
                    <th className="py-2.5 px-3 font-semibold">Liderança</th>
                    <th className="py-2.5 px-3 font-semibold text-center w-36">Visto / Assinatura</th>
                  </>
                ) : (
                  <>
                    <th className="py-2.5 px-3 font-semibold">Nome do Eleitor</th>
                    <th className="py-2.5 px-3 font-semibold">CPF</th>
                    <th className="py-2.5 px-3 font-semibold">Título</th>
                    <th className="py-2.5 px-3 font-semibold">Telefone</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Zona / Seção</th>
                    <th className="py-2.5 px-3 font-semibold">Bairro</th>
                    <th className="py-2.5 px-3 font-semibold">Liderança Vinculada</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Auditoria</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40 bg-surface-container-lowest">
              {sortedEleitores.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-on-surface-variant">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-outline-variant" />
                      <p className="font-semibold text-sm text-on-surface">Nenhum eleitor encontrado no filtro</p>
                      <p className="text-xs text-on-surface-variant">
                        Modifique os filtros de zona, seção, liderança ou status para emitir o relatório.
                      </p>
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="mt-2 text-xs text-primary font-bold hover:underline cursor-pointer"
                      >
                        Limpar todos os filtros
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedEleitores.map((eleitor, index) => {
                  const globalIndex = pageSize === -1 ? index + 1 : (currentPage - 1) * pageSize + index + 1;
                  const isCpfConflict = conflictingCpfVoterIds.has(eleitor.id);
                  const isTituloConflict = conflictingTituloVoterIds.has(eleitor.id);
                  const isConflict = conflictingVoterIds.has(eleitor.id) || isCpfConflict || isTituloConflict;
                  const hasNoDoc = !eleitor.cpf && !eleitor.tituloEleitor;
                  const liderObj = eleitor.liderancaId
                    ? leaderByIdMap.get(eleitor.liderancaId)
                    : leaderByIdMap.get((eleitor.lideranca || '').trim().toLowerCase());

                  const isSub = liderObj?.tipo === 'Sub-liderança';
                  const principalLeaderName = isSub
                    ? liderObj.liderancaPaiNome || '-'
                    : liderObj?.nome || eleitor.lideranca || 'Sem Liderança';
                  const subLeaderName = isSub ? liderObj.nome : '-';

                  const zNorm = (eleitor.zona || '').padStart(3, '0');
                  const sNorm = (eleitor.secao || '').padStart(4, '0');
                  const colegio = localPorZonaSecao.get(`${zNorm}-${sNorm}`) || '-';

                  return (
                    <tr
                      key={eleitor.id}
                      className={`hover:bg-surface-container/50 transition-colors ${
                        isConflict ? 'bg-rose-50/60' : index % 2 === 1 ? 'bg-slate-50/50' : ''
                      }`}
                    >
                      <td className="py-2 px-3 text-center text-on-surface-variant font-mono text-[11px]">
                        {globalIndex}
                      </td>

                      {reportMode === 'zona_secao' ? (
                        <>
                          <td className="py-2 px-3 text-center font-bold text-on-surface font-mono">
                            {eleitor.zona || '-'}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-secondary font-mono">
                            {eleitor.secao || '-'}
                          </td>
                          <td className="py-2 px-3 text-on-surface font-medium max-w-[200px] truncate" title={colegio}>
                            {colegio}
                          </td>
                          <td className="py-2 px-3 font-semibold text-on-surface">
                            {eleitor.nome}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant font-mono text-[11px]">
                            {formatCpf(eleitor.cpf)}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant font-mono text-[11px]">
                            {eleitor.tituloEleitor ? formatTituloUtil(eleitor.tituloEleitor) : '-'}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant text-[11px]">
                            {eleitor.telefone || '-'}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant">
                            {eleitor.bairro || '-'}
                          </td>
                          <td className="py-2 px-3 text-on-surface text-[11px]">
                            <span className="font-semibold">{principalLeaderName}</span>
                            {subLeaderName !== '-' && (
                              <span className="text-secondary text-[10px] block">Sub: {subLeaderName}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-surface-container text-on-surface">
                              {eleitor.status || 'Validado'}
                            </span>
                          </td>
                        </>
                      ) : reportMode === 'lider_sublider' ? (
                        <>
                          <td className="py-2 px-3 font-bold text-on-surface">
                            {principalLeaderName}
                          </td>
                          <td className="py-2 px-3 text-secondary font-semibold text-[11px]">
                            {subLeaderName}
                          </td>
                          <td className="py-2 px-3 font-semibold text-on-surface">
                            {eleitor.nome}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant font-mono text-[11px]">
                            {formatCpf(eleitor.cpf)}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant text-[11px]">
                            {eleitor.telefone || '-'}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant">
                            {eleitor.bairro || '-'}
                          </td>
                          <td className="py-2 px-3 text-center text-on-surface font-mono text-[11px]">
                            {eleitor.zona ? `${eleitor.zona} / ${eleitor.secao}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-surface-container text-on-surface">
                              {eleitor.status || 'Validado'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            {isCpfConflict && isTituloConflict ? (
                              <span
                                className="text-[9px] bg-rose-100 text-rose-900 border border-rose-300 px-2 py-0.5 rounded-full font-black tracking-tight"
                                title="Conflito Duplo: Tanto o CPF quanto o Título de Eleitor estão duplicados na base"
                              >
                                ⚠️ DUPLO CONFLITO
                              </span>
                            ) : isCpfConflict ? (
                              <span
                                className="text-[9px] bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full font-bold"
                                title="CPF Duplicado: Este CPF já consta cadastrado para outro eleitor"
                              >
                                ⚠️ CPF DUPLICADO
                              </span>
                            ) : isTituloConflict ? (
                              <span
                                className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold"
                                title="Título Duplicado: Este Título de Eleitor já consta cadastrado para outro eleitor"
                              >
                                ⚠️ TÍTULO DUPLICADO
                              </span>
                            ) : hasNoDoc ? (
                              <span
                                className="text-[9px] bg-slate-100 text-slate-700 border border-slate-300 px-2 py-0.5 rounded-full font-medium"
                                title="Cadastro sem CPF e sem Título de Eleitor"
                              >
                                SEM DOC
                              </span>
                            ) : (
                              <span
                                className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-bold"
                                title="Registro íntegro e verificado na auditoria"
                              >
                                ✓ ÍNTEGRO
                              </span>
                            )}
                          </td>
                        </>
                      ) : reportMode === 'folha_fiscal' ? (
                        <>
                          <td className="py-2 px-3 font-bold text-on-surface">
                            {eleitor.nome}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant font-mono text-[11px]">
                            {eleitor.tituloEleitor ? formatTituloUtil(eleitor.tituloEleitor) : '-'}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-secondary font-mono">
                            {eleitor.zona ? `Z: ${eleitor.zona} / S: ${eleitor.secao}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant text-[11px]">
                            {eleitor.bairro || '-'}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant text-[11px]">
                            {eleitor.telefone || '-'}
                          </td>
                          <td className="py-2 px-3 text-on-surface text-[11px]">
                            {principalLeaderName}
                            {subLeaderName !== '-' && <span className="text-secondary text-[10px] block">Sub: {subLeaderName}</span>}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="h-6 border-b border-dashed border-slate-400 flex items-center justify-center text-[10px] text-slate-400">
                              [   ] Votou
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-3 font-semibold text-on-surface">
                            {eleitor.nome}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant font-mono text-[11px]">
                            {formatCpf(eleitor.cpf)}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant font-mono text-[11px]">
                            {eleitor.tituloEleitor ? formatTituloUtil(eleitor.tituloEleitor) : '-'}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant text-[11px]">
                            {eleitor.telefone || '-'}
                          </td>
                          <td className="py-2 px-3 text-center text-on-surface font-mono text-[11px]">
                            {eleitor.zona ? `${eleitor.zona} / ${eleitor.secao}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-on-surface-variant">
                            {eleitor.bairro || '-'}
                          </td>
                          <td className="py-2 px-3 text-on-surface text-[11px]">
                            <span className="font-semibold">{principalLeaderName}</span>
                            {subLeaderName !== '-' && (
                              <span className="text-secondary text-[10px] block">Sub: {subLeaderName}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-surface-container text-on-surface">
                              {eleitor.status || 'Validado'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            {isCpfConflict && isTituloConflict ? (
                              <span
                                className="text-[9px] bg-rose-100 text-rose-900 border border-rose-300 px-2 py-0.5 rounded-full font-black tracking-tight"
                                title="Conflito Duplo: Tanto o CPF quanto o Título de Eleitor estão duplicados na base"
                              >
                                ⚠️ DUPLO CONFLITO
                              </span>
                            ) : isCpfConflict ? (
                              <span
                                className="text-[9px] bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full font-bold"
                                title="CPF Duplicado: Este CPF já consta cadastrado para outro eleitor"
                              >
                                ⚠️ CPF DUPLICADO
                              </span>
                            ) : isTituloConflict ? (
                              <span
                                className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold"
                                title="Título Duplicado: Este Título de Eleitor já consta cadastrado para outro eleitor"
                              >
                                ⚠️ TÍTULO DUPLICADO
                              </span>
                            ) : hasNoDoc ? (
                              <span
                                className="text-[9px] bg-slate-100 text-slate-700 border border-slate-300 px-2 py-0.5 rounded-full font-medium"
                                title="Cadastro sem CPF e sem Título de Eleitor"
                              >
                                SEM DOC
                              </span>
                            ) : (
                              <span
                                className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-bold"
                                title="Registro íntegro e verificado na auditoria"
                              >
                                ✓ ÍNTEGRO
                              </span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINAÇÃO INFERIOR (NO-PRINT) */}
        {pageSize !== -1 && totalPages > 1 && (
          <div className="px-4 py-3 bg-surface border-t border-outline-variant/50 flex items-center justify-between gap-3 no-print">
            <p className="text-xs text-on-surface-variant">
              Exibindo {(currentPage - 1) * pageSize + 1} a{' '}
              {Math.min(currentPage * pageSize, sortedEleitores.length)} de {sortedEleitores.length} registros
            </p>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 border border-outline-variant/60 rounded-md bg-surface-container-lowest text-on-surface disabled:opacity-40 hover:bg-surface-container transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-semibold px-2 text-on-surface">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 border border-outline-variant/60 rounded-md bg-surface-container-lowest text-on-surface disabled:opacity-40 hover:bg-surface-container transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          RODAPÉ OFICIAL DE IMPRESSÃO (VISÍVEL APENAS NO PRINT)
          ======================================================== */}
      <div className="hidden print-only mt-8 pt-4 border-t border-slate-400 text-[10px] text-slate-500 flex justify-between">
        <span>Sistema de Gestão Eleitoral SEATI • Documento Oficial de Campanha</span>
        <span>Folha impressa para uso interno e controle de fiscais</span>
      </div>
    </div>
  );
}
