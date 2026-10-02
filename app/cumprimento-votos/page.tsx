'use client';

import React, { useState, useMemo } from 'react';
import {
  Vote,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Users,
  Award,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Upload,
  Save,
  X,
  MapPin,
  TrendingUp,
  TrendingDown,
  Check,
  Camera
} from 'lucide-react';
import {
  useCampaignData,
  useApuracao,
  Eleitor,
  Lideranca,
  normalizeZona,
  normalizeSecao,
  makeSecaoKey
} from '@/context/CampaignContext';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { TseCsvImporterModal } from '@/components/TseCsvImporterModal';
import { BuQrCodeScannerModal } from '@/components/BuQrCodeScannerModal';

// Som sutil de confirmação de voto lançado
function playVoteChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.1); // G5
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.start();
    osc.stop(ctx.currentTime + 0.23);
  } catch {}
}

export interface SecaoAgrupada {
  key: string;
  zona: string;
  secao: string;
  localNome: string;
  bairro: string;
  eleitores: Eleitor[];
  totalCadastrados: number;
  totalConfirmados: number;
  votosApurados?: number;
  isApurada: boolean;
  cumprimentoPct: number; // % sobre cadastrados
  cumprimentoConfirmadosPct: number; // % sobre confirmados
  saldo: number; // votosApurados - totalCadastrados
  liderancasCount: number;
  liderancasMap: Map<string, { nome: string; count: number }>;
  boletimUrna?: string;
  observacoes?: string;
  dataApuracao?: string;
  apuradoPor?: string;
}

export interface LiderancaDesempenho {
  id: string;
  nome: string;
  tipo?: string;
  liderancaPaiNome?: string;
  totalEleitoresPrometidos: number;
  secoesAtuadas: number;
  votosApuradosTotalSecoes: number;
  saldoEstimado: number;
  cumprimentoMedioPct: number;
  classificacao: 'Alta Fidelidade' | 'Dentro da Meta' | 'Abaixo da Meta' | 'Sem Apuração';
}

