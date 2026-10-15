'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Printer,
  BarChart3,
  PieChart,
  Users,
  Award,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
  Table as TableIcon,
  ShieldAlert,
  Vote,
  Target,
  FileSpreadsheet,
  ArrowUpRight,
  Info,
  Layers,
  PhoneCall,
  MessageSquare
} from 'lucide-react';
import {
  useCampaignData,
  useApuracao,
  Lideranca,
  Eleitor,
  normalizeZona,
  normalizeSecao,
  makeSecaoKey
} from '@/context/CampaignContext';
import { useTenant } from '@/context/TenantContext';
import { useAuth } from '@/context/AuthContext';
import { BrandLogo } from '@/components/BrandLogo';
import { SvgDonutChart, DonutSlice } from '@/components/relatorios-graficos/SvgDonutChart';
import { SvgHorizontalBarChart, HorizontalBarItem } from '@/components/relatorios-graficos/SvgHorizontalBarChart';
import { SvgGroupedBarChart, GroupedBarItem } from '@/components/relatorios-graficos/SvgGroupedBarChart';
import { SvgGaugeMeter } from '@/components/relatorios-graficos/SvgGaugeMeter';

type GraphicReportTab = 'geral' | 'liderancas' | 'territorio' | 'validacoes' | 'apuracao';

