'use client';

import React, { useState, useMemo } from 'react';
import {
  Printer,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  RotateCcw,
  Users,
  MapPin,
  Award,
  CheckSquare,
  Search,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Table
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
  const [searchTerm, setSearchTerm] = useState<string>('');

  // 3. PAGINAÇÃO E CONTROLES DE VISUALIZAÇÃO
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50); // 25, 50, 100 ou -1 (todos)
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

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

      // Busca por texto
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const nomeMatch = (e.nome || '').toLowerCase().includes(term);
        const cpfMatch = (e.cpf || '').replace(/\D/g, '').includes(term.replace(/\D/g, ''));
        const tituloMatch = (e.tituloEleitor || '').replace(/\D/g, '').includes(term.replace(/\D/g, ''));
        const telMatch = (e.telefone || '').replace(/\D/g, '').includes(term.replace(/\D/g, ''));
        const bairroMatch = (e.bairro || '').toLowerCase().includes(term);
        const liderMatch = (e.lideranca || '').toLowerCase().includes(term);

        if (!nomeMatch && !cpfMatch && !tituloMatch && !telMatch && !bairroMatch && !liderMatch) {
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
    searchTerm,
    leaderByIdMap,
    conflictingVoterIds
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
    if (searchTerm.trim()) parts.push(`Busca: "${searchTerm}"`);

    return parts.length > 0 ? parts.join('  |  ') : 'Todos os registros (Sem filtros restritivos)';
  }, [
    selectedZona,
    selectedSecao,
    selectedLiderPrincipalId,
    selectedSubLiderId,
    selectedBairro,
    selectedStatus,
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
        conflictingIds: conflictingVoterIds
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
        conflictingIds: conflictingVoterIds
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
        conflictingIds: conflictingVoterIds
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
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto flex-1 h-full flex flex-col relative">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Inteligência & Auditoria
            </span>
            <span className="text-xs bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full font-medium">
              Central de Relatórios
            </span>
          </div>
          <h1 className="text-xl md:text-2xl text-on-surface font-bold tracking-tight">
            Relatórios Eleitorais & Impressão
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Visualize, filtre e exporte listagens completas por zona, seção, liderança principal e sub-lideranças.
          </p>
        </div>

        {/* BOTÕES DE AÇÃO PRINCIPAL */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 bg-primary hover:bg-secondary text-on-primary rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md hover:shadow-lg cursor-pointer"
            title="Imprimir visualização em folha A4 no navegador"
          >
            <Printer className="w-4 h-4 text-primary-fixed" />
            <span>Imprimir Relatório</span>
          </button>

          <button
            type="button"
            disabled={isExporting || sortedEleitores.length === 0}
            onClick={handleExportPDF}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            title="Baixar em formato PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Exportar PDF</span>
          </button>

          <button
            type="button"
            disabled={isExporting || sortedEleitores.length === 0}
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            title="Baixar planilha formatada em Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Exportar Excel</span>
          </button>

          <button
            type="button"
            disabled={isExporting || sortedEleitores.length === 0}
            onClick={handleExportCSV}
            className="px-3 py-2 border border-outline-variant bg-surface hover:bg-surface-container text-on-surface disabled:opacity-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            title="Baixar em formato CSV compatível com planilhas"
          >
            <Download className="w-3.5 h-3.5 text-secondary" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* FEEDBACK DE EXPORTAÇÃO */}
      {exportFeedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs animate-fadeIn no-print">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{exportFeedback}</span>
        </div>
      )}

      {/* ========================================================
          ABAS DE SELEÇÃO DO MODELO DE RELATÓRIO (NO-PRINT)
          ======================================================== */}
      <div className="bg-surface-container-low p-1.5 rounded-xl border border-outline-variant/60 flex flex-wrap gap-1.5 no-print">
        <button
          type="button"
          onClick={() => {
            setReportMode('nominal');
            setCurrentPage(1);
          }}
          className={`flex-1 min-w-[170px] py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            reportMode === 'nominal'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
          }`}
        >
          <Table className="w-4 h-4" />
          <span>1. Nominal Geral</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setReportMode('zona_secao');
            setCurrentPage(1);
          }}
          className={`flex-1 min-w-[170px] py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            reportMode === 'zona_secao'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>2. Por Zona & Seção</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setReportMode('lider_sublider');
            setCurrentPage(1);
          }}
          className={`flex-1 min-w-[170px] py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            reportMode === 'lider_sublider'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>3. Por Líder & Sub-líder</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setReportMode('folha_fiscal');
            setCurrentPage(1);
          }}
          className={`flex-1 min-w-[170px] py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            reportMode === 'folha_fiscal'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
          }`}
        >
          <CheckSquare className="w-4 h-4 text-emerald-400" />
          <span>4. Caderno de Fiscais (Dia D)</span>
        </button>
      </div>

      {/* ========================================================
          CARDS DE RESUMO E MÉTRICAS DO FILTRO (NO-PRINT)
          ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 shrink-0 no-print">
        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-3 shadow-xs">
          <p className="text-[11px] font-semibold text-on-surface-variant">Eleitores no Filtro</p>
          <p className="text-xl font-bold text-on-surface mt-0.5">
            {stats.total}{' '}
            <span className="text-xs font-normal text-on-surface-variant">/ {totalEleitores}</span>
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-3 shadow-xs">
          <p className="text-[11px] font-semibold text-on-surface-variant">Zonas Cobertas</p>
          <p className="text-xl font-bold text-secondary mt-0.5">{stats.zonasCount}</p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-3 shadow-xs">
          <p className="text-[11px] font-semibold text-on-surface-variant">Seções / Urnas</p>
          <p className="text-xl font-bold text-secondary mt-0.5">{stats.secoesCount}</p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-3 shadow-xs">
          <p className="text-[11px] font-semibold text-on-surface-variant">Lideranças</p>
          <p className="text-xl font-bold text-on-surface mt-0.5">{stats.lideresCount}</p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-3 shadow-xs">
          <p className="text-[11px] font-semibold text-on-surface-variant">Com Contato (Tel)</p>
          <p className="text-xl font-bold text-emerald-700 mt-0.5">
            {stats.comTelefone}{' '}
            <span className="text-[10px] text-on-surface-variant font-normal">
              ({stats.total > 0 ? Math.round((stats.comTelefone / stats.total) * 100) : 0}%)
            </span>
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-3 shadow-xs">
          <p className="text-[11px] font-semibold text-on-surface-variant">Duplicidades</p>
          <p className={`text-xl font-bold mt-0.5 ${stats.conflitosCount > 0 ? 'text-error' : 'text-emerald-700'}`}>
            {stats.conflitosCount}
          </p>
        </div>
      </div>

      {/* ========================================================
          PAINEL DE FILTROS PERSONALIZÁVEIS (NO-PRINT)
          ======================================================== */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 p-4 shadow-sm space-y-3 no-print">
        <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2.5">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-secondary" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface">
              Filtros Avançados de Segmentação
            </h2>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-xs text-secondary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpar Todos os Filtros</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* 1. FILTRO ZONA */}
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1">
              Zona Eleitoral
            </label>
            <select
              value={selectedZona}
              onChange={(e) => {
                setSelectedZona(e.target.value);
                setSelectedSecao('todas');
                setCurrentPage(1);
              }}
              className="w-full h-9 bg-surface border border-outline-variant/60 rounded-md px-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
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
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1">
              Seção Eleitoral
            </label>
            <select
              value={selectedSecao}
              onChange={(e) => {
                setSelectedSecao(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-9 bg-surface border border-outline-variant/60 rounded-md px-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
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
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1">
              Liderança Principal
            </label>
            <select
              value={selectedLiderPrincipalId}
              onChange={(e) => {
                setSelectedLiderPrincipalId(e.target.value);
                setSelectedSubLiderId('todos');
                setCurrentPage(1);
              }}
              className="w-full h-9 bg-surface border border-outline-variant/60 rounded-md px-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
            >
              <option value="todos">Todos os Líderes Principais</option>
              {liderancasPrincipais.map((lp) => (
                <option key={lp.id} value={lp.id}>
                  {lp.nome}
                </option>
              ))}
            </select>
          </div>

          {/* 4. FILTRO SUB-LIDERANÇA */}
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1">
              Sub-liderança
            </label>
            <select
              value={selectedSubLiderId}
              onChange={(e) => {
                setSelectedSubLiderId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-9 bg-surface border border-outline-variant/60 rounded-md px-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
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
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1">
              Bairro
            </label>
            <select
              value={selectedBairro}
              onChange={(e) => {
                setSelectedBairro(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-9 bg-surface border border-outline-variant/60 rounded-md px-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
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
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1">
              Status do Eleitor
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-9 bg-surface border border-outline-variant/60 rounded-md px-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
            >
              <option value="todos">Todos os Status</option>
              <option value="conflito">⚠️ Apenas Conflito de CPF</option>
              {STATUS_OPCOES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* CAMPO DE BUSCA RÁPIDA */}
        <div className="pt-1 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Pesquisar por nome, CPF, título, telefone, bairro ou líder..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-9 bg-surface border border-outline-variant/60 rounded-md pl-9 pr-3 text-xs text-on-surface focus:outline-none focus:border-secondary"
            />
          </div>

          {/* Seletor de registros por página */}
          <div className="flex items-center gap-1.5 shrink-0 text-xs text-on-surface-variant">
            <span>Exibir:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-9 bg-surface border border-outline-variant/60 rounded-md px-2 text-xs text-on-surface focus:outline-none"
            >
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
              <option value={-1}>Ver Todos ({sortedEleitores.length})</option>
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================
          PRÉ-VISUALIZAÇÃO DA TABELA DO RELATÓRIO
          ======================================================== */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm overflow-hidden flex flex-col flex-1 print-container">
        {/* Barra superior de status do relatório */}
        <div className="px-4 py-3 bg-surface border-b border-outline-variant/50 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-on-surface">{reportTitle}</h3>
            <span className="text-xs bg-surface-container text-on-surface px-2.5 py-0.5 rounded-full font-medium">
              {sortedEleitores.length} registros selecionados
            </span>
          </div>

          <div className="text-xs text-on-surface-variant font-medium">
            Página {currentPage} de {totalPages}
          </div>
        </div>

        {/* TABELA DE DADOS */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-primary text-on-primary">
                <th className="py-2.5 px-3 font-semibold text-center w-12">#</th>

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
                  const isConflict = conflictingVoterIds.has(eleitor.id);
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
                          <td className="py-2 px-3 text-center">
                            {isConflict ? (
                              <span className="text-[9px] bg-rose-100 text-rose-800 border border-rose-300 px-1.5 py-0.5 rounded font-bold">
                                DUPLICADO
                              </span>
                            ) : (
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-bold">
                                ÍNTEGRO
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
                          <td className="py-2 px-3 text-center">
                            {isConflict ? (
                              <span className="text-[9px] bg-rose-100 text-rose-800 border border-rose-300 px-1.5 py-0.5 rounded font-bold">
                                CONFLITO
                              </span>
                            ) : (
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-bold">
                                VÁLIDO
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