export default function CumprimentoVotosPage() {
  const { eleitores, liderancas, locais } = useCampaignData();
  const { apuracoes, apuracoesMap, salvarApuracaoSecao, removerApuracaoSecao, importarLoteApuracao } = useApuracao();

  // Abas: "secoes" (Análise por Seção) ou "liderancas" (Auditoria por Liderança)
  const [activeTab, setActiveTab] = useState<'secoes' | 'liderancas'>('secoes');

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusApuracaoFilter, setStatusApuracaoFilter] = useState<'todos' | 'apuradas' | 'pendentes' | 'superaram' | 'abaixo'>('todos');
  const [zonaFilter, setZonaFilter] = useState('todas');
  const [bairroFilter, setBairroFilter] = useState('todos');
  const [liderancaFilter, setLiderancaFilter] = useState('todas');

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Edição inline rápida de votos por seção (armazena valores em edição antes de salvar)
  const [editingVotes, setEditingVotes] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  // Modal de Detalhes da Seção
  const [selectedSecao, setSelectedSecao] = useState<SecaoAgrupada | null>(null);

  // Modais de Importação
  const [isTseModalOpen, setIsTseModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchRawText, setBatchRawText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Toast Feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Mapa de Locais de Votação por Zona e Seção
  const locaisPorSecao = useMemo(() => {
    const map = new Map<string, { nome: string; bairro: string }>();

    locais.forEach((loc) => {
      const zNorm = normalizeZona(loc.zona);
      // Se tiver secao única
      if (loc.secao) {
        const sNorm = normalizeSecao(loc.secao);
        map.set(`z${zNorm}_s${sNorm}`, { nome: loc.nome, bairro: loc.bairro || '' });
      }
      // Se tiver campo secoes com múltiplos valores (ex: "012, 013, 014")
      if (loc.secoes) {
        const arr = Array.isArray(loc.secoes) ? loc.secoes : String(loc.secoes).split(/[,;]/);
        arr.forEach((s) => {
          const sNorm = normalizeSecao(s.trim());
          if (sNorm) {
            map.set(`z${zNorm}_s${sNorm}`, { nome: loc.nome, bairro: loc.bairro || '' });
          }
        });
      }
    });

    return map;
  }, [locais]);

  // Agrupamento de Todas as Seções com Eleitores Cadastrados
  const secoesAgrupadas = useMemo(() => {
    const map = new Map<string, SecaoAgrupada>();

    // 1. Processa eleitores cadastrados
    eleitores.forEach((e) => {
      const z = e.zona?.trim() || 'Sem Zona';
      const s = e.secao?.trim() || 'Sem Seção';
      const key = makeSecaoKey(z, s);

      if (!map.has(key)) {
        const localInfo = locaisPorSecao.get(key);
        map.set(key, {
          key,
          zona: z,
          secao: s,
          localNome: localInfo?.nome || 'Local não cadastrado',
          bairro: localInfo?.bairro || e.bairro || 'Não informado',
          eleitores: [],
          totalCadastrados: 0,
          totalConfirmados: 0,
          isApurada: false,
          cumprimentoPct: 0,
          cumprimentoConfirmadosPct: 0,
          saldo: 0,
          liderancasCount: 0,
          liderancasMap: new Map()
        });
      }

      const item = map.get(key)!;
      item.eleitores.push(e);
      item.totalCadastrados++;
      if (e.statusValidacao === 'Confirmado' || e.status === 'Confirmado') {
        item.totalConfirmados++;
      }

      const liderNome = e.lideranca?.trim() || 'Sem Liderança';
      const liderId = e.liderancaId || liderNome;
      if (!item.liderancasMap.has(liderId)) {
        item.liderancasMap.set(liderId, { nome: liderNome, count: 0 });
      }
      item.liderancasMap.get(liderId)!.count++;
    });

    // 2. Inclui seções que já foram apuradas mesmo se não tiverem eleitores cadastrados ainda
    apuracoes.forEach((ap) => {
      const key = makeSecaoKey(ap.zona, ap.secao);
      if (!map.has(key)) {
        const localInfo = locaisPorSecao.get(key);
        map.set(key, {
          key,
          zona: ap.zona,
          secao: ap.secao,
          localNome: localInfo?.nome || 'Local da Seção',
          bairro: localInfo?.bairro || 'Centro',
          eleitores: [],
          totalCadastrados: 0,
          totalConfirmados: 0,
          isApurada: true,
          cumprimentoPct: 0,
          cumprimentoConfirmadosPct: 0,
          saldo: ap.votosApurados,
          liderancasCount: 0,
          liderancasMap: new Map()
        });
      }
    });

    // 3. Cruza com os dados de apuração e calcula métricas
    const result: SecaoAgrupada[] = [];

    map.forEach((item) => {
      item.liderancasCount = item.liderancasMap.size;
      const apuracao = apuracoesMap.get(item.key);

      if (apuracao) {
        item.isApurada = true;
        item.votosApurados = apuracao.votosApurados;
        item.boletimUrna = apuracao.boletimUrna;
        item.observacoes = apuracao.observacoes;
        item.dataApuracao = apuracao.dataApuracao;
        item.apuradoPor = apuracao.apuradoPor;

        item.saldo = apuracao.votosApurados - item.totalCadastrados;
        item.cumprimentoPct =
          item.totalCadastrados > 0
            ? Math.round((apuracao.votosApurados / item.totalCadastrados) * 100)
            : apuracao.votosApurados > 0
            ? 100
            : 0;

        item.cumprimentoConfirmadosPct =
          item.totalConfirmados > 0
            ? Math.round((apuracao.votosApurados / item.totalConfirmados) * 100)
            : item.cumprimentoPct;
      } else {
        item.isApurada = false;
        item.votosApurados = undefined;
        item.cumprimentoPct = 0;
        item.saldo = -item.totalCadastrados;
      }

      result.push(item);
    });

    // Ordenação inicial por Zona e Seção
    result.sort((a, b) => {
      const zA = parseInt(normalizeZona(a.zona), 10) || 0;
      const zB = parseInt(normalizeZona(b.zona), 10) || 0;
      if (zA !== zB) return zA - zB;

      const sA = parseInt(normalizeSecao(a.secao), 10) || 0;
      const sB = parseInt(normalizeSecao(b.secao), 10) || 0;
      return sA - sB;
    });

    return result;
  }, [eleitores, locaisPorSecao, apuracoes, apuracoesMap]);

  // Lista de Zonas e Bairros para Filtro
  const zonasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    secoesAgrupadas.forEach((s) => {
      if (s.zona && s.zona.trim()) set.add(s.zona.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [secoesAgrupadas]);

  const registeredSectionsKeys = useMemo(() => {
    const set = new Set<string>();
    secoesAgrupadas.forEach((s) => {
      const zNorm = normalizeZona(s.zona);
      const sNorm = normalizeSecao(s.secao);
      set.add(`z${zNorm}_s${sNorm}`);
    });
    return set;
  }, [secoesAgrupadas]);

  const bairrosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    secoesAgrupadas.forEach((s) => {
      if (s.bairro && s.bairro.trim() && s.bairro !== 'Não informado') set.add(s.bairro.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [secoesAgrupadas]);

  // Estatísticas Globais de Cumprimento
  const stats = useMemo(() => {
    let totalCadastrados = 0;
    let totalConfirmados = 0;
    let totalVotosApurados = 0;
    let secoesApuradasCount = 0;
    let secoesSuperaramCount = 0;
    let secoesAbaixoCount = 0;

    secoesAgrupadas.forEach((s) => {
      totalCadastrados += s.totalCadastrados;
      totalConfirmados += s.totalConfirmados;

      if (s.isApurada && typeof s.votosApurados === 'number') {
        secoesApuradasCount++;
        totalVotosApurados += s.votosApurados;

        if (s.cumprimentoPct >= 100) {
          secoesSuperaramCount++;
        } else if (s.cumprimentoPct < 75) {
          secoesAbaixoCount++;
        }
      }
    });

    const totalSecoes = secoesAgrupadas.length;
    const taxaCobertura = totalSecoes > 0 ? Math.round((secoesApuradasCount / totalSecoes) * 100) : 0;
    const taxaCumprimentoGlobal =
      totalCadastrados > 0 && secoesApuradasCount > 0
        ? Math.round((totalVotosApurados / totalCadastrados) * 100)
        : 0;

    const saldoGlobal = totalVotosApurados - totalCadastrados;

    return {
      totalSecoes,
      secoesApuradasCount,
      taxaCobertura,
      totalCadastrados,
      totalConfirmados,
      totalVotosApurados,
      taxaCumprimentoGlobal,
      saldoGlobal,
      secoesSuperaramCount,
      secoesAbaixoCount
    };
  }, [secoesAgrupadas]);

  // Desempenho por Liderança (Cruzamento de Votos com Articuladores)
  const desempenhoLiderancas = useMemo(() => {
    const map = new Map<string, {
      lider: Lideranca | { id: string; nome: string };
      totalPrometidos: number;
      secoesKeys: Set<string>;
    }>();

    // Registra lideranças cadastradas
    liderancas.forEach((l) => {
      map.set(l.id, {
        lider: l,
        totalPrometidos: 0,
        secoesKeys: new Set()
      });
      map.set(l.nome.trim().toLowerCase(), {
        lider: l,
        totalPrometidos: 0,
        secoesKeys: new Set()
      });
    });

    // Soma eleitores de cada liderança
    eleitores.forEach((e) => {
      const lidId = e.liderancaId || e.lideranca?.trim().toLowerCase() || 'sem_lider';
      if (!map.has(lidId)) {
        map.set(lidId, {
          lider: { id: lidId, nome: e.lideranca || 'Sem Liderança Definida' },
          totalPrometidos: 0,
          secoesKeys: new Set()
        });
      }
      const entry = map.get(lidId)!;
      entry.totalPrometidos++;
      const secKey = makeSecaoKey(e.zona, e.secao);
      entry.secoesKeys.add(secKey);
    });

    // Mapeia seções e votos apurados
    const list: LiderancaDesempenho[] = [];
    const processedIds = new Set<string>();

    map.forEach((entry) => {
      const id = entry.lider.id;
      if (processedIds.has(id) || entry.totalPrometidos === 0) return;
      processedIds.add(id);

      let votosApuradosSecoes = 0;
      let secoesApuradasDestaLider = 0;

      entry.secoesKeys.forEach((secKey) => {
        const ap = apuracoesMap.get(secKey);
        if (ap) {
          secoesApuradasDestaLider++;
          votosApuradosSecoes += ap.votosApurados;
        }
      });

      const taxa =
        entry.totalPrometidos > 0 && secoesApuradasDestaLider > 0
          ? Math.round((votosApuradosSecoes / entry.totalPrometidos) * 100)
          : 0;

      let classificacao: LiderancaDesempenho['classificacao'] = 'Sem Apuração';
      if (secoesApuradasDestaLider > 0) {
        if (taxa >= 100) classificacao = 'Alta Fidelidade';
        else if (taxa >= 75) classificacao = 'Dentro da Meta';
        else classificacao = 'Abaixo da Meta';
      }

      list.push({
        id,
        nome: (entry.lider as any).nome || 'Liderança',
        tipo: (entry.lider as any).tipo,
        liderancaPaiNome: (entry.lider as any).liderancaPaiNome,
        totalEleitoresPrometidos: entry.totalPrometidos,
        secoesAtuadas: entry.secoesKeys.size,
        votosApuradosTotalSecoes: votosApuradosSecoes,
        saldoEstimado: votosApuradosSecoes - entry.totalPrometidos,
        cumprimentoMedioPct: taxa,
        classificacao
      });
    });

    list.sort((a, b) => b.totalEleitoresPrometidos - a.totalEleitoresPrometidos);
    return list;
  }, [liderancas, eleitores, apuracoesMap]);

  // Filtragem de Seções
  const filteredSecoes = useMemo(() => {
    return secoesAgrupadas.filter((item) => {
      // Filtro Status de Apuração
      if (statusApuracaoFilter === 'apuradas' && !item.isApurada) return false;
      if (statusApuracaoFilter === 'pendentes' && item.isApurada) return false;
      if (statusApuracaoFilter === 'superaram' && (!item.isApurada || item.cumprimentoPct < 100)) return false;
      if (statusApuracaoFilter === 'abaixo' && (!item.isApurada || item.cumprimentoPct >= 75)) return false;

      // Filtro Zona
      if (zonaFilter !== 'todas' && item.zona !== zonaFilter) return false;

      // Filtro Bairro
      if (bairroFilter !== 'todos' && item.bairro !== bairroFilter) return false;

      // Filtro Liderança
      if (liderancaFilter !== 'todas') {
        const hasLider = item.liderancasMap.has(liderancaFilter) ||
          Array.from(item.liderancasMap.values()).some((l) => l.nome === liderancaFilter);
        if (!hasLider) return false;
      }

      // Busca textual
      if (searchTerm.trim()) {
        const t = searchTerm.trim().toLowerCase();
        const matchZona = item.zona.toLowerCase().includes(t);
        const matchSecao = item.secao.toLowerCase().includes(t);
        const matchLocal = item.localNome.toLowerCase().includes(t);
        const matchBairro = item.bairro.toLowerCase().includes(t);
        const matchEleitores = item.eleitores.some((e) => e.nome.toLowerCase().includes(t));

        if (!matchZona && !matchSecao && !matchLocal && !matchBairro && !matchEleitores) {
          return false;
        }
      }

      return true;
    });
  }, [secoesAgrupadas, statusApuracaoFilter, zonaFilter, bairroFilter, liderancaFilter, searchTerm]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filteredSecoes.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedSecoes = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredSecoes.slice(start, start + pageSize);
  }, [filteredSecoes, safeCurrentPage, pageSize]);

  // Manipulação de Edição Inline de Votos
  const handleVoteInputChange = (key: string, value: string) => {
    setEditingVotes((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveInlineVote = async (secaoItem: SecaoAgrupada) => {
    const rawVal = editingVotes[secaoItem.key];
    if (rawVal === undefined || rawVal === '') return;

    const num = parseInt(rawVal, 10);
    if (isNaN(num) || num < 0) {
      showToast('Digite um número de votos válido!');
      return;
    }

    setSavingKeys((prev) => new Set(prev).add(secaoItem.key));
    try {
      await salvarApuracaoSecao(secaoItem.zona, secaoItem.secao, num);
      playVoteChime();
      showToast(`✓ Seção ${secaoItem.secao} atualizada: ${num} votos!`);
      // Limpa do estado de edição para refletir o dado gravado
      setEditingVotes((prev) => {
        const next = { ...prev };
        delete next[secaoItem.key];
        return next;
      });
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar votos da seção');
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(secaoItem.key);
        return next;
      });
    }
  };

  // Importar Lote de Apuração via Texto ou Planilha
  const handleImportBatch = async () => {
    if (!batchRawText.trim()) return;
    setIsImporting(true);

    try {
      const lines = batchRawText.split('\n');
      const parsed: Array<{ zona: string; secao: string; votosApurados: number; boletimUrna?: string }> = [];

      lines.forEach((line) => {
        const clean = line.trim();
        if (!clean || clean.startsWith('#')) return;

        // Suporta formatos: "Zona, Seção, Votos", "Zona;Seção;Votos" ou "Seção: Votos"
        const parts = clean.split(/[,;\t]/).map((p) => p.trim());
        if (parts.length >= 3) {
          const zona = parts[0];
          const secao = parts[1];
          const votos = parseInt(parts[2], 10);
          if (!isNaN(votos)) {
            parsed.push({ zona, secao, votosApurados: votos });
          }
        } else if (parts.length === 2) {
          // Formato: "Seção, Votos" (usa a primeira zona cadastrada como fallback)
          const secao = parts[0];
          const votos = parseInt(parts[1], 10);
          const defaultZona = zonasDisponiveis[0] || '1ª Zona';
          if (!isNaN(votos)) {
            parsed.push({ zona: defaultZona, secao, votosApurados: votos });
          }
        }
      });

      if (parsed.length === 0) {
        showToast('Nenhum registro no formato válido encontrado. Use: Zona, Seção, Votos');
        return;
      }

      await importarLoteApuracao(parsed);
      playVoteChime();
      showToast(`✓ ${parsed.length} seções eleitorais apuradas com sucesso!`);
      setIsBatchModalOpen(false);
      setBatchRawText('');
    } catch (err) {
      console.error(err);
      showToast('Erro ao processar importação em lote');
    } finally {
      setIsImporting(false);
    }
  };

  // Exportar Relatório Geral de Cumprimento em Excel
  const handleExportExcel = () => {
    const rows = secoesAgrupadas.map((s, idx) => ({
      '#': idx + 1,
      'Zona': s.zona,
      'Seção': s.secao,
      'Local de Votação': s.localNome,
      'Bairro': s.bairro,
      'Eleitores Cadastrados': s.totalCadastrados,
      'Eleitores Confirmados': s.totalConfirmados,
      'Votos Reais Apurados': s.isApurada && typeof s.votosApurados === 'number' ? s.votosApurados : 'Pendente',
      'Cumprimento (%)': s.isApurada ? `${s.cumprimentoPct}%` : 'Pendente',
      'Saldo': s.isApurada ? s.saldo : '-',
      'Situação': !s.isApurada
        ? 'Pendente'
        : s.cumprimentoPct >= 100
        ? 'Superou Meta'
        : s.cumprimentoPct >= 75
        ? 'Dentro da Meta'
        : 'Abaixo da Meta',
      'Lideranças Envolvidas': Array.from(s.liderancasMap.values()).map((l) => `${l.nome} (${l.count})`).join(', ') || 'Nenhuma'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cumprimento de Votos');
    XLSX.writeFile(wb, `Cumprimento_Votos_Secoes_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-3 md:p-4 space-y-3 max-w-[1600px] mx-auto flex-1 h-full flex flex-col relative">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-fadeIn border border-white/10">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-white/60 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
              <Vote className="w-5 h-5 text-secondary" />
            </div>
            <h1 className="text-lg md:text-xl text-on-surface font-bold tracking-tight whitespace-nowrap">
              Cumprimento de Votos
            </h1>
          </div>
          <span className="text-[11px] bg-secondary/15 text-secondary font-bold px-2.5 py-0.5 rounded-full hidden sm:inline-block whitespace-nowrap">
            Validação Pós-Eleição
          </span>
          <span className="text-xs text-on-surface-variant hidden xl:inline truncate">
            • Cruze os votos reais de cada urna com a base de eleitores cadastrados e audite o cumprimento real
          </span>
        </div>

        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto py-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsTseModalOpen(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            title="Importar arquivo CSV oficial do TSE com todos os Boletins de Urna"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Importar CSV do TSE</span>
          </button>

          <button
            type="button"
            onClick={() => setIsQrModalOpen(true)}
            className="px-3 py-1.5 bg-primary text-on-primary hover:bg-secondary rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            title="Escanear o QR Code impresso no papel do Boletim de Urna com a câmera do celular"
          >
            <Camera className="w-3.5 h-3.5 text-secondary-container" />
            <span>Escanear QR Code do BU</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBatchModalOpen(true)}
            className="px-2.5 py-1.5 border border-outline-variant bg-surface hover:bg-surface-container text-on-surface rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            title="Digitar ou colar texto no formato: Zona, Seção, Votos"
          >
            <Upload className="w-3.5 h-3.5 text-secondary" />
            <span>Digitar em Lote</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-2.5 py-1.5 border border-outline-variant bg-surface hover:bg-surface-container text-on-surface rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            title="Exportar planilha de auditoria eleitoral"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar Excel</span>
          </button>

          <Link
            href="/eleitores"
            className="px-2.5 py-1.5 border border-outline-variant bg-surface hover:bg-surface-container text-on-surface rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap shrink-0"
            title="Voltar para a Base de Eleitores"
          >
            <Users className="w-3.5 h-3.5 text-secondary" />
            <span>Base</span>
          </Link>
        </div>
      </div>

      {/* Metrics Cards Compactos (Padrão de Alta Densidade) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 shrink-0">
        {/* Card 1: Votos Cadastrados */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-outline-variant/60 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Votos Cadastrados
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <h3 className="text-lg md:text-xl font-black text-on-surface">{stats.totalCadastrados}</h3>
              <span className="text-[11px] text-on-surface-variant">prometidos</span>
            </div>
          </div>
          <div className="p-1.5 bg-surface-container rounded-lg text-secondary">
            <Users className="w-4 h-4" />
          </div>
        </div>

        {/* Card 2: Votos Reais Apurados */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-secondary/40 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">
              Votos Reais Apurados
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <h3 className="text-lg md:text-xl font-black text-secondary">{stats.totalVotosApurados}</h3>
              <span className="text-[11px] text-on-surface-variant font-medium">nas urnas</span>
            </div>
          </div>
          <div className="p-1.5 bg-secondary/10 rounded-lg text-secondary">
            <Vote className="w-4 h-4" />
          </div>
        </div>

        {/* Card 3: Taxa de Cumprimento Geral */}
        <div className={`px-3.5 py-2 rounded-xl border shadow-xs flex items-center justify-between ${
          stats.taxaCumprimentoGlobal >= 100
            ? 'border-emerald-300 bg-emerald-50/50'
            : stats.taxaCumprimentoGlobal >= 75
            ? 'border-sky-300 bg-sky-50/50'
            : stats.secoesApuradasCount > 0
            ? 'border-amber-300 bg-amber-50/50'
            : 'border-outline-variant/60 bg-surface-container-lowest'
        }`}>
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
              Cumprimento Real
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <h3 className={`text-lg md:text-xl font-black ${
                stats.taxaCumprimentoGlobal >= 100 ? 'text-emerald-700' : 'text-primary'
              }`}>
                {stats.taxaCumprimentoGlobal}%
              </h3>
              <span className="text-[11px] font-semibold text-on-surface-variant">
                {stats.saldoGlobal >= 0 ? `+${stats.saldoGlobal} saldo` : `${stats.saldoGlobal} saldo`}
              </span>
            </div>
          </div>
          <div className="p-1.5 bg-surface-container rounded-lg">
            {stats.taxaCumprimentoGlobal >= 100 ? (
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            ) : (
              <TrendingDown className="w-4 h-4 text-amber-600" />
            )}
          </div>
        </div>

        {/* Card 4: Cobertura da Apuração */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-outline-variant/60 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Seções Apuradas
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <h3 className="text-lg md:text-xl font-black text-on-surface">
                {stats.secoesApuradasCount} / {stats.totalSecoes}
              </h3>
              <span className="text-[11px] text-on-surface-variant">({stats.taxaCobertura}%)</span>
            </div>
          </div>
          <div className="p-1.5 bg-surface-container rounded-lg text-secondary">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        {/* Card 5: Balanço de Fidelidade */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-outline-variant/60 shadow-xs flex items-center justify-between col-span-2 sm:col-span-1">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Desempenho Seções
            </p>
            <div className="flex items-center gap-2 mt-1 text-xs">
              <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                <Check className="w-3 h-3" /> {stats.secoesSuperaramCount} superaram
              </span>
              <span className="text-rose-700 font-bold flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3" /> {stats.secoesAbaixoCount} abaixo
              </span>
            </div>
          </div>
          <div className="p-1.5 bg-surface-container rounded-lg text-secondary">
            <BarChart3 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Navegação entre Abas */}
      <div className="flex items-center gap-2 border-b border-outline-variant/50 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('secoes')}
          className={`pb-2 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'secoes'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Vote className="w-3.5 h-3.5" />
          <span>Apuração & Cumprimento por Seção ({secoesAgrupadas.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('liderancas')}
          className={`pb-2 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'liderancas'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Auditoria por Liderança ({desempenhoLiderancas.length})</span>
        </button>
      </div>

      {/* ABA 1: TABELA DE SEÇÕES ELEITORAIS */}
      {activeTab === 'secoes' && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm overflow-hidden flex flex-col flex-1">
          {/* Toolbar de Filtros */}
          <div className="px-3.5 py-2 bg-surface border-b border-outline-variant/50 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-xs md:text-sm text-on-surface font-bold">Listagem de Seções</h2>
              <span className="text-[11px] bg-surface-container text-on-surface px-2 py-0.5 rounded-full font-medium">
                {filteredSecoes.length} de {secoesAgrupadas.length}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Filtro Status da Apuração */}
              <select
                value={statusApuracaoFilter}
                onChange={(e) => {
                  setStatusApuracaoFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary font-medium"
              >
                <option value="todos">Status: Todas as Seções</option>
                <option value="apuradas">✓ Apenas Apuradas</option>
                <option value="pendentes">⏳ Pendentes de Apuração</option>
                <option value="superaram">🟢 Superaram Meta (≥100%)</option>
                <option value="abaixo">🔴 Críticas / Abaixo (&lt;75%)</option>
              </select>

              {/* Filtro Zona */}
              {zonasDisponiveis.length > 0 && (
                <select
                  value={zonaFilter}
                  onChange={(e) => {
                    setZonaFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary max-w-[130px]"
                >
                  <option value="todas">Todas as Zonas</option>
                  {zonasDisponiveis.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              )}

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
                  <option key={l.id} value={l.nome}>
                    {l.nome}
                  </option>
                ))}
              </select>

              {/* Busca Textual */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Buscar zona, seção, local..."
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
              >
                <option value={15}>15 linhas</option>
                <option value={25}>25 linhas</option>
                <option value={50}>50 linhas</option>
                <option value={100}>100 linhas</option>
              </select>
            </div>
          </div>

          {/* Tabela de Seções */}
          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1050px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/60 text-xs text-on-surface-variant uppercase font-semibold">
                  <th className="py-2 px-3 md:py-2.5 md:px-3.5">Zona / Seção</th>
                  <th className="py-2 px-3 md:py-2.5 md:px-3.5">Local de Votação & Bairro</th>
                  <th className="py-2 px-3 md:py-2.5 md:px-3.5 text-center">Cadastrados</th>
                  <th className="py-2 px-3 md:py-2.5 md:px-3.5 text-center">Confirmados</th>
                  <th className="py-2 px-3 md:py-2.5 md:px-3.5 text-center w-36">
                    Votos na Urna (BU)
                  </th>
                  <th className="py-2 px-3 md:py-2.5 md:px-3.5">Cumprimento (%)</th>
                  <th className="py-2 px-3 md:py-2.5 md:px-3.5 text-center">Saldo</th>
                  <th className="py-2 px-3 md:py-2.5 md:px-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 text-sm">
                {filteredSecoes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-on-surface-variant">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Vote className="w-8 h-8 text-outline-variant" />
                        <p className="font-semibold text-on-surface">Nenhuma seção encontrada com os filtros</p>
                        <p className="text-xs text-on-surface-variant">
                          Cadastre eleitores com zona e seção ou lance resultados de apuração.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedSecoes.map((secao) => {
                    const inlineVal = editingVotes[secao.key];
                    const isSavingThis = savingKeys.has(secao.key);
                    const currentVotes = typeof secao.votosApurados === 'number' ? secao.votosApurados : '';

                    return (
                      <tr
                        key={secao.key}
                        className={`transition-colors ${
                          !secao.isApurada
                            ? 'hover:bg-surface-container-low'
                            : secao.cumprimentoPct >= 100
                            ? 'bg-emerald-50/20 hover:bg-emerald-50/40'
                            : secao.cumprimentoPct < 75
                            ? 'bg-rose-50/20 hover:bg-rose-50/40'
                            : 'hover:bg-surface-container-low'
                        }`}
                      >
                        <td className="py-1.5 px-3 md:py-2 md:px-3.5">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-lg bg-surface-container font-mono font-bold text-xs flex items-center justify-center text-primary">
                              {secao.secao}
                            </span>
                            <div>
                              <p className="font-semibold text-xs md:text-sm text-on-surface leading-tight">
                                Seção {secao.secao}
                              </p>
                              <p className="text-[10px] text-on-surface-variant mt-0.5 leading-none">
                                {secao.zona}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-1.5 px-3 md:py-2 md:px-3.5">
                          <p className="font-medium text-xs text-on-surface leading-tight truncate max-w-[240px]">
                            {secao.localNome}
                          </p>
                          <p className="text-[10px] text-on-surface-variant mt-0.5 leading-none flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5" />
                            {secao.bairro} • {secao.liderancasCount} {secao.liderancasCount === 1 ? 'liderança' : 'lideranças'}
                          </p>
                        </td>

                        <td className="py-1.5 px-3 md:py-2 md:px-3.5 text-center">
                          <span className="font-bold text-xs text-on-surface">
                            {secao.totalCadastrados}
                          </span>
                        </td>

                        <td className="py-1.5 px-3 md:py-2 md:px-3.5 text-center">
                          <span className="font-semibold text-xs text-emerald-700">
                            {secao.totalConfirmados}
                          </span>
                        </td>

                        {/* Campo de Votos Reais Apurados (Edição Rápida) */}
                        <td className="py-1.5 px-3 md:py-2 md:px-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              value={inlineVal !== undefined ? inlineVal : currentVotes}
                              onChange={(e) => handleVoteInputChange(secao.key, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveInlineVote(secao);
                                }
                              }}
                              placeholder="Votos..."
                              className="w-20 h-7 text-center font-bold text-xs rounded border border-outline-variant bg-surface text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/40"
                              title="Digite a quantidade de votos que o candidato teve nesta urna e aperte Enter"
                            />
                            {inlineVal !== undefined && inlineVal !== String(currentVotes) && (
                              <button
                                type="button"
                                onClick={() => handleSaveInlineVote(secao)}
                                disabled={isSavingThis}
                                className="p-1 bg-primary text-on-primary hover:bg-secondary rounded text-xs transition-colors cursor-pointer"
                                title="Salvar votos da seção"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Cumprimento (%) com Barra de Progresso */}
                        <td className="py-1.5 px-3 md:py-2 md:px-3.5">
                          {secao.isApurada ? (
                            <div className="w-full max-w-[160px]">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className={`font-black ${
                                  secao.cumprimentoPct >= 100
                                    ? 'text-emerald-700'
                                    : secao.cumprimentoPct >= 75
                                    ? 'text-sky-700'
                                    : 'text-rose-700'
                                }`}>
                                  {secao.cumprimentoPct}%
                                </span>
                                <span className="text-[10px] text-on-surface-variant">
                                  {secao.cumprimentoPct >= 100 ? 'Superou' : secao.cumprimentoPct >= 75 ? 'Na meta' : 'Abaixo'}
                                </span>
                              </div>
                              <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    secao.cumprimentoPct >= 100
                                      ? 'bg-emerald-600'
                                      : secao.cumprimentoPct >= 75
                                      ? 'bg-sky-500'
                                      : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${Math.min(secao.cumprimentoPct, 100)}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-on-surface-variant/60 italic flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-500" /> Aguardando apuração
                            </span>
                          )}
                        </td>

                        {/* Saldo de Votos */}
                        <td className="py-1.5 px-3 md:py-2 md:px-3.5 text-center">
                          {secao.isApurada ? (
                            <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                              secao.saldo > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : secao.saldo === 0
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {secao.saldo > 0 ? `+${secao.saldo}` : secao.saldo}
                            </span>
                          ) : (
                            <span className="text-on-surface-variant text-xs">-</span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="py-1.5 px-3 md:py-2 md:px-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedSecao(secao)}
                            className="px-2.5 py-1 text-xs font-semibold text-secondary hover:underline bg-surface-container hover:bg-surface-container-high rounded transition-colors cursor-pointer"
                            title="Ver eleitores e lideranças desta seção"
                          >
                            Detalhes ({secao.totalCadastrados})
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {filteredSecoes.length > 0 && (
            <div className="px-3.5 py-2 bg-surface-container-low/40 border-t border-outline-variant/40 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-on-surface-variant shrink-0">
              <div>
                Exibindo <strong>{(currentPage - 1) * pageSize + 1}</strong> a{' '}
                <strong>{Math.min(currentPage * pageSize, filteredSecoes.length)}</strong> de{' '}
                <strong>{filteredSecoes.length}</strong> seções
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
      )}

      {/* ABA 2: AUDITORIA DE CUMPRIMENTO POR LIDERANÇA */}
      {activeTab === 'liderancas' && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm overflow-hidden flex flex-col flex-1">
          <div className="px-4 py-3 bg-surface border-b border-outline-variant/50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-on-surface">Auditoria de Eficácia dos Articuladores</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Cruze a quantidade de eleitores que cada liderança prometeu com os votos reais apurados nas seções onde esses eleitores votam.
              </p>
            </div>
            <span className="text-xs bg-surface-container text-on-surface px-2.5 py-1 rounded-full font-bold">
              {desempenhoLiderancas.length} Lideranças Ativas
            </span>
          </div>

          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/60 text-xs text-on-surface-variant uppercase font-semibold">
                  <th className="py-2.5 px-4">Liderança / Articulador</th>
                  <th className="py-2.5 px-4 text-center">Eleitores Prometidos</th>
                  <th className="py-2.5 px-4 text-center">Seções de Atuação</th>
                  <th className="py-2.5 px-4 text-center">Votos Apurados nas Seções</th>
                  <th className="py-2.5 px-4">Cumprimento Estimado (%)</th>
                  <th className="py-2.5 px-4 text-center">Classificação de Fidelidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 text-sm">
                {desempenhoLiderancas.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="py-2.5 px-4">
                      <p className="font-semibold text-xs md:text-sm text-on-surface leading-tight">
                        {item.nome}
                      </p>
                      {item.tipo && (
                        <p className="text-[10px] text-on-surface-variant mt-0.5">
                          {item.tipo} {item.liderancaPaiNome ? `• Sub de ${item.liderancaPaiNome}` : ''}
                        </p>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      <span className="font-bold text-xs text-on-surface">
                        {item.totalEleitoresPrometidos}
                      </span>
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      <span className="text-xs font-mono font-medium text-on-surface">
                        {item.secoesAtuadas} {item.secoesAtuadas === 1 ? 'seção' : 'seções'}
                      </span>
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      <span className="font-bold text-xs text-secondary">
                        {item.votosApuradosTotalSecoes}
                      </span>
                    </td>

                    <td className="py-2.5 px-4">
                      {item.classificacao !== 'Sem Apuração' ? (
                        <div className="w-full max-w-[140px]">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-black text-xs text-primary">
                              {item.cumprimentoMedioPct}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                item.cumprimentoMedioPct >= 100
                                  ? 'bg-emerald-600'
                                  : item.cumprimentoMedioPct >= 75
                                  ? 'bg-sky-500'
                                  : 'bg-rose-500'
                              }`}
                              style={{ width: `${Math.min(item.cumprimentoMedioPct, 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-on-surface-variant/60 italic">Seções não apuradas</span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      {item.classificacao === 'Alta Fidelidade' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Alta Fidelidade
                        </span>
                      ) : item.classificacao === 'Dentro da Meta' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800">
                          <Check className="w-3 h-3 text-sky-600" /> Dentro da Meta
                        </span>
                      ) : item.classificacao === 'Abaixo da Meta' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800">
                          <AlertTriangle className="w-3 h-3 text-rose-600" /> Quebra de Votos
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                          <Clock className="w-3 h-3 text-amber-500" /> Aguardando Urnas
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DETALHES DA SEÇÃO */}
      {selectedSecao && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-5 py-3.5 bg-surface border-b border-outline-variant/60 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <Vote className="w-4 h-4 text-primary" />
                  Detalhes da Seção {selectedSecao.secao} ({selectedSecao.zona})
                </h3>
                <p className="text-xs text-on-surface-variant font-medium mt-0.5">
                  {selectedSecao.localNome} • {selectedSecao.bairro}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSecao(null)}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              {/* Resumo da Seção */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-surface-container rounded-xl text-xs">
                <div>
                  <p className="text-on-surface-variant text-[11px]">Eleitores Cadastrados</p>
                  <p className="text-base font-black text-on-surface mt-0.5">{selectedSecao.totalCadastrados}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant text-[11px]">Votos Apurados (Urna)</p>
                  <p className="text-base font-black text-secondary mt-0.5">
                    {selectedSecao.isApurada ? selectedSecao.votosApurados : 'Pendente'}
                  </p>
                </div>
                <div>
                  <p className="text-on-surface-variant text-[11px]">Cumprimento Real</p>
                  <p className={`text-base font-black mt-0.5 ${
                    selectedSecao.cumprimentoPct >= 100
                      ? 'text-emerald-700'
                      : selectedSecao.isApurada
                      ? 'text-rose-700'
                      : 'text-on-surface-variant'
                  }`}>
                    {selectedSecao.isApurada ? `${selectedSecao.cumprimentoPct}%` : '-'}
                  </p>
                </div>
              </div>

              {/* Lideranças com eleitores nesta seção */}
              <div>
                <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-2">
                  Lideranças com Votos Nesta Seção ({selectedSecao.liderancasMap.size})
                </h4>
                <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                  {Array.from(selectedSecao.liderancasMap.values()).map((lid, i) => (
                    <div
                      key={i}
                      className="px-3 py-2 bg-surface-container-low rounded-lg text-xs flex items-center justify-between"
                    >
                      <span className="font-semibold text-on-surface">{lid.nome}</span>
                      <span className="font-bold text-primary font-mono">{lid.count} eleitores</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lista Nominal dos Eleitores */}
              <div>
                <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-2">
                  Eleitores Mapeados ({selectedSecao.eleitores.length})
                </h4>
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar divide-y divide-outline-variant/30">
                  {selectedSecao.eleitores.map((e) => (
                    <div key={e.id} className="py-1.5 px-2 text-xs flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-on-surface">{e.nome}</p>
                        <p className="text-[10px] text-on-surface-variant">
                          {e.telefone || 'Sem telefone'} • Lider: {e.lideranca || 'Sem Lider'}
                        </p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        e.statusValidacao === 'Confirmado'
                          ? 'bg-emerald-100 text-emerald-800'
                          : e.statusValidacao === 'Negado'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {e.statusValidacao || 'Pendente'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-surface border-t border-outline-variant/60 flex items-center justify-between">
              {selectedSecao.isApurada && (
                <button
                  type="button"
                  onClick={async () => {
                    await removerApuracaoSecao(selectedSecao.zona, selectedSecao.secao);
                    showToast(`Apuração da seção ${selectedSecao.secao} resetada`);
                    setSelectedSecao(null);
                  }}
                  className="text-xs text-rose-600 hover:underline font-semibold"
                >
                  Limpar Votos Desta Seção
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedSecao(null)}
                className="px-4 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold ml-auto"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL LANÇAMENTO / IMPORTAÇÃO EM LOTE DE URNAS */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 bg-surface border-b border-outline-variant/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-on-surface">Lançar Boletins de Urna em Lote</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Cole abaixo a lista de seções e os votos apurados do candidato. Você pode copiar direto do Excel ou de um bloco de notas.
              </p>

              <div className="p-2.5 bg-surface-container rounded-lg text-[11px] font-mono text-on-surface space-y-0.5">
                <p className="font-bold text-secondary">Formato aceito (um por linha):</p>
                <p>Zona, Seção, Votos</p>
                <p className="text-on-surface-variant">Exemplo: 1ª Zona, 012, 45</p>
                <p className="text-on-surface-variant">Exemplo: 1, 14, 82</p>
              </div>

              <textarea
                rows={8}
                value={batchRawText}
                onChange={(e) => setBatchRawText(e.target.value)}
                placeholder="Cole aqui os dados...&#10;1ª Zona, 012, 45&#10;1ª Zona, 013, 38&#10;1ª Zona, 014, 72"
                className="w-full border border-outline-variant rounded-xl p-3 text-xs bg-surface text-on-surface focus:outline-none focus:border-secondary font-mono resize-none"
              />
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
                onClick={handleImportBatch}
                disabled={isImporting || !batchRawText.trim()}
                className="px-4 py-1.5 bg-primary text-on-primary hover:bg-secondary rounded-lg text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isImporting ? 'Gravando...' : 'Gravar Apuração'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Importador CSV Oficial do TSE */}
      {isTseModalOpen && (
        <TseCsvImporterModal
          isOpen={isTseModalOpen}
          onClose={() => setIsTseModalOpen(false)}
          onImportBatch={async (items) => {
            await importarLoteApuracao(items);
            playVoteChime();
            showToast(`✓ ${items.length} seções do TSE importadas com sucesso!`);
          }}
          registeredSectionsKeys={registeredSectionsKeys}
        />
      )}

      {/* Modal 2: Leitor de QR Code do BU (Câmera e Imagem) */}
      {isQrModalOpen && (
        <BuQrCodeScannerModal
          isOpen={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
          onSaveSecaoVotos={async (zona, secao, votos, extras) => {
            await salvarApuracaoSecao(zona, secao, votos, extras);
            playVoteChime();
            showToast(`✓ Seção ${secao} apurada via QR Code: ${votos} votos salvos!`);
          }}
        />
      )}
    </div>
  );
}