export default function RelatoriosGraficosPage() {
  const {
    eleitores,
    liderancas,
    locais,
    conflictingCpfVoterIds,
    conflictingTituloVoterIds,
    conflictingVoterIds,
    totalEleitores
  } = useCampaignData();

  const { apuracoes, apuracoesMap, metadadosGerais } = useApuracao();
  const { currentTenant, subdomain } = useTenant();
  const { systemConfig, currentUser } = useAuth();

  // 1. ABA SELECIONADA
  const [activeTab, setActiveTab] = useState<GraphicReportTab>('geral');

  // 2. FILTROS INTERATIVOS
  const [selectedZona, setSelectedZona] = useState<string>('todas');
  const [selectedBairro, setSelectedBairro] = useState<string>('todos');
  const [selectedLiderPrincipalId, setSelectedLiderPrincipalId] = useState<string>('todos');
  const [selectedSubLiderId, setSelectedSubLiderId] = useState<string>('todos');
  const [selectedStatusValidacao, setSelectedStatusValidacao] = useState<string>('todos');
  const [showTables, setShowTables] = useState<boolean>(true);

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

  // Sub-lideranças disponíveis dependendo do filtro de líder principal
  const availableSubLiderancas = useMemo(() => {
    if (selectedLiderPrincipalId === 'todos') {
      return subLiderancas;
    }
    const selectedPrincipal = leaderByIdMap.get(selectedLiderPrincipalId);
    if (!selectedPrincipal) return subLiderancas;

    return subLiderancas.filter(
      (s) =>
        s.liderancaPaiId === selectedPrincipal.id ||
        (s.liderancaPaiNome &&
          s.liderancaPaiNome.trim().toLowerCase() === selectedPrincipal.nome.trim().toLowerCase())
    );
  }, [selectedLiderPrincipalId, subLiderancas, leaderByIdMap]);

  // Listas para dropdowns de filtros
  const { availableZonas, availableBairros } = useMemo(() => {
    const zonas = new Set<string>();
    const bairros = new Set<string>();

    eleitores.forEach((e) => {
      if (e.zona) zonas.add(String(e.zona).trim());
      if (e.bairro) bairros.add(String(e.bairro).trim());
    });

    return {
      availableZonas: Array.from(zonas).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
      availableBairros: Array.from(bairros).sort((a, b) => a.localeCompare(b))
    };
  }, [eleitores]);

  // Contagem de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedZona !== 'todas') count++;
    if (selectedBairro !== 'todos') count++;
    if (selectedLiderPrincipalId !== 'todos') count++;
    if (selectedSubLiderId !== 'todos') count++;
    if (selectedStatusValidacao !== 'todos') count++;
    return count;
  }, [selectedZona, selectedBairro, selectedLiderPrincipalId, selectedSubLiderId, selectedStatusValidacao]);

  const handleResetFilters = () => {
    setSelectedZona('todas');
    setSelectedBairro('todos');
    setSelectedLiderPrincipalId('todos');
    setSelectedSubLiderId('todos');
    setSelectedStatusValidacao('todos');
  };

  // Eleitores Filtrados
  const filteredEleitores = useMemo(() => {
    return eleitores.filter((e) => {
      if (selectedZona !== 'todas' && String(e.zona).trim() !== selectedZona) return false;
      if (selectedBairro !== 'todos' && String(e.bairro).trim().toLowerCase() !== selectedBairro.toLowerCase()) return false;

      // Filtro de Liderança Principal
      if (selectedLiderPrincipalId !== 'todos') {
        const principal = leaderByIdMap.get(selectedLiderPrincipalId);
        const lNome = principal ? principal.nome.trim().toLowerCase() : '';
        const matchId = e.liderancaId === selectedLiderPrincipalId;
        const matchNome = e.lideranca && e.lideranca.trim().toLowerCase() === lNome;
        if (!matchId && !matchNome) return false;
      }

      // Filtro de Sub-liderança
      if (selectedSubLiderId !== 'todos') {
        const sub = leaderByIdMap.get(selectedSubLiderId);
        const subNome = sub ? sub.nome.trim().toLowerCase() : '';
        const matchId = e.subLiderancaId === selectedSubLiderId;
        const matchNome = e.subLideranca && e.subLideranca.trim().toLowerCase() === subNome;
        if (!matchId && !matchNome) return false;
      }

      // Filtro de Validação
      if (selectedStatusValidacao !== 'todos') {
        const status = e.statusValidacao || e.status || 'Pendente';
        if (status.trim().toLowerCase() !== selectedStatusValidacao.toLowerCase()) return false;
      }

      return true;
    });
  }, [
    eleitores,
    selectedZona,
    selectedBairro,
    selectedLiderPrincipalId,
    selectedSubLiderId,
    selectedStatusValidacao,
    leaderByIdMap
  ]);

  // -------------------------------------------------------------
  // DADOS DE APURAÇÃO, CUMPRIMENTO E QUEBRAS DE VOTOS
  // -------------------------------------------------------------
  const {
    secoesCumprimento,
    totalVotosCadastradosGeral,
    totalVotosApuradosGeral,
    totalVotosQuebradosGeral,
    totalVotosCumpridosGeral,
    secoesComQuebraCount,
    secoesCumpridasCount,
    taxaCumprimentoGeral
  } = useMemo(() => {
    // Agrupa eleitores por seção
    const secoesMap = new Map<string, { zona: string; secao: string; cadastrados: number; confirmados: number }>();

    filteredEleitores.forEach((e) => {
      const z = normalizeZona(e.zona);
      const s = normalizeSecao(e.secao);
      if (!z || !s) return;
      const key = makeSecaoKey(z, s);

      const isConf =
        e.statusValidacao === 'Confirmado' ||
        e.statusValidacao === 'Validado' ||
        e.status === 'Confirmado' ||
        e.status === 'Validado' ||
        e.status === 'Voto Certo';

      const existing = secoesMap.get(key) || { zona: z, secao: s, cadastrados: 0, confirmados: 0 };
      existing.cadastrados += 1;
      if (isConf) existing.confirmados += 1;
      secoesMap.set(key, existing);
    });

    let totalCadastrados = 0;
    let totalApurados = 0;
    let totalQuebrados = 0;
    let totalCumpridos = 0;
    let quebradasCount = 0;
    let cumpridasCount = 0;

    const list: Array<{
      key: string;
      zona: string;
      secao: string;
      cadastrados: number;
      confirmados: number;
      apurados: number;
      isApurada: boolean;
      saldo: number;
      quebra: number;
      cumprimentoPct: number;
      situacao: 'Meta Cumprida' | 'Quebra de Votos' | 'Aguardando Urna';
    }> = [];

    secoesMap.forEach((sec, key) => {
      totalCadastrados += sec.cadastrados;
      const apuracao = apuracoesMap.get(key);
      const isApurada = !!apuracao && apuracao.votosApurados !== undefined;
      const apurados = isApurada ? apuracao.votosApurados : 0;

      if (isApurada) {
        totalApurados += apurados;
        const saldo = apurados - sec.cadastrados;

        if (saldo >= 0) {
          cumpridasCount++;
          totalCumpridos += sec.cadastrados;
          list.push({
            key,
            zona: sec.zona,
            secao: sec.secao,
            cadastrados: sec.cadastrados,
            confirmados: sec.confirmados,
            apurados,
            isApurada: true,
            saldo,
            quebra: 0,
            cumprimentoPct: sec.cadastrados > 0 ? Math.round((apurados / sec.cadastrados) * 100) : 100,
            situacao: 'Meta Cumprida'
          });
        } else {
          quebradasCount++;
          const quebra = Math.abs(saldo);
          totalQuebrados += quebra;
          totalCumpridos += apurados;
          list.push({
            key,
            zona: sec.zona,
            secao: sec.secao,
            cadastrados: sec.cadastrados,
            confirmados: sec.confirmados,
            apurados,
            isApurada: true,
            saldo,
            quebra,
            cumprimentoPct: sec.cadastrados > 0 ? Math.round((apurados / sec.cadastrados) * 100) : 0,
            situacao: 'Quebra de Votos'
          });
        }
      } else {
        list.push({
          key,
          zona: sec.zona,
          secao: sec.secao,
          cadastrados: sec.cadastrados,
          confirmados: sec.confirmados,
          apurados: 0,
          isApurada: false,
          saldo: -sec.cadastrados,
          quebra: 0,
          cumprimentoPct: 0,
          situacao: 'Aguardando Urna'
        });
      }
    });

    list.sort((a, b) => b.quebra - a.quebra || b.cadastrados - a.cadastrados);

    const taxa = totalCadastrados > 0 ? Math.round((totalCumpridos / totalCadastrados) * 100) : 0;

    return {
      secoesCumprimento: list,
      totalVotosCadastradosGeral: totalCadastrados,
      totalVotosApuradosGeral: totalApurados,
      totalVotosQuebradosGeral: totalQuebrados,
      totalVotosCumpridosGeral: totalCumpridos,
      secoesComQuebraCount: quebradasCount,
      secoesCumpridasCount: cumpridasCount,
      taxaCumprimentoGeral: taxa
    };
  }, [filteredEleitores, apuracoesMap]);

  // -------------------------------------------------------------
  // DADOS DE LIDERANÇAS E SUB-LIDERANÇAS
  // -------------------------------------------------------------
  const {
    liderancasRanking,
    subLiderancasRanking,
    liderancaVsSubDonut,
    liderancaEficienciaList
  } = useMemo(() => {
    const leaderCounts = new Map<string, { nome: string; principalCount: number; validadosCount: number; subCount: number; tipo: string }>();

    filteredEleitores.forEach((e) => {
      const isConf =
        e.statusValidacao === 'Confirmado' ||
        e.statusValidacao === 'Validado' ||
        e.status === 'Confirmado' ||
        e.status === 'Validado';

      // Liderança Principal
      const lName = (e.lideranca || 'Sem Liderança Definida').trim();
      const current = leaderCounts.get(lName) || {
        nome: lName,
        principalCount: 0,
        validadosCount: 0,
        subCount: 0,
        tipo: 'Principal'
      };
      current.principalCount += 1;
      if (isConf) current.validadosCount += 1;
      leaderCounts.set(lName, current);

      // Sub-liderança (se preenchida)
      if (e.subLideranca && e.subLideranca.trim()) {
        const subName = e.subLideranca.trim();
        const currentSub = leaderCounts.get(subName) || {
          nome: subName,
          principalCount: 0,
          validadosCount: 0,
          subCount: 0,
          tipo: 'Sub-liderança'
        };
        currentSub.subCount += 1;
        leaderCounts.set(subName, currentSub);
      }
    });

    const rankingLideres: HorizontalBarItem[] = [];
    const rankingSubs: HorizontalBarItem[] = [];
    const eficienciaList: Array<{
      nome: string;
      total: number;
      validados: number;
      pctValidado: number;
      tipo: string;
    }> = [];

    leaderCounts.forEach((val) => {
      const pct = val.principalCount > 0 ? Math.round((val.validadosCount / val.principalCount) * 100) : 0;

      if (val.principalCount > 0) {
        rankingLideres.push({
          id: val.nome,
          label: val.nome,
          value: val.principalCount,
          secondaryLabel: 'Validados',
          secondaryValue: val.validadosCount,
          badge: `${pct}% auditados`,
          badgeColor: pct >= 70 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
        });

        eficienciaList.push({
          nome: val.nome,
          total: val.principalCount,
          validados: val.validadosCount,
          pctValidado: pct,
          tipo: 'Liderança Principal'
        });
      }

      if (val.subCount > 0) {
        rankingSubs.push({
          id: `sub_${val.nome}`,
          label: val.nome,
          value: val.subCount,
          color: '#80b2fe'
        });
      }
    });

    rankingLideres.sort((a, b) => b.value - a.value);
    rankingSubs.sort((a, b) => b.value - a.value);
    eficienciaList.sort((a, b) => b.total - a.total);

    // Donut: Lideranças Principais cadastradas no sistema vs Sub-lideranças
    const donutData: DonutSlice[] = [
      {
        label: 'Lideranças Principais',
        value: liderancasPrincipais.length,
        color: '#255fa5'
      },
      {
        label: 'Sub-lideranças Articuladas',
        value: subLiderancas.length,
        color: '#80b2fe'
      }
    ];

    return {
      liderancasRanking: rankingLideres,
      subLiderancasRanking: rankingSubs,
      liderancaVsSubDonut: donutData,
      liderancaEficienciaList: eficienciaList
    };
  }, [filteredEleitores, liderancasPrincipais, subLiderancas]);

  // -------------------------------------------------------------
  // DADOS DE VALIDAÇÃO E AUDITORIA DE CONTATOS
  // -------------------------------------------------------------
  const { validacaoStatusDonut, validacaoTipoBar, totalValidadosCount, taxaValidacaoGeral } = useMemo(() => {
    let confirmados = 0;
    let pendentes = 0;
    let negados = 0;
    let outros = 0;

    let tipoLigacao = 0;
    let tipoMensagem = 0;

    filteredEleitores.forEach((e) => {
      const st = (e.statusValidacao || e.status || 'Pendente').toLowerCase();

      if (st.includes('confirmado') || st.includes('validado') || st.includes('voto certo')) {
        confirmados++;
      } else if (st.includes('negado') || st.includes('recusou')) {
        negados++;
      } else if (st.includes('pendente')) {
        pendentes++;
      } else {
        outros++;
      }

      if (e.tipoValidacao === 'Ligação') tipoLigacao++;
      if (e.tipoValidacao === 'Mensagem') tipoMensagem++;
    });

    const total = filteredEleitores.length;
    const taxa = total > 0 ? Math.round((confirmados / total) * 100) : 0;

    const donut: DonutSlice[] = [
      { label: 'Confirmado / Validado', value: confirmados, color: '#10b981' },
      { label: 'Pendente de Auditoria', value: pendentes, color: '#f59e0b' },
      { label: 'Negado / Rejeitado', value: negados, color: '#ef4444' },
      { label: 'Em Contato / Outros', value: outros, color: '#6366f1' }
    ].filter((s) => s.value > 0);

    const tipoItems: HorizontalBarItem[] = [
      {
        id: 'ligacao',
        label: 'Contato por Ligação Telefônica',
        value: tipoLigacao,
        color: '#255fa5'
      },
      {
        id: 'mensagem',
        label: 'Contato por Mensagem / WhatsApp',
        value: tipoMensagem,
        color: '#10b981'
      }
    ];

    return {
      validacaoStatusDonut: donut,
      validacaoTipoBar: tipoItems,
      totalValidadosCount: confirmados,
      taxaValidacaoGeral: taxa
    };
  }, [filteredEleitores]);

  // -------------------------------------------------------------
  // DADOS TERRITORIAIS (ZONAS E BAIRROS)
  // -------------------------------------------------------------
  const { bairrosRanking, zonasDonut, zonasGrouped } = useMemo(() => {
    const bairroMap = new Map<string, number>();
    const zonaMap = new Map<string, number>();

    filteredEleitores.forEach((e) => {
      const b = (e.bairro || 'Sem Bairro').trim();
      bairroMap.set(b, (bairroMap.get(b) || 0) + 1);

      const z = (e.zona ? `Zona ${e.zona}` : 'Sem Zona').trim();
      zonaMap.set(z, (zonaMap.get(z) || 0) + 1);
    });

    const bList: HorizontalBarItem[] = [];
    bairroMap.forEach((count, bairro) => {
      bList.push({
        id: bairro,
        label: bairro,
        value: count,
        color: '#0284c7'
      });
    });
    bList.sort((a, b) => b.value - a.value);

    const zList: DonutSlice[] = [];
    const zGroupedList: GroupedBarItem[] = [];
    const colors = ['#0a2540', '#255fa5', '#38bdf8', '#818cf8', '#34d399', '#f59e0b'];
    let cIdx = 0;

    zonaMap.forEach((count, zona) => {
      zList.push({
        label: zona,
        value: count,
        color: colors[cIdx % colors.length]
      });

      // Comparativo com apuração nesta zona
      const zonaDigits = zona.replace(/\D/g, '');
      let apuradosNaZona = 0;
      apuracoes.forEach((ap) => {
        if (normalizeZona(ap.zona) === zonaDigits) {
          apuradosNaZona += ap.votosApurados || 0;
        }
      });

      zGroupedList.push({
        id: zona,
        category: zona,
        val1: count,
        val2: apuradosNaZona
      });

      cIdx++;
    });

    zList.sort((a, b) => b.value - a.value);

    return {
      bairrosRanking: bList,
      zonasDonut: zList,
      zonasGrouped: zGroupedList
    };
  }, [filteredEleitores, apuracoes]);

  // -------------------------------------------------------------
  // DADOS DE QUEBRAS DE VOTOS E CUMPRIMENTO COMPARATIVO
  // -------------------------------------------------------------
  const { quebrasPorLiderancaRanking, comparativoCumprimentoGrouped } = useMemo(() => {
    // Quebras atribuídas à liderança: se a seção quebrou, quanto cada líder tinha lá
    const quebraLiderMap = new Map<string, { nome: string; perda: number; totalPrometido: number }>();

    secoesCumprimento.forEach((sec) => {
      if (sec.situacao === 'Quebra de Votos' && sec.quebra > 0) {
        // Encontrar eleitores desta seção
        const eleitoresDaSecao = filteredEleitores.filter((e) => {
          return normalizeZona(e.zona) === sec.zona && normalizeSecao(e.secao) === sec.secao;
        });

        eleitoresDaSecao.forEach((el) => {
          const lNome = (el.lideranca || 'Sem Liderança').trim();
          const cur = quebraLiderMap.get(lNome) || { nome: lNome, perda: 0, totalPrometido: 0 };
          cur.totalPrometido += 1;
          // Distribui a quebra proporcionalmente
          cur.perda += sec.quebra / Math.max(1, eleitoresDaSecao.length);
          quebraLiderMap.set(lNome, cur);
        });
      }
    });

    const quebrasLider: HorizontalBarItem[] = [];
    quebraLiderMap.forEach((item) => {
      const roundedLoss = Math.round(item.perda);
      if (roundedLoss > 0) {
        quebrasLider.push({
          id: item.nome,
          label: item.nome,
          value: roundedLoss,
          color: '#ef4444',
          secondaryLabel: 'Base Cadastrada',
          secondaryValue: item.totalPrometido,
          badge: `-${roundedLoss} votos`,
          badgeColor: 'bg-red-50 text-red-700 border-red-200'
        });
      }
    });
    quebrasLider.sort((a, b) => b.value - a.value);

    // Top 10 seções no gráfico de comparação lado a lado
    const grouped: GroupedBarItem[] = secoesCumprimento
      .filter((s) => s.isApurada)
      .slice(0, 10)
      .map((s) => ({
        id: s.key,
        category: `Z${s.zona} S${s.secao}`,
        val1: s.cadastrados,
        val2: s.apurados,
        val3: s.quebra > 0 ? s.quebra : undefined
      }));

    return {
      quebrasPorLiderancaRanking: quebrasLider,
      comparativoCumprimentoGrouped: grouped
    };
  }, [secoesCumprimento, filteredEleitores]);

  // Donut de Situação de Cumprimento
  const situacaoCumprimentoDonut: DonutSlice[] = useMemo(() => {
    return [
      {
        label: 'Meta Cumprida / Superada',
        value: secoesCumpridasCount,
        color: '#10b981'
      },
      {
        label: 'Quebra de Votos Detectada',
        value: secoesComQuebraCount,
        color: '#ef4444'
      },
      {
        label: 'Aguardando Apuração Urna',
        value: secoesCumprimento.length - (secoesCumpridasCount + secoesComQuebraCount),
        color: '#94a3b8'
      }
    ].filter((s) => s.value > 0);
  }, [secoesCumpridasCount, secoesComQuebraCount, secoesCumprimento.length]);

  // Meta de votos da campanha
  const metaVotosCampanha = Number(systemConfig.metaVotos) || Number(systemConfig.metaTotalVotos) || 6000;
  const campaignName = systemConfig.nomeCampanha || currentTenant?.nome || 'Campanha Eleitoral';
  const candidatoTitle = systemConfig.candidatoNome
    ? `${systemConfig.candidatoNome} (${systemConfig.cargoDisputado || 'Candidato'})`
    : 'Coordenação Geral da Campanha';

  // Disparar Impressão
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16">
      {/* ========================================================
          CABEÇALHO OFICIAL DE IMPRESSÃO (Visível apenas na impressão)
          ======================================================== */}
      <div className="hidden print:block print:w-full print:mb-6 border-b-2 border-slate-900 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo size="md" className="shrink-0" />
            <div>
              <h1 className="text-xl font-bold font-display text-slate-950 uppercase tracking-tight">
                {campaignName}
              </h1>
              <p className="text-sm font-semibold text-slate-700">
                {candidatoTitle}
              </p>
              <p className="text-xs text-slate-500">
                Relatório Gerencial Gráfico & Analítico • Base: {subdomain || 'Principal'}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p className="font-semibold text-slate-900">SEATI GESTÃO ELEITORAL</p>
            <p>Emitido em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="text-[11px] text-slate-500">Operador: {currentUser?.nome || 'Administração'}</p>
          </div>
        </div>

        {/* Linha de Filtros Aplicados na Impressão */}
        <div className="mt-3 pt-2 border-t border-slate-200 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
          <span><strong>Módulo:</strong> {activeTab.toUpperCase()}</span>
          <span><strong>Zona:</strong> {selectedZona}</span>
          <span><strong>Bairro:</strong> {selectedBairro}</span>
          <span><strong>Liderança:</strong> {selectedLiderPrincipalId === 'todos' ? 'Todas' : (leaderByIdMap.get(selectedLiderPrincipalId)?.nome || selectedLiderPrincipalId)}</span>
          <span><strong>Sub-liderança:</strong> {selectedSubLiderId === 'todos' ? 'Todas' : (leaderByIdMap.get(selectedSubLiderId)?.nome || selectedSubLiderId)}</span>
          <span><strong>Status:</strong> {selectedStatusValidacao}</span>
        </div>
      </div>

      {/* ========================================================
          BARRA DE TOPO DA TELA (Oculta na Impressão)
          ======================================================== */}
      <header className="no-print bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Título e Subtítulo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-900 text-white flex items-center justify-center shadow-sm shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-bold font-display text-slate-900">
                    Relatórios Gráficos & Desempenho
                  </h1>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Pronto para Impressão
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Análise visual completa: Lideranças, Quantidades de Votos, Validações e Quebras de Votos
                </p>
              </div>
            </div>

            {/* Ações Rápidas de Impressão e Navegação */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/relatorios"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                title="Ir para relatórios tabulares em Excel e PDF"
              >
                <TableIcon className="w-3.5 h-3.5 text-slate-500" />
                Relatórios em Tabela
              </Link>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 active:scale-95 rounded-lg shadow-sm transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Imprimir Relatório Gráfico
              </button>
            </div>
          </div>

          {/* Abas de Navegação dos Relatórios */}
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setActiveTab('geral')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'geral'
                  ? 'bg-blue-50 text-blue-800 border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Visão Geral Executiva
            </button>

            <button
              onClick={() => setActiveTab('liderancas')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'liderancas'
                  ? 'bg-blue-50 text-blue-800 border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              Lideranças e Sub-lideranças
            </button>

            <button
              onClick={() => setActiveTab('territorio')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'territorio'
                  ? 'bg-blue-50 text-blue-800 border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Quantidades & Território
            </button>

            <button
              onClick={() => setActiveTab('validacoes')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'validacoes'
                  ? 'bg-blue-50 text-blue-800 border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Validações & Auditoria
            </button>

            <button
              onClick={() => setActiveTab('apuracao')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'apuracao'
                  ? 'bg-blue-50 text-blue-800 border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Vote className="w-3.5 h-3.5" />
              Cumprimento & Quebra de Votos
            </button>

            <div className="ml-auto pl-2 flex items-center gap-2 shrink-0">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showTables}
                  onChange={(e) => setShowTables(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                Tabelas Analíticas
              </label>
            </div>
          </div>
        </div>
      </header>

      {/* ========================================================
          PAINEL DE FILTROS INTERATIVOS (Oculto na Impressão)
          ======================================================== */}
      <section className="no-print max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2">
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-700 shrink-0" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Filtros do Relatório
              </span>
              {activeFiltersCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Dropdowns de Filtro */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 flex-1 lg:max-w-4xl">
              {/* Zona */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Zona Eleitoral
                </label>
                <select
                  value={selectedZona}
                  onChange={(e) => setSelectedZona(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="todas">Todas as Zonas</option>
                  {availableZonas.map((z) => (
                    <option key={z} value={z}>
                      Zona {z}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bairro */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Bairro
                </label>
                <select
                  value={selectedBairro}
                  onChange={(e) => setSelectedBairro(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="todos">Todos os Bairros</option>
                  {availableBairros.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* Liderança Principal */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Liderança Principal
                </label>
                <select
                  value={selectedLiderPrincipalId}
                  onChange={(e) => {
                    setSelectedLiderPrincipalId(e.target.value);
                    setSelectedSubLiderId('todos');
                  }}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="todos">Todas Lideranças</option>
                  {liderancasPrincipais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sub-liderança */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Sub-liderança
                </label>
                <select
                  value={selectedSubLiderId}
                  onChange={(e) => setSelectedSubLiderId(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="todos">Todas Sub-lideranças</option>
                  {availableSubLiderancas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status de Validação */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Status de Validação
                </label>
                <select
                  value={selectedStatusValidacao}
                  onChange={(e) => setSelectedStatusValidacao(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="Confirmado">Confirmado / Validado</option>
                  <option value="Pendente">Pendente de Contato</option>
                  <option value="Negado">Negado / Rejeitado</option>
                  <option value="Contatado aguardando retorno">Aguardando Retorno</option>
                </select>
              </div>
            </div>

            {/* Reset */}
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer self-end lg:self-center"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpar
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================
          ÁREA PRINCIPAL DE RELATÓRIO IMPRIMÍVEL
          ID para casar com estilos @media print do globals.css
          ======================================================== */}
      <main id="printable-relatorio-area" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 space-y-6">
        {/* ========================================================
            BLOCO 1: KPIS EXECUTIVOS EM DESTAQUE (Sempre visível)
            ======================================================== */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Votos Cadastrados */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Votos Cadastrados</span>
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900">
                {filteredEleitores.length.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {Math.round((filteredEleitores.length / Math.max(1, metaVotosCampanha)) * 100)}% da meta
              </span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((filteredEleitores.length / Math.max(1, metaVotosCampanha)) * 100))}%`
                }}
              />
            </div>
          </div>

          {/* Card 2: Lideranças Articuladas */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Lideranças Ativas</span>
              <Award className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900">
                {(liderancasPrincipais.length + subLiderancas.length).toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-slate-500">
                {liderancasPrincipais.length} princ. • {subLiderancas.length} subs
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 truncate">
              {liderancasRanking.length} líderes com eleitores cadastrados
            </p>
          </div>

          {/* Card 3: Validação de Votos */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Votos Auditados</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900">
                {totalValidadosCount.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs font-bold font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                {taxaValidacaoGeral}% confirmados
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Taxa de segurança e fidelidade da base eleitoral
            </p>
          </div>

          {/* Card 4: Apuração & Quebra de Votos */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Votos na Urna</span>
              <Vote className="w-4 h-4 text-purple-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900">
                {totalVotosApuradosGeral.toLocaleString('pt-BR')}
              </span>
              {totalVotosQuebradosGeral > 0 ? (
                <span className="text-xs font-bold font-mono text-red-700 bg-red-50 px-1.5 py-0.5 rounded" title="Votos prometidos não encontrados nas urnas">
                  -{totalVotosQuebradosGeral} quebra
                </span>
              ) : (
                <span className="text-xs font-bold font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                  {taxaCumprimentoGeral}% conver.
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {secoesCumpridasCount} seções cumpridas • {secoesComQuebraCount} com quebra
            </p>
          </div>
        </section>

        {/* ========================================================
            SEÇÃO DE GRÁFICOS: VISÃO GERAL OU MÓDULO ESPECÍFICO
            ======================================================== */}

        {/* --- ABA 1: VISÃO GERAL EXECUTIVA --- */}
        {(activeTab === 'geral' || typeof window === 'undefined') && (
          <div className="space-y-6">
            {/* Linha 1 de Gráficos: Meta Geral + Status de Validação + Situação de Cumprimento */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card A: Meta da Campanha */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-700" />
                    Meta Global de Votos
                  </h3>
                  <span className="text-[11px] font-mono font-medium text-slate-500">
                    Alvo Oficial
                  </span>
                </div>
                <SvgGaugeMeter
                  current={filteredEleitores.length}
                  target={metaVotosCampanha}
                  title="Progresso de Mobilização"
                  subtitle="Votos Cadastrados no Sistema"
                  color="#255fa5"
                  size={190}
                />
              </div>

              {/* Card B: Donut de Validações */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Status das Validações
                  </h3>
                  <span className="text-[11px] font-mono font-medium text-slate-500">
                    {filteredEleitores.length} Eleitores
                  </span>
                </div>
                <SvgDonutChart
                  data={validacaoStatusDonut}
                  size={180}
                  thickness={28}
                  centerTitle={totalValidadosCount.toLocaleString('pt-BR')}
                  centerSubtitle="Confirmados"
                  legendPosition="bottom"
                />
              </div>

              {/* Card C: Donut de Cumprimento de Votos e Quebras */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Vote className="w-4 h-4 text-purple-600" />
                    Cumprimento & Quebra
                  </h3>
                  <span className="text-[11px] font-mono font-medium text-slate-500">
                    {secoesCumprimento.length} Seções
                  </span>
                </div>
                <SvgDonutChart
                  data={situacaoCumprimentoDonut}
                  size={180}
                  thickness={28}
                  centerTitle={taxaCumprimentoGeral + '%'}
                  centerSubtitle="Conversão"
                  legendPosition="bottom"
                />
              </div>
            </div>

            {/* Linha 2 de Gráficos: Ranking de Lideranças + Distribuição Territorial */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 break-inside-avoid">
              {/* Top Lideranças */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-blue-700" />
                    <h3 className="text-sm font-bold text-slate-800">
                      Top Lideranças por Quantidade de Votos
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Total e Validados
                  </span>
                </div>
                <SvgHorizontalBarChart
                  data={liderancasRanking}
                  maxItemsToShow={7}
                  valueSuffix="votos"
                  barColor="#255fa5"
                  emptyText="Nenhuma liderança cadastrada para os filtros selecionados"
                />
              </div>

              {/* Top Bairros */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-sky-600" />
                    <h3 className="text-sm font-bold text-slate-800">
                      Top Bairros com Maior Volume de Eleitores
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Concentração Territorial
                  </span>
                </div>
                <SvgHorizontalBarChart
                  data={bairrosRanking}
                  maxItemsToShow={7}
                  valueSuffix="eleitores"
                  barColor="#0284c7"
                  emptyText="Nenhum bairro cadastrado"
                />
              </div>
            </div>

            {/* Linha 3 de Gráficos: Comparativo Cadastrados vs Urna nas Seções */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs break-inside-avoid">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-700" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      Comparativo de Votos: Cadastrados (Prometidos) vs Apurados na Urna
                    </h3>
                    <p className="text-xs text-slate-500">
                      Acompanhamento por seção eleitoral apurada (saldo positivo = meta superada, saldo negativo = quebra)
                    </p>
                  </div>
                </div>
              </div>
              <SvgGroupedBarChart
                data={comparativoCumprimentoGrouped}
                label1="Prometidos (Cadastrados)"
                label2="Apurados na Urna"
                label3="Quebra"
                color1="#255fa5"
                color2="#10b981"
                color3="#ef4444"
                height={230}
                emptyText="Nenhuma seção com apuração de urna registrada. Importe um boletim de urna ou arquivo do TSE em Cumprimento de Votos."
              />
            </div>
          </div>
        )}

        {/* --- ABA 2: LIDERANÇAS E SUB-LIDERANÇAS --- */}
        {activeTab === 'liderancas' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Donut Proporção Liderança vs Sub-liderança */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                <div className="border-b border-slate-100 pb-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Award className="w-4 h-4 text-blue-700" />
                    Estrutura de Lideranças
                  </h3>
                  <p className="text-xs text-slate-500">
                    Proporção de Lideranças Principais e Sub-lideranças
                  </p>
                </div>
                <SvgDonutChart
                  data={liderancaVsSubDonut}
                  size={190}
                  thickness={30}
                  centerTitle={(liderancasPrincipais.length + subLiderancas.length).toString()}
                  centerSubtitle="Líderes"
                  legendPosition="bottom"
                />
              </div>

              {/* Ranking Completo de Lideranças Principais */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-700" />
                    Ranking de Lideranças por Eleitores Trazidos
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    Total + Auditoria
                  </span>
                </div>
                <SvgHorizontalBarChart
                  data={liderancasRanking}
                  maxItemsToShow={10}
                  valueSuffix="eleitores"
                  barColor="#255fa5"
                />
              </div>
            </div>

            {/* Sub-lideranças mais ativas */}
            {subLiderancasRanking.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Award className="w-4 h-4 text-sky-600" />
                    Ranking de Sub-lideranças Articuladas
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    {subLiderancasRanking.length} ativas
                  </span>
                </div>
                <SvgHorizontalBarChart
                  data={subLiderancasRanking}
                  maxItemsToShow={10}
                  valueSuffix="eleitores"
                  barColor="#80b2fe"
                />
              </div>
            )}

            {/* Tabela de Eficiência de Liderança */}
            {showTables && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs break-inside-avoid">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <TableIcon className="w-4 h-4 text-slate-600" />
                    Relatório Analítico de Desempenho por Liderança
                  </h4>
                  <span className="text-xs text-slate-500 font-mono">
                    {liderancaEficienciaList.length} lideranças listadas
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 font-semibold">Liderança</th>
                        <th className="py-2 px-3 font-semibold">Categoria</th>
                        <th className="py-2 px-3 font-semibold text-right">Cadastrados</th>
                        <th className="py-2 px-3 font-semibold text-right">Validados</th>
                        <th className="py-2 px-3 font-semibold text-right">% Validação</th>
                        <th className="py-2 px-3 font-semibold text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {liderancaEficienciaList.slice(0, 25).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 font-sans font-medium text-slate-900">{item.nome}</td>
                          <td className="py-2 px-3 font-sans text-slate-600">{item.tipo}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">{item.total.toLocaleString('pt-BR')}</td>
                          <td className="py-2 px-3 text-right text-emerald-700 font-bold">{item.validados.toLocaleString('pt-BR')}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-700">{item.pctValidado}%</td>
                          <td className="py-2 px-3 text-center font-sans">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              item.pctValidado >= 70
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.pctValidado >= 40
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {item.pctValidado >= 70 ? 'Forte' : item.pctValidado >= 40 ? 'Regular' : 'A Auditar'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- ABA 3: TERRITÓRIO E QUANTIDADES DE VOTOS --- */}
        {activeTab === 'territorio' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Donut de Zonas Eleitorais */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                <div className="border-b border-slate-100 pb-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-blue-700" />
                    Distribuição por Zona Eleitoral
                  </h3>
                  <p className="text-xs text-slate-500">
                    Proporção do eleitorado por Zona
                  </p>
                </div>
                <SvgDonutChart
                  data={zonasDonut}
                  size={190}
                  thickness={30}
                  centerTitle={filteredEleitores.length.toLocaleString('pt-BR')}
                  centerSubtitle="Eleitores"
                  legendPosition="bottom"
                />
              </div>

              {/* Ranking de Bairros */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-sky-600" />
                    Votos por Bairro (Concentração Eleitoral)
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    Top 15 Bairros
                  </span>
                </div>
                <SvgHorizontalBarChart
                  data={bairrosRanking}
                  maxItemsToShow={15}
                  valueSuffix="votos"
                  barColor="#0284c7"
                />
              </div>
            </div>

            {/* Comparativo de Votos Cadastrados vs Votos Apurados por Zona */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-700" />
                  Comparativo por Zona: Prometidos x Apurados na Urna
                </h3>
              </div>
              <SvgGroupedBarChart
                data={zonasGrouped}
                label1="Eleitores Cadastrados"
                label2="Votos Apurados na Urna"
                color1="#255fa5"
                color2="#10b981"
                height={200}
                emptyText="Nenhum dado por zona disponível"
              />
            </div>
          </div>
        )}

        {/* --- ABA 4: VALIDAÇÕES & AUDITORIA --- */}
        {activeTab === 'validacoes' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Donut de Status */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="border-b border-slate-100 pb-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Situação da Validação da Base
                  </h3>
                  <p className="text-xs text-slate-500">
                    Confirmação direta de intenção de voto do eleitor
                  </p>
                </div>
                <SvgDonutChart
                  data={validacaoStatusDonut}
                  size={200}
                  thickness={32}
                  centerTitle={taxaValidacaoGeral + '%'}
                  centerSubtitle="Taxa Confirmada"
                  legendPosition="right"
                />
              </div>

              {/* Canal de Validação (Ligação x Mensagem) */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="border-b border-slate-100 pb-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-blue-700" />
                    Canais de Contato Empregados
                  </h3>
                  <p className="text-xs text-slate-500">
                    Distribuição dos métodos de validação aplicados
                  </p>
                </div>
                <SvgHorizontalBarChart
                  data={validacaoTipoBar}
                  valueSuffix="contatos"
                  barColor="#255fa5"
                />
              </div>
            </div>

            {/* Painel de Auditoria de Conflitos (Alertas de Risco de Quebra) */}
            <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-amber-100 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Auditoria de Conflitos e Duplicidades na Base
                    </h3>
                    <p className="text-xs text-slate-500">
                      Eleitores cadastrados por múltiplas lideranças gerando falsa expectativa de votos
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  conflictingVoterIds.size > 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {conflictingVoterIds.size} Eleitores em Conflito
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-amber-50/60 rounded-lg p-3 border border-amber-200/60">
                  <span className="text-[11px] font-bold text-amber-800 uppercase">Conflitos de CPF</span>
                  <p className="text-xl font-bold font-mono text-slate-900 mt-1">{conflictingCpfVoterIds.size}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Mesmo CPF atribuído a diferentes pessoas ou líderes</p>
                </div>

                <div className="bg-amber-50/60 rounded-lg p-3 border border-amber-200/60">
                  <span className="text-[11px] font-bold text-amber-800 uppercase">Conflitos de Título</span>
                  <p className="text-xl font-bold font-mono text-slate-900 mt-1">{conflictingTituloVoterIds.size}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Título eleitoral compartilhado na base</p>
                </div>

                <div className="bg-amber-50/60 rounded-lg p-3 border border-amber-200/60">
                  <span className="text-[11px] font-bold text-amber-800 uppercase">Risco de Quebra Previsto</span>
                  <p className="text-xl font-bold font-mono text-red-700 mt-1">~{conflictingVoterIds.size} votos</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Votos duplicados que só existirão uma vez na urna</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- ABA 5: APURAÇÃO, CUMPRIMENTO & QUEBRAS DE VOTOS --- */}
        {activeTab === 'apuracao' && (
          <div className="space-y-6">
            {/* Linha 1: Gráficos de Quebra de Votos por Liderança + Donut de Situação */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Donut Cumprimento das Seções */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                <div className="border-b border-slate-100 pb-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-purple-700" />
                    Situação das Seções Apuradas
                  </h3>
                  <p className="text-xs text-slate-500">
                    Metas atingidas x Quebras detectadas nas urnas
                  </p>
                </div>
                <SvgDonutChart
                  data={situacaoCumprimentoDonut}
                  size={190}
                  thickness={30}
                  centerTitle={secoesCumpridasCount + '/' + Math.max(1, secoesCumpridasCount + secoesComQuebraCount)}
                  centerSubtitle="Cumpridas"
                  legendPosition="bottom"
                />
              </div>

              {/* Ranking de Quebras por Liderança */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-red-700 flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-red-600" />
                      Maiores Quebras de Votos por Liderança
                    </h3>
                    <p className="text-xs text-slate-500">
                      Saldo negativo onde a promessa de votos não se confirmou na apuração da urna
                    </p>
                  </div>
                  <span className="text-xs font-bold text-red-700 font-mono">
                    Total: -{totalVotosQuebradosGeral} votos
                  </span>
                </div>
                <SvgHorizontalBarChart
                  data={quebrasPorLiderancaRanking}
                  maxItemsToShow={10}
                  valueSuffix="votos perdidos"
                  barColor="#ef4444"
                  emptyText="Nenhuma quebra de voto registrada nas seções apuradas."
                />
              </div>
            </div>

            {/* Comparativo de Barras Lado a Lado por Seção */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Vote className="w-4 h-4 text-purple-700" />
                  Auditoria de Seções: Cadastrados (Prometidos) vs Apurados na Urna
                </h3>
              </div>
              <SvgGroupedBarChart
                data={comparativoCumprimentoGrouped}
                label1="Prometidos (Cadastrados)"
                label2="Apurados na Urna"
                label3="Quebra"
                color1="#255fa5"
                color2="#10b981"
                color3="#ef4444"
                height={230}
              />
            </div>

            {/* Tabela de Detalhamento das Seções com Quebra */}
            {showTables && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs break-inside-avoid">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <TableIcon className="w-4 h-4 text-slate-600" />
                    Relatório Analítico de Quebra de Votos por Seção Eleitoral
                  </h4>
                  <span className="text-xs text-slate-500 font-mono">
                    {secoesCumprimento.filter((s) => s.situacao === 'Quebra de Votos').length} seções com déficit
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 font-semibold">Zona / Seção</th>
                        <th className="py-2 px-3 font-semibold text-right">Cadastrados</th>
                        <th className="py-2 px-3 font-semibold text-right">Confirmados</th>
                        <th className="py-2 px-3 font-semibold text-right">Votos na Urna</th>
                        <th className="py-2 px-3 font-semibold text-right">Saldo / Quebra</th>
                        <th className="py-2 px-3 font-semibold text-right">% Conversão</th>
                        <th className="py-2 px-3 font-semibold text-center">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {secoesCumprimento
                        .filter((s) => s.isApurada)
                        .slice(0, 30)
                        .map((sec, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2 px-3 font-sans font-bold text-slate-900">
                              Zona {sec.zona} • Seção {sec.secao}
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-slate-800">
                              {sec.cadastrados}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-600">
                              {sec.confirmados}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-purple-700">
                              {sec.apurados}
                            </td>
                            <td className={`py-2 px-3 text-right font-bold ${
                              sec.saldo >= 0 ? 'text-emerald-700' : 'text-red-700'
                            }`}>
                              {sec.saldo >= 0 ? `+${sec.saldo}` : sec.saldo}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-700">
                              {sec.cumprimentoPct}%
                            </td>
                            <td className="py-2 px-3 text-center font-sans">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                                sec.situacao === 'Meta Cumprida'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : sec.situacao === 'Quebra de Votos'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {sec.situacao}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            RODAPÉ OFICIAL DE IMPRESSÃO
            ======================================================== */}
        <footer className="mt-8 pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
          <p className="font-semibold text-slate-700">
            SEATI • Sistema Eleitoral & Articulação Territorial Integrada
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Documento analítico e confidencial gerado eletronicamente para fins de coordenação de campanha eleitoral.
          </p>
        </footer>
      </main>
    </div>
  );
}
