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
  Camera,
  Trash2,
  RotateCcw,
  Printer,
  EyeOff
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
import { useTenant } from '@/context/TenantContext';
import { useAuth } from '@/context/AuthContext';
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

interface SecaoAgrupada {
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
  teveVotosSuficientes?: boolean; // votosApurados >= totalCadastrados
  situacao: 'Meta Cumprida' | 'Quebra de Votos' | 'Aguardando Urna' | 'Sem Cadastros';
  liderancasCount: number;
  liderancasMap: Map<string, { nome: string; count: number }>;
  boletimUrna?: string;
  observacoes?: string;
  dataApuracao?: string;
  apuradoPor?: string;
}

interface LiderancaSecaoDetalhe {
  key: string;
  zona: string;
  secao: string;
  localNome: string;
  bairro: string;
  eleitoresLideranca: number;
  totalEleitoresSecao: number;
  votosApurados?: number;
  isApurada: boolean;
  teveVotosSuficientes: boolean | null;
  votosValidados: number;
  statusSecao: 'Meta Cumprida' | 'Quebra de Votos' | 'Aguardando Urna';
  saldoSecao: number;
  eleitores: Eleitor[];
}

interface LiderancaDesempenho {
  id: string;
  nome: string;
  tipo?: string;
  liderancaPaiNome?: string;
  totalEleitoresPrometidos: number;
  eleitoresEmSecoesApuradas: number;
  secoesAtuadas: number;
  secoesApuradas: number;
  secoesCumpridas: number;
  secoesComQuebra: number;
  votosValidadosTotal: number;
  votosApuradosTotalSecoes: number;
  saldoEstimado: number;
  cumprimentoMedioPct: number;
  cumprimentoGlobalPct: number;
  classificacao: 'Meta Cumprida' | 'Cumprimento Parcial' | 'Quebra Grave' | 'Aguardando Urna';
  detalhesSecoes: LiderancaSecaoDetalhe[];
}

export default function CumprimentoVotosPage() {
  const { currentTenant, subdomain } = useTenant();
  const { currentUser } = useAuth();
  const { eleitores, liderancas, locais } = useCampaignData();
  const { apuracoes, apuracoesMap, salvarApuracaoSecao, removerApuracaoSecao, importarLoteApuracao, limparTodasApuracoes } = useApuracao();

  // Abas: "secoes" (Análise por Seção) ou "liderancas" (Auditoria por Liderança)
  const [activeTab, setActiveTab] = useState<'secoes' | 'liderancas'>('secoes');

  // Modal de Impressão de Relatório
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printReportType, setPrintReportType] = useState<'secoes' | 'liderancas' | 'lideranca_individual'>('secoes');
  const [printSelectedLideranca, setPrintSelectedLideranca] = useState<LiderancaDesempenho | null>(null);
  const [printScope, setPrintScope] = useState<'todas' | 'apenas_apuradas' | 'apenas_quebras' | 'com_votos' | 'sem_votos'>('todas');

  const campaignDisplayName =
    currentTenant?.nome || (subdomain && subdomain !== 'demo' ? `Campanha ${subdomain}` : 'Campanha Eleitoral 2026');

  const handleOpenPrintModal = (type: 'secoes' | 'liderancas' | 'lideranca_individual', lideranca?: LiderancaDesempenho | null) => {
    setPrintReportType(type);
    if (lideranca) {
      setPrintSelectedLideranca(lideranca);
    }
    setIsPrintModalOpen(true);
  };

  const handleTriggerPrint = () => {
    window.print();
  };

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusApuracaoFilter, setStatusApuracaoFilter] = useState<'todos' | 'apuradas' | 'pendentes' | 'superaram' | 'abaixo'>('todos');
  const [votoPresencaFilter, setVotoPresencaFilter] = useState<'todos' | 'com_votos' | 'sem_votos'>('todos');
  const [ocultarSemCadastro, setOcultarSemCadastro] = useState(false);
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

  // Modal de Auditoria Detalhada da Liderança
  const [selectedLiderancaAudit, setSelectedLiderancaAudit] = useState<LiderancaDesempenho | null>(null);

  // Modais de Importação
  const [isTseModalOpen, setIsTseModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchRawText, setBatchRawText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Modal de Exclusão de Todos os Votos da Importação
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Modal de Encerramento de Seções Pendentes com 0 Votos
  const [isClosePendingModalOpen, setIsClosePendingModalOpen] = useState(false);
  const [isClosingPending, setIsClosingPending] = useState(false);

  // Toast Feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Excluir todos os votos apurados importados no sistema
  const handleConfirmDeleteAllVotes = async () => {
    setIsDeletingAll(true);
    try {
      const res = await limparTodasApuracoes();
      showToast(`✓ Todos os ${res.deleted} votos cadastrados foram excluídos com sucesso!`);
      setIsDeleteAllModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao excluir todos os votos:', err);
      showToast(`Falha ao excluir votos: ${err.message || 'Erro desconhecido.'}`);
    } finally {
      setIsDeletingAll(false);
    }
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

        item.teveVotosSuficientes = item.totalCadastrados > 0 ? (apuracao.votosApurados >= item.totalCadastrados) : true;
        item.situacao = item.totalCadastrados === 0
          ? 'Sem Cadastros'
          : apuracao.votosApurados >= item.totalCadastrados
          ? 'Meta Cumprida'
          : 'Quebra de Votos';
      } else {
        item.isApurada = false;
        item.votosApurados = undefined;
        item.cumprimentoPct = 0;
        item.saldo = -item.totalCadastrados;
        item.teveVotosSuficientes = false;
        item.situacao = 'Aguardando Urna';
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

  const registeredSectionsInfo = useMemo(() => {
    const map = new Map<string, { totalCadastrados: number; localNome?: string }>();
    secoesAgrupadas.forEach((s) => {
      if (s.totalCadastrados > 0) {
        const zNorm = normalizeZona(s.zona);
        const sNorm = normalizeSecao(s.secao);
        map.set(`z${zNorm}_s${sNorm}`, {
          totalCadastrados: s.totalCadastrados,
          localNome: s.localNome
        });
      }
    });
    return map;
  }, [secoesAgrupadas]);

  const bairrosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    secoesAgrupadas.forEach((s) => {
      if (s.bairro && s.bairro.trim() && s.bairro !== 'Não informado') set.add(s.bairro.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [secoesAgrupadas]);

  // Seções pendentes que possuem eleitores cadastrados na base da campanha
  const secoesPendentesBase = useMemo(() => {
    return secoesAgrupadas.filter((s) => !s.isApurada && s.totalCadastrados > 0);
  }, [secoesAgrupadas]);

  // Contagem de seções com votos vs sem votos
  const contadoresVotos = useMemo(() => {
    let comVotos = 0;
    let semVotos = 0;
    secoesAgrupadas.forEach((s) => {
      const v = typeof s.votosApurados === 'number' ? s.votosApurados : 0;
      if (v > 0) comVotos++;
      else semVotos++;
    });
    return { comVotos, semVotos };
  }, [secoesAgrupadas]);

  // Contagem de seções que tiveram votos apurados mas não possuem eleitores cadastrados
  const secoesSemCadastroCount = useMemo(() => {
    return secoesAgrupadas.filter(
      (s) => s.totalCadastrados === 0 && (typeof s.votosApurados === 'number' ? s.votosApurados > 0 : false)
    ).length;
  }, [secoesAgrupadas]);

  // Encerra todas as seções pendentes da base registrando 0 votos para fechar a apuração definitiva
  const handleConfirmClosePending = async () => {
    if (secoesPendentesBase.length === 0) return;
    setIsClosingPending(true);
    try {
      const itens = secoesPendentesBase.map((s) => ({
        zona: s.zona,
        secao: s.secao,
        votosApurados: 0,
        boletimUrna: 'Apuração Final Definitiva (0 Votos)'
      }));
      await importarLoteApuracao(itens);
      showToast(`✓ ${itens.length} seções pendentes foram encerradas com 0 votos com sucesso!`);
      setIsClosePendingModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao encerrar seções pendentes:', err);
      showToast('Erro ao encerrar seções pendentes.');
    } finally {
      setIsClosingPending(false);
    }
  };

  // Estatísticas Globais de Cumprimento Real (Isolado na Base de Eleitores Cadastrados)
  const stats = useMemo(() => {
    let totalEleitoresCadastrados = 0;
    let totalConfirmados = 0;

    // Métricas isoladas das seções com eleitores cadastrados
    let secoesComEleitoresCount = 0;
    let secoesCadastradasApuradasCount = 0;
    let eleitoresEmSecoesApuradas = 0;
    let votosEmSecoesCadastradas = 0;
    let secoesCadastradasCumpridasCount = 0;
    let secoesCadastradasQuebradasCount = 0;
    let votosCumpridosBase = 0; // Votos efetivamente validados da base (limitado ao total de cadastrados de cada seção)
    let votosQuebradosBase = 0; // Votos de eleitores prometidos que não compareceram na urna
    let votosExcedentesUrnas = 0; // Votos excedentes nas urnas acima da meta de cadastrados

    // Métricas gerais de todas as seções (incluindo avulsas sem cadastro)
    const totalSecoesGerais = secoesAgrupadas.length;
    let totalSecoesApuradasGerais = 0;
    let totalVotosApuradosGerais = 0;

    secoesAgrupadas.forEach((s) => {
      const temEleitores = s.totalCadastrados > 0;

      if (temEleitores) {
        secoesComEleitoresCount++;
        totalEleitoresCadastrados += s.totalCadastrados;
        totalConfirmados += s.totalConfirmados;

        if (s.isApurada && typeof s.votosApurados === 'number') {
          secoesCadastradasApuradasCount++;
          eleitoresEmSecoesApuradas += s.totalCadastrados;
          votosEmSecoesCadastradas += s.votosApurados;

          const cumpridosNestaSecao = Math.min(s.votosApurados, s.totalCadastrados);
          const quebraNestaSecao = Math.max(0, s.totalCadastrados - s.votosApurados);
          const excedenteNestaSecao = Math.max(0, s.votosApurados - s.totalCadastrados);

          votosCumpridosBase += cumpridosNestaSecao;
          votosQuebradosBase += quebraNestaSecao;
          votosExcedentesUrnas += excedenteNestaSecao;

          if (s.votosApurados >= s.totalCadastrados) {
            secoesCadastradasCumpridasCount++;
          } else {
            secoesCadastradasQuebradasCount++;
          }
        }
      }

      if (s.isApurada && typeof s.votosApurados === 'number') {
        totalSecoesApuradasGerais++;
        totalVotosApuradosGerais += s.votosApurados;
      }
    });

    const taxaCoberturaBase = secoesComEleitoresCount > 0
      ? Math.round((secoesCadastradasApuradasCount / secoesComEleitoresCount) * 100)
      : 0;

    // Total de todos os votos contabilizados no arquivo de importação
    const totalVotosImportados = apuracoes.length > 0
      ? apuracoes.reduce((acc, a) => acc + (Number(a.votosApurados) || 0), 0)
      : totalVotosApuradosGerais;

    const totalSecoesImportadas = apuracoes.length > 0
      ? apuracoes.length
      : totalSecoesApuradasGerais;

    // Cumprimento Real: Eleitores da base que efetivamente cumpriram o voto nas urnas vs Total Prometido
    // Votos excedentes em uma seção NÃO compensam eleitores que não cumpriram em outra!
    const taxaCumprimentoReal = totalEleitoresCadastrados > 0
      ? Math.round((votosCumpridosBase / totalEleitoresCadastrados) * 100)
      : 0;

    const saldoReal = votosCumpridosBase - totalEleitoresCadastrados;
    const saldoRealIsolado = saldoReal;

    const taxaCumprimentoBaseTotal = taxaCumprimentoReal;

    return {
      totalEleitoresCadastrados,
      totalConfirmados,
      secoesComEleitoresCount,
      secoesCadastradasApuradasCount,
      taxaCoberturaBase,
      eleitoresEmSecoesApuradas,
      votosEmSecoesCadastradas,
      votosCumpridosBase,
      votosQuebradosBase,
      votosExcedentesUrnas,
      totalVotosImportados,
      totalSecoesImportadas,
      taxaCumprimentoReal,
      saldoReal,
      saldoRealIsolado,
      taxaCumprimentoBaseTotal,
      secoesCadastradasCumpridasCount,
      secoesCadastradasQuebradasCount,
      totalSecoesGerais,
      totalSecoesApuradasGerais,
      totalVotosApuradosGerais
    };
  }, [secoesAgrupadas, apuracoes]);

  // Desempenho por Liderança (Cruzamento de Votos com Eleitores Cadastrados de Cada Liderança)
  const desempenhoLiderancas = useMemo(() => {
    // Mapa auxiliar de seções indexadas por key para consulta O(1)
    const secoesMap = new Map<string, SecaoAgrupada>();
    secoesAgrupadas.forEach((s) => secoesMap.set(s.key, s));

    const map = new Map<string, {
      lider: Lideranca | { id: string; nome: string };
      totalPrometidos: number;
      eleitoresPorSecao: Map<string, Eleitor[]>;
    }>();

    // 1. Registra lideranças cadastradas no sistema
    liderancas.forEach((l) => {
      map.set(l.id, {
        lider: l,
        totalPrometidos: 0,
        eleitoresPorSecao: new Map()
      });
      map.set(l.nome.trim().toLowerCase(), {
        lider: l,
        totalPrometidos: 0,
        eleitoresPorSecao: new Map()
      });
    });

    // 2. Mapeia eleitores agrupados por liderança e seção eleitoral
    eleitores.forEach((e) => {
      const lidId = e.liderancaId || e.lideranca?.trim().toLowerCase() || 'sem_lider';
      if (!map.has(lidId)) {
        map.set(lidId, {
          lider: { id: lidId, nome: e.lideranca || 'Sem Liderança Definida' },
          totalPrometidos: 0,
          eleitoresPorSecao: new Map()
        });
      }
      const entry = map.get(lidId)!;
      entry.totalPrometidos++;

      const secKey = makeSecaoKey(e.zona, e.secao);
      if (!entry.eleitoresPorSecao.has(secKey)) {
        entry.eleitoresPorSecao.set(secKey, []);
      }
      entry.eleitoresPorSecao.get(secKey)!.push(e);
    });

    // 3. Processa o cruzamento exato de votos com os eleitores cadastrados
    const list: LiderancaDesempenho[] = [];
    const processedIds = new Set<string>();

    map.forEach((entry) => {
      const id = entry.lider.id;
      if (processedIds.has(id) || entry.totalPrometidos === 0) return;
      processedIds.add(id);

      let eleitoresEmSecoesApuradas = 0;
      let votosValidadosTotal = 0;
      let votosApuradosTotalSecoes = 0;
      let secoesApuradas = 0;
      let secoesCumpridas = 0;
      let secoesComQuebra = 0;
      const detalhesSecoes: LiderancaSecaoDetalhe[] = [];

      entry.eleitoresPorSecao.forEach((eleitoresDaLideranca, secKey) => {
        const secaoInfo = secoesMap.get(secKey);
        const countLid = eleitoresDaLideranca.length;
        const totalSecao = secaoInfo?.totalCadastrados || countLid;
        const isApurada = !!secaoInfo?.isApurada;
        const votosApurados = secaoInfo?.votosApurados;

        let statusSecao: LiderancaSecaoDetalhe['statusSecao'] = 'Aguardando Urna';
        let votosValidados = 0;
        let teveVotosSuficientes: boolean | null = null;
        let saldoSecao = -countLid;

        if (isApurada && typeof votosApurados === 'number') {
          secoesApuradas++;
          eleitoresEmSecoesApuradas += countLid;
          votosApuradosTotalSecoes += votosApurados;

          if (votosApurados >= totalSecao) {
            // A seção teve votos suficientes para cumprir a quantidade de eleitores cadastrados!
            teveVotosSuficientes = true;
            statusSecao = 'Meta Cumprida';
            secoesCumpridas++;
            votosValidados = countLid; // Liderança atingiu 100% de seus eleitores
            saldoSecao = 0;
          } else {
            // Houve quebra de votos na seção
            teveVotosSuficientes = false;
            statusSecao = 'Quebra de Votos';
            secoesComQuebra++;
            const proporcao = totalSecao > 0 ? countLid / totalSecao : 0;
            votosValidados = Math.min(countLid, Math.round(votosApurados * proporcao));
            saldoSecao = votosValidados - countLid;
          }

          votosValidadosTotal += votosValidados;
        }

        detalhesSecoes.push({
          key: secKey,
          zona: secaoInfo?.zona || eleitoresDaLideranca[0]?.zona || 'Sem Zona',
          secao: secaoInfo?.secao || eleitoresDaLideranca[0]?.secao || 'Sem Seção',
          localNome: secaoInfo?.localNome || 'Local não cadastrado',
          bairro: secaoInfo?.bairro || eleitoresDaLideranca[0]?.bairro || 'Centro',
          eleitoresLideranca: countLid,
          totalEleitoresSecao: totalSecao,
          votosApurados,
          isApurada,
          teveVotosSuficientes,
          votosValidados,
          statusSecao,
          saldoSecao,
          eleitores: eleitoresDaLideranca
        });
      });

      // Ordena as seções por status (quebra primeiro para auditoria rápida, depois cumpridas, depois pendentes)
      detalhesSecoes.sort((a, b) => {
        if (a.isApurada && !b.isApurada) return -1;
        if (!a.isApurada && b.isApurada) return 1;
        return a.saldoSecao - b.saldoSecao;
      });

      const taxa =
        eleitoresEmSecoesApuradas > 0
          ? Math.round((votosValidadosTotal / eleitoresEmSecoesApuradas) * 100)
          : 0;

      const taxaTotalGeral =
        entry.totalPrometidos > 0
          ? Math.round((votosValidadosTotal / entry.totalPrometidos) * 100)
          : 0;

      let classificacao: LiderancaDesempenho['classificacao'] = 'Aguardando Urna';
      if (secoesApuradas > 0) {
        if (taxa >= 100) classificacao = 'Meta Cumprida';
        else if (taxa >= 75) classificacao = 'Cumprimento Parcial';
        else classificacao = 'Quebra Grave';
      }

      list.push({
        id,
        nome: (entry.lider as any).nome || 'Liderança',
        tipo: (entry.lider as any).tipo,
        liderancaPaiNome: (entry.lider as any).liderancaPaiNome,
        totalEleitoresPrometidos: entry.totalPrometidos,
        eleitoresEmSecoesApuradas,
        secoesAtuadas: entry.eleitoresPorSecao.size,
        secoesApuradas,
        secoesCumpridas,
        secoesComQuebra,
        votosValidadosTotal,
        votosApuradosTotalSecoes,
        saldoEstimado: votosValidadosTotal - eleitoresEmSecoesApuradas,
        cumprimentoMedioPct: taxa,
        cumprimentoGlobalPct: taxaTotalGeral,
        classificacao,
        detalhesSecoes
      });
    });

    list.sort((a, b) => b.totalEleitoresPrometidos - a.totalEleitoresPrometidos);
    return list;
  }, [liderancas, eleitores, secoesAgrupadas]);

  // Filtragem de Seções
  const filteredSecoes = useMemo(() => {
    return secoesAgrupadas.filter((item) => {
      // Filtro Status de Apuração
      if (statusApuracaoFilter === 'apuradas' && !item.isApurada) return false;
      if (statusApuracaoFilter === 'pendentes' && item.isApurada) return false;
      if (statusApuracaoFilter === 'superaram' && (!item.isApurada || item.teveVotosSuficientes !== true)) return false;
      if (statusApuracaoFilter === 'abaixo' && (!item.isApurada || item.teveVotosSuficientes !== false)) return false;

      // Filtro Presença de Votos (Tiveram Votos vs Não Tiveram Votos)
      if (votoPresencaFilter === 'com_votos') {
        const votos = typeof item.votosApurados === 'number' ? item.votosApurados : 0;
        if (votos <= 0) return false;
      }
      if (votoPresencaFilter === 'sem_votos') {
        const votos = typeof item.votosApurados === 'number' ? item.votosApurados : 0;
        if (votos > 0) return false;
      }

      // Ocultar seções que tiveram votos apurados mas não possuem eleitores cadastrados
      if (ocultarSemCadastro && item.totalCadastrados === 0) {
        return false;
      }

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
  }, [secoesAgrupadas, statusApuracaoFilter, votoPresencaFilter, ocultarSemCadastro, zonaFilter, bairroFilter, liderancaFilter, searchTerm]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filteredSecoes.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedSecoes = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredSecoes.slice(start, start + pageSize);
  }, [filteredSecoes, safeCurrentPage, pageSize]);

  // Listagens Preparadas para Impressão Completa (sem corte de paginação)
  const printSecoesList = useMemo(() => {
    if (printScope === 'apenas_apuradas') {
      return filteredSecoes.filter((s) => s.isApurada);
    }
    if (printScope === 'apenas_quebras') {
      return filteredSecoes.filter((s) => s.isApurada && s.teveVotosSuficientes === false);
    }
    if (printScope === 'com_votos') {
      return filteredSecoes.filter((s) => (typeof s.votosApurados === 'number' ? s.votosApurados : 0) > 0);
    }
    if (printScope === 'sem_votos') {
      return filteredSecoes.filter((s) => (typeof s.votosApurados === 'number' ? s.votosApurados : 0) <= 0);
    }
    return filteredSecoes;
  }, [filteredSecoes, printScope]);

  const printLiderancasList = useMemo(() => {
    if (printScope === 'apenas_apuradas') {
      return desempenhoLiderancas.filter((l) => l.secoesApuradas > 0);
    }
    if (printScope === 'apenas_quebras') {
      return desempenhoLiderancas.filter((l) => l.secoesComQuebra > 0 || l.classificacao === 'Quebra Grave');
    }
    return desempenhoLiderancas;
  }, [desempenhoLiderancas, printScope]);

  const activeFiltersSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (statusApuracaoFilter !== 'todos') {
      const labels: Record<string, string> = {
        apuradas: 'Apenas Apuradas',
        pendentes: 'Pendentes de Apuração',
        superaram: 'Superaram a Meta',
        abaixo: 'Com Quebra / Abaixo'
      };
      parts.push(`Status: ${labels[statusApuracaoFilter] || statusApuracaoFilter}`);
    }
    if (votoPresencaFilter !== 'todos') {
      parts.push(votoPresencaFilter === 'com_votos' ? 'Apenas com Votos' : 'Apenas sem Votos');
    }
    if (ocultarSemCadastro) {
      parts.push('Apenas Seções com Cadastro na Base');
    }
    if (zonaFilter !== 'todas') parts.push(`Zona: ${zonaFilter}`);
    if (bairroFilter !== 'todos') parts.push(`Bairro: ${bairroFilter}`);
    if (liderancaFilter !== 'todas') parts.push(`Liderança: ${liderancaFilter}`);
    if (searchTerm.trim()) parts.push(`Busca: "${searchTerm.trim()}"`);
    return parts.length > 0 ? parts.join(' • ') : 'Listagem Geral (Sem Filtros)';
  }, [statusApuracaoFilter, votoPresencaFilter, ocultarSemCadastro, zonaFilter, bairroFilter, liderancaFilter, searchTerm]);

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
    const dataToExport = ocultarSemCadastro
      ? secoesAgrupadas.filter((s) => s.totalCadastrados > 0)
      : secoesAgrupadas;

    const rows = dataToExport.map((s, idx) => ({
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
    <div className={`p-3 md:p-4 space-y-3 max-w-[1600px] mx-auto flex-1 h-full flex flex-col relative ${isPrintModalOpen ? 'print:hidden' : ''}`}>
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
            <span>Importar CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setIsQrModalOpen(true)}
            className="px-3 py-1.5 bg-primary text-on-primary hover:bg-secondary rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            title="Escanear o QR Code impresso no papel do Boletim de Urna com a câmera do celular"
          >
            <Camera className="w-3.5 h-3.5 text-secondary-container" />
            <span>Escanear BU</span>
          </button>

          {/* Botão para Encerrar Seções Pendentes com 0 Votos (Apuração Final Definitiva) */}
          {secoesPendentesBase.length > 0 && (
            <button
              type="button"
              onClick={() => setIsClosePendingModalOpen(true)}
              className="px-2.5 py-1.5 border border-amber-400 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/80 text-amber-900 dark:text-amber-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
              title="Marcar todas as seções que ainda estão como Aguardando com 0 votos para fechar a apuração definitiva"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
              <span>Encerrar Pendentes (0 Votos) ({secoesPendentesBase.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-2.5 py-1.5 border border-outline-variant bg-surface hover:bg-surface-container text-on-surface rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            title="Exportar planilha de auditoria eleitoral"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar Excel</span>
          </button>

          {/* Botão Imprimir Relatório da Tabela */}
          <button
            type="button"
            onClick={() => handleOpenPrintModal(activeTab)}
            className="px-2.5 py-1.5 border border-outline-variant bg-surface hover:bg-surface-container text-on-surface rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            title="Imprimir relatório da tabela ou gerar PDF"
          >
            <Printer className="w-3.5 h-3.5 text-secondary" />
            <span>Imprimir Relatório</span>
          </button>

          {/* Botão de Excluir Todos os Votos da Importação (Sempre Visível) */}
          <button
            type="button"
            onClick={() => {
              if (apuracoes.length === 0) {
                showToast('Nenhum voto cadastrado da importação no momento.');
                return;
              }
              setIsDeleteAllModalOpen(true);
            }}
            className="px-2.5 py-1.5 border border-rose-500 hover:border-rose-600 bg-surface hover:bg-surface-container text-on-surface rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            title="Excluir permanentemente todos os votos cadastrados da importação e zerar a contagem de urnas"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-500" />
            <span>Excluir votos</span>
          </button>
        </div>
      </div>

      {/* Metrics Cards Compactos (Cruzamento Real da Base Cadastrada) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 shrink-0">
        {/* Card 1: Eleitores Cadastrados no Sistema */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-outline-variant/60 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Eleitores Cadastrados
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <h3 className="text-lg md:text-xl font-black text-on-surface">{stats.totalEleitoresCadastrados}</h3>
              <span className="text-[11px] text-on-surface-variant font-medium">prometidos</span>
            </div>
            <p className="text-[10px] text-on-surface-variant/80 mt-0.5 font-medium">
              em {stats.secoesComEleitoresCount} seções da base
            </p>
          </div>
          <div className="p-1.5 bg-surface-container rounded-lg text-secondary">
            <Users className="w-4 h-4" />
          </div>
        </div>

        {/* Card 2: Total de Votos Geral (Todos os votos contabilizados no arquivo de importação) */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-secondary/40 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">
              Total de Votos Geral
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <h3 className="text-lg md:text-xl font-black text-secondary">{stats.totalVotosImportados}</h3>
              <span className="text-[11px] text-on-surface-variant font-medium">nas urnas</span>
            </div>
            <p className="text-[10px] text-on-surface-variant/80 mt-0.5 font-medium">
              {stats.totalSecoesImportadas} seções contabilizadas no arquivo
            </p>
          </div>
          <div className="p-1.5 bg-secondary/10 rounded-lg text-secondary">
            <Vote className="w-4 h-4" />
          </div>
        </div>

        {/* Card 3: CUMPRIMENTO REAL DE VOTO (Prometidos no Sistema vs Cumpridos) */}
        <div className={`px-3.5 py-2 rounded-xl border shadow-xs flex items-center justify-between col-span-2 sm:col-span-1 ${
          stats.taxaCumprimentoReal >= 100
            ? 'border-emerald-300 bg-emerald-50/50'
            : stats.taxaCumprimentoReal >= 75
            ? 'border-sky-300 bg-sky-50/50'
            : stats.totalSecoesImportadas > 0
            ? 'border-amber-300 bg-amber-50/50'
            : 'border-outline-variant/60 bg-surface-container-lowest'
        }`}>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                Cumprimento Real
              </p>
              <span className="text-[9px] bg-secondary/15 text-secondary px-1.5 py-0.5 rounded font-bold uppercase">
                Base
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <h3 className={`text-lg md:text-xl font-black ${
                stats.taxaCumprimentoReal === 100 ? 'text-emerald-700' : stats.taxaCumprimentoReal >= 80 ? 'text-sky-700' : 'text-primary'
              }`}>
                {stats.taxaCumprimentoReal}%
              </h3>
              <span className={`text-[11px] font-bold ${
                stats.saldoReal >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {stats.saldoReal >= 0 ? 'Meta 100%' : `${stats.saldoReal} quebras`}
              </span>
            </div>
            <p className="text-[10px] text-on-surface-variant mt-0.5">
              {stats.votosCumpridosBase} cumpridos / {stats.totalEleitoresCadastrados} prometidos
            </p>
          </div>
          <div className="p-1.5 bg-surface-container rounded-lg">
            {stats.taxaCumprimentoReal >= 100 ? (
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            ) : (
              <TrendingDown className="w-4 h-4 text-amber-600" />
            )}
          </div>
        </div>

        {/* Card 4: Cobertura das Seções Cadastradas */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-outline-variant/60 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Seções Apuradas
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <h3 className="text-lg md:text-xl font-black text-on-surface">
                {stats.secoesCadastradasApuradasCount} / {stats.secoesComEleitoresCount}
              </h3>
              <span className="text-[11px] text-on-surface-variant">({stats.taxaCoberturaBase}%)</span>
            </div>
            <p className="text-[10px] text-on-surface-variant/80 mt-0.5 font-medium">
              da base de eleitores
            </p>
          </div>
          <div className="p-1.5 bg-surface-container rounded-lg text-secondary">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        {/* Card 5: Balanço das Seções Cadastradas */}
        <div className="bg-surface-container-lowest px-3.5 py-2 rounded-xl border border-outline-variant/60 shadow-xs flex items-center justify-between col-span-2 sm:col-span-1">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              Balanço das Seções
            </p>
            <div className="flex flex-col gap-0.5 mt-1 text-xs">
              <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                <Check className="w-3 h-3" /> {stats.secoesCadastradasCumpridasCount} cumpriram meta
              </span>
              <span className="text-rose-700 font-bold flex items-center gap-1 text-[11px]">
                <AlertTriangle className="w-3 h-3" /> {stats.secoesCadastradasQuebradasCount} com quebra de votos
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
            <div className="flex items-center gap-2 flex-wrap">
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

              {/* Filtro Presença de Votos (Tiveram Votos / Não Tiveram) */}
              <select
                value={votoPresencaFilter}
                onChange={(e) => {
                  setVotoPresencaFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="h-8 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2 text-xs text-on-surface focus:outline-none focus:border-secondary font-medium"
                title="Filtrar seções por presença de votos"
              >
                <option value="todos">Votos: Todos</option>
                <option value="com_votos">🟢 Tiveram Votos ({contadoresVotos.comVotos})</option>
                <option value="sem_votos">⚪ Não Tiveram Votos ({contadoresVotos.semVotos})</option>
              </select>

              {/* Caixa / Botão para Ocultar Seções sem Eleitor Cadastrado */}
              <button
                type="button"
                onClick={() => {
                  setOcultarSemCadastro((prev) => !prev);
                  setCurrentPage(1);
                }}
                className={`h-8 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border select-none ${
                  ocultarSemCadastro
                    ? 'bg-amber-500/15 border-amber-500/60 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30'
                    : 'bg-surface-container-lowest border-outline-variant/60 text-on-surface hover:bg-surface-container hover:border-outline-variant'
                }`}
                title="Ocultar seções que tiveram votos apurados no TSE mas não possuem nenhum eleitor cadastrado na sua base"
              >
                <input
                  type="checkbox"
                  checked={ocultarSemCadastro}
                  onChange={() => {}}
                  className="rounded w-3.5 h-3.5 accent-amber-600 pointer-events-none"
                />
                <EyeOff className={`w-3.5 h-3.5 ${ocultarSemCadastro ? 'text-amber-600 dark:text-amber-400' : 'text-on-surface-variant'}`} />
                <span className="whitespace-nowrap">
                  {ocultarSemCadastro ? 'Ocultando sem cadastro' : 'Ocultar sem cadastro'}
                </span>
                {secoesSemCadastroCount > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    ocultarSemCadastro
                      ? 'bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}>
                    {secoesSemCadastroCount}
                  </span>
                )}
              </button>

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
                  <th className="py-2 px-3 md:py-2.5 md:px-3.5 text-center">Situação (Urna vs Base)</th>
                  <th className="py-2 px-3 md:py-2.5 md:px-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 text-sm">
                {filteredSecoes.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-on-surface-variant">
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
                                <span className="text-[10px] text-on-surface-variant font-medium">
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

                        {/* Situação Cruzada: Urna vs Base Cadastrada */}
                        <td className="py-1.5 px-3 md:py-2 md:px-3.5 text-center">
                          {!secao.isApurada ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-on-surface-variant/70">
                              <Clock className="w-3 h-3 text-amber-500" /> Aguardando Urna
                            </span>
                          ) : secao.totalCadastrados === 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">
                              <Vote className="w-3 h-3" /> Votos Espontâneos
                            </span>
                          ) : secao.teveVotosSuficientes ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full" title={`A urna registrou ${secao.votosApurados} votos, cobrindo os ${secao.totalCadastrados} eleitores cadastrados`}>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Meta Cumprida
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full" title={`A urna registrou ${secao.votosApurados} votos, faltando ${Math.abs(secao.saldo)} votos para os ${secao.totalCadastrados} prometidos`}>
                              <AlertTriangle className="w-3 h-3 text-rose-600" /> Quebra de Votos (-{Math.abs(secao.saldo)})
                            </span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="py-1.5 px-3 md:py-2 md:px-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedSecao(secao)}
                            className="px-2.5 py-1 text-xs font-semibold text-secondary hover:underline bg-surface-container hover:bg-surface-container-high rounded transition-colors cursor-pointer"
                            title="Auditar cruzamento de eleitores e lideranças desta seção"
                          >
                            Auditar Seção ({secao.totalCadastrados})
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenPrintModal('liderancas')}
                className="px-2.5 py-1 text-[11px] font-semibold text-on-surface bg-surface-container-lowest hover:bg-surface-container rounded-md border border-outline-variant flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                title="Imprimir relatório geral de eficácia das lideranças"
              >
                <Printer className="w-3 h-3 text-secondary" />
                <span>Imprimir Relatório</span>
              </button>
              <span className="text-xs bg-surface-container text-on-surface px-2.5 py-1 rounded-full font-bold">
                {desempenhoLiderancas.length} Lideranças Ativas
              </span>
            </div>
          </div>

          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/60 text-xs text-on-surface-variant uppercase font-semibold">
                  <th className="py-2.5 px-4">Liderança / Articulador</th>
                  <th className="py-2.5 px-4 text-center">Eleitores Cadastrados</th>
                  <th className="py-2.5 px-4 text-center">Seções de Atuação</th>
                  <th className="py-2.5 px-4 text-center">Votos Validados / Cumpridos</th>
                  <th className="py-2.5 px-4">Cumprimento Real (%)</th>
                  <th className="py-2.5 px-4 text-center">Saldo Real</th>
                  <th className="py-2.5 px-4 text-center">Balanço das Seções</th>
                  <th className="py-2.5 px-4 text-center">Situação</th>
                  <th className="py-2.5 px-4 text-right">Ações</th>
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
                      <span className="text-[10px] text-on-surface-variant block">
                        ({item.eleitoresEmSecoesApuradas} apurados)
                      </span>
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      <span className="text-xs font-mono font-bold text-on-surface">
                        {item.secoesApuradas} / {item.secoesAtuadas}
                      </span>
                      <span className="text-[10px] text-on-surface-variant block">
                        {item.secoesApuradas === item.secoesAtuadas ? '100% apuradas' : 'seções apuradas'}
                      </span>
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      <span className="font-bold text-xs text-secondary font-mono">
                        {item.votosValidadosTotal}
                      </span>
                      <span className="text-[10px] text-on-surface-variant block">
                        de {item.eleitoresEmSecoesApuradas} esperados
                      </span>
                    </td>

                    <td className="py-2.5 px-4">
                      {item.classificacao !== 'Aguardando Urna' ? (
                        <div className="w-full max-w-[140px]">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className={`font-black text-xs ${
                              item.cumprimentoMedioPct >= 100
                                ? 'text-emerald-700'
                                : item.cumprimentoMedioPct >= 75
                                ? 'text-sky-700'
                                : 'text-rose-700'
                            }`}>
                              {item.cumprimentoMedioPct}%
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-medium">
                              {item.cumprimentoMedioPct >= 100 ? 'Superou' : item.cumprimentoMedioPct >= 75 ? 'Na meta' : 'Quebra'}
                            </span>
                          </div>
                          <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
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
                        <span className="text-xs text-on-surface-variant/60 italic flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-500" /> Aguardando Urnas
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      {item.secoesApuradas > 0 ? (
                        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                          item.saldoEstimado > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.saldoEstimado === 0
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {item.saldoEstimado > 0 ? `+${item.saldoEstimado}` : item.saldoEstimado}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant text-xs">-</span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs">
                        <span className="text-emerald-700 font-bold" title={`${item.secoesCumpridas} seções cumpriram a meta`}>
                          {item.secoesCumpridas} ✓
                        </span>
                        <span className="text-on-surface-variant/40">/</span>
                        <span className="text-rose-700 font-bold" title={`${item.secoesComQuebra} seções com quebra de votos`}>
                          {item.secoesComQuebra} ✗
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      {item.classificacao === 'Meta Cumprida' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Meta Cumprida
                        </span>
                      ) : item.classificacao === 'Cumprimento Parcial' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800">
                          <Check className="w-3 h-3 text-sky-600" /> Dentro da Meta
                        </span>
                      ) : item.classificacao === 'Quebra Grave' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800">
                          <AlertTriangle className="w-3 h-3 text-rose-600" /> Quebra de Votos
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                          <Clock className="w-3 h-3 text-amber-500" /> Aguardando Urnas
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedLiderancaAudit(item)}
                        className="px-2.5 py-1 text-xs font-semibold text-secondary hover:underline bg-surface-container hover:bg-surface-container-high rounded transition-colors cursor-pointer"
                        title="Ver auditoria detalhada de cada seção desta liderança"
                      >
                        Auditar Liderança
                      </button>
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
              {/* Alerta de Cruzamento Urna vs Base Cadastrada */}
              {selectedSecao.isApurada ? (
                selectedSecao.totalCadastrados === 0 ? (
                  <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 flex items-start gap-2.5">
                    <Vote className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Votos Espontâneos da Urna</p>
                      <p className="text-[11px] text-sky-800 mt-0.5">
                        Esta seção não possuía eleitores cadastrados previamente no sistema, mas o candidato obteve <strong>{selectedSecao.votosApurados} votos</strong> válidos na apuração.
                      </p>
                    </div>
                  </div>
                ) : selectedSecao.teveVotosSuficientes ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-emerald-950">✓ Meta Cumprida: Votos de Acordo com os Eleitores Cadastrados</p>
                      <p className="text-[11px] text-emerald-800 mt-0.5">
                        A urna registrou <strong>{selectedSecao.votosApurados} votos</strong>, quantidade suficiente para honrar os <strong>{selectedSecao.totalCadastrados} eleitores cadastrados</strong> pelas lideranças nesta seção (saldo positivo de +{selectedSecao.saldo} votos).
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-950">⚠️ Quebra de Votos: Urna Abaixo dos Eleitores Cadastrados</p>
                      <p className="text-[11px] text-rose-800 mt-0.5">
                        A urna registrou apenas <strong>{selectedSecao.votosApurados} votos</strong>, faltando <strong>{Math.abs(selectedSecao.saldo)} votos</strong> para honrar a meta dos <strong>{selectedSecao.totalCadastrados} eleitores prometidos</strong> pelas lideranças nesta seção.
                      </p>
                    </div>
                  </div>
                )
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-950">Aguardando Apuração da Urna</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Há {selectedSecao.totalCadastrados} eleitores cadastrados nesta seção aguardando importação do Boletim de Urna (TSE ou QR Code).
                    </p>
                  </div>
                </div>
              )}

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
                  Lideranças com Eleitores Nesta Seção ({selectedSecao.liderancasMap.size})
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                  {Array.from(selectedSecao.liderancasMap.values()).map((lid, i) => {
                    const pctDaSecao = selectedSecao.totalCadastrados > 0
                      ? Math.round((lid.count / selectedSecao.totalCadastrados) * 100)
                      : 0;
                    const votosLidSecao = selectedSecao.isApurada && typeof selectedSecao.votosApurados === 'number'
                      ? selectedSecao.teveVotosSuficientes
                        ? lid.count
                        : Math.min(lid.count, Math.round((lid.count / Math.max(1, selectedSecao.totalCadastrados)) * selectedSecao.votosApurados))
                      : null;

                    return (
                      <div
                        key={i}
                        className="px-3 py-2 bg-surface-container-low rounded-lg text-xs flex items-center justify-between"
                      >
                        <div>
                          <span className="font-semibold text-on-surface block">{lid.nome}</span>
                          <span className="text-[10px] text-on-surface-variant">
                            {pctDaSecao}% dos eleitores cadastrados desta seção
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-primary font-mono block">{lid.count} prometidos</span>
                          {votosLidSecao !== null && (
                            <span className={`text-[10px] font-bold ${
                              selectedSecao.teveVotosSuficientes ? 'text-emerald-700' : 'text-rose-700'
                            }`}>
                              {votosLidSecao} validados ({selectedSecao.teveVotosSuficientes ? '100%' : `${Math.round((votosLidSecao / lid.count) * 100)}%`})
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
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

      {/* MODAL DE AUDITORIA DETALHADA DA LIDERANÇA */}
      {selectedLiderancaAudit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-5 py-3.5 bg-surface border-b border-outline-variant/60 flex items-center justify-between">
              <div>
                <h3 className="text-sm md:text-base font-bold text-on-surface flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary" />
                  Auditoria de Eficácia: {selectedLiderancaAudit.nome}
                </h3>
                <p className="text-xs text-on-surface-variant font-medium mt-0.5">
                  {selectedLiderancaAudit.tipo || 'Liderança'} {selectedLiderancaAudit.liderancaPaiNome ? `• Articulador Superior: ${selectedLiderancaAudit.liderancaPaiNome}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenPrintModal('lideranca_individual', selectedLiderancaAudit)}
                  className="px-2.5 py-1 text-xs font-semibold text-on-surface bg-surface-container hover:bg-surface-container-high border border-outline-variant rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Imprimir relatório detalhado desta liderança"
                >
                  <Printer className="w-3.5 h-3.5 text-secondary" />
                  <span>Imprimir Auditoria</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLiderancaAudit(null)}
                  className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              {/* Cards de Resumo da Liderança */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-surface-container rounded-xl text-xs">
                  <p className="text-on-surface-variant text-[11px] font-bold uppercase">Cadastrados</p>
                  <p className="text-lg font-black text-on-surface mt-0.5">
                    {selectedLiderancaAudit.totalEleitoresPrometidos}
                  </p>
                  <p className="text-[10px] text-on-surface-variant font-medium">eleitores prometidos</p>
                </div>
                <div className="p-3 bg-surface-container rounded-xl text-xs">
                  <p className="text-on-surface-variant text-[11px] font-bold uppercase">Seções Apuradas</p>
                  <p className="text-lg font-black text-on-surface mt-0.5">
                    {selectedLiderancaAudit.secoesApuradas} / {selectedLiderancaAudit.secoesAtuadas}
                  </p>
                  <p className="text-[10px] text-on-surface-variant font-medium">
                    {selectedLiderancaAudit.eleitoresEmSecoesApuradas} eleitores avaliados
                  </p>
                </div>
                <div className="p-3 bg-surface-container rounded-xl text-xs">
                  <p className="text-secondary text-[11px] font-bold uppercase">Votos Validados</p>
                  <p className="text-lg font-black text-secondary mt-0.5">
                    {selectedLiderancaAudit.votosValidadosTotal}
                  </p>
                  <p className="text-[10px] text-on-surface-variant font-medium">atribuídos pelas urnas</p>
                </div>
                <div className={`p-3 rounded-xl border text-xs ${
                  selectedLiderancaAudit.cumprimentoMedioPct >= 100
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : selectedLiderancaAudit.cumprimentoMedioPct >= 75
                    ? 'border-sky-300 bg-sky-50/50'
                    : selectedLiderancaAudit.secoesApuradas > 0
                    ? 'border-rose-300 bg-rose-50/50'
                    : 'border-outline-variant/60 bg-surface-container'
                }`}>
                  <p className="text-[11px] font-bold uppercase text-on-surface">Cumprimento Real</p>
                  <p className={`text-lg font-black mt-0.5 ${
                    selectedLiderancaAudit.cumprimentoMedioPct >= 100 ? 'text-emerald-700' : selectedLiderancaAudit.cumprimentoMedioPct >= 75 ? 'text-sky-700' : 'text-rose-700'
                  }`}>
                    {selectedLiderancaAudit.secoesApuradas > 0 ? `${selectedLiderancaAudit.cumprimentoMedioPct}%` : 'Pendente'}
                  </p>
                  <p className="text-[10px] font-bold text-on-surface-variant">
                    {selectedLiderancaAudit.secoesApuradas > 0 ? `${selectedLiderancaAudit.saldoEstimado >= 0 ? '+' : ''}${selectedLiderancaAudit.saldoEstimado} saldo` : 'aguardando urnas'}
                  </p>
                </div>
              </div>

              {/* Tabela de Seções de Atuação */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                    Detalhamento por Seção Eleitoral ({selectedLiderancaAudit.detalhesSecoes.length})
                  </h4>
                  <span className="text-[11px] text-on-surface-variant font-medium">
                    {selectedLiderancaAudit.secoesCumpridas} cumpridas • {selectedLiderancaAudit.secoesComQuebra} com quebra
                  </span>
                </div>

                <div className="border border-outline-variant/60 rounded-xl overflow-hidden max-h-72 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface-container-low text-on-surface-variant text-[11px] font-semibold sticky top-0 border-b border-outline-variant/50">
                      <tr>
                        <th className="py-2 px-3">Zona / Seção</th>
                        <th className="py-2 px-3">Local de Votação</th>
                        <th className="py-2 px-3 text-center">Prometidos</th>
                        <th className="py-2 px-3 text-center">Total Seção</th>
                        <th className="py-2 px-3 text-center">Urna (BU)</th>
                        <th className="py-2 px-3 text-center">Validados</th>
                        <th className="py-2 px-3 text-center">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/30">
                      {selectedLiderancaAudit.detalhesSecoes.map((sec) => (
                        <tr key={sec.key} className="hover:bg-surface-container-low transition-colors">
                          <td className="py-2 px-3 font-mono font-bold text-on-surface">
                            Seção {sec.secao} <span className="text-[10px] text-on-surface-variant font-normal block">{sec.zona}</span>
                          </td>
                          <td className="py-2 px-3 max-w-[200px] truncate" title={sec.localNome}>
                            <p className="font-medium text-on-surface truncate">{sec.localNome}</p>
                            <p className="text-[10px] text-on-surface-variant">{sec.bairro}</p>
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-primary font-mono">
                            {sec.eleitoresLideranca}
                          </td>
                          <td className="py-2 px-3 text-center text-on-surface-variant font-mono">
                            {sec.totalEleitoresSecao}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-secondary font-mono">
                            {sec.isApurada ? sec.votosApurados : '-'}
                          </td>
                          <td className="py-2 px-3 text-center font-bold font-mono">
                            {sec.isApurada ? (
                              <span className={sec.teveVotosSuficientes ? 'text-emerald-700' : 'text-rose-700'}>
                                {sec.votosValidados}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {!sec.isApurada ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-on-surface-variant">
                                <Clock className="w-3 h-3 text-amber-500" /> Aguardando
                              </span>
                            ) : sec.teveVotosSuficientes ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Cumprida
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full" title={`Faltaram ${Math.abs(sec.saldoSecao)} votos para a cota prometida`}>
                                <AlertTriangle className="w-3 h-3 text-rose-600" /> Quebra ({sec.saldoSecao})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-surface border-t border-outline-variant/60 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedLiderancaAudit(null)}
                className="px-4 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold cursor-pointer"
              >
                Fechar Auditoria
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
          registeredSectionsInfo={registeredSectionsInfo}
          onDeleteAllVotes={() => setIsDeleteAllModalOpen(true)}
          existingVotesCount={apuracoes.length}
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

      {/* Modal 3: Confirmação de Exclusão de Todos os Votos da Importação */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-low border border-outline-variant/80 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl text-left space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface">
                    Excluir Votos da Importação
                  </h3>
                  <p className="text-[11px] text-on-surface-variant">
                    Zerar apuração de seções no sistema
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-on-surface leading-relaxed">
                Tem certeza de que deseja excluir permanentemente todos os <strong>{apuracoes.length} votos/apurações de seções</strong> cadastrados através das importações (TSE CSV, QR Code do BU ou digitação em lote)?
              </p>

              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Esta ação zerará a contagem das urnas:</p>
                  <p className="text-[11px] text-amber-200/80">
                    A base de <strong>eleitores cadastrados</strong> e de <strong>lideranças</strong> será preservada intacta. Apenas os boletins de urna apurados serão apagados.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/60">
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={() => setIsDeleteAllModalOpen(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={handleConfirmDeleteAllVotes}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 active:scale-[0.99] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-900/30 cursor-pointer disabled:opacity-50"
              >
                {isDeletingAll ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isDeletingAll ? 'Excluindo...' : 'Sim, Excluir Todos'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ENCERRAMENTO DE SEÇÕES PENDENTES COM 0 VOTOS (APURAÇÃO DEFINITIVA) */}
      {isClosePendingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-xl">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface">
                    Encerrar Seções Pendentes com 0 Votos
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Fechar apuração definitiva das seções sem votos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsClosePendingModalOpen(false)}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-surface-container-low rounded-xl border border-outline-variant/60 text-xs text-on-surface space-y-2">
              <p>
                O sistema detectou que você possui <strong className="text-amber-700 dark:text-amber-400 font-bold">{secoesPendentesBase.length} seções da sua base</strong> com o status <em>"Aguardando Urna"</em>.
              </p>
              <p className="text-on-surface-variant">
                Como o arquivo que você importou já é o <strong>final e definitivo</strong>, isso significa que nessas seções restantes o seu candidato não recebeu votos (0 votos nas urnas).
              </p>
              <div className="p-2.5 bg-surface-container rounded-lg font-medium text-[11px] text-on-surface-variant">
                Ao confirmar, o sistema registrará <strong>0 votos</strong> em cada uma dessas {secoesPendentesBase.length} seções, atualizando o status para <strong>Quebra de Votos</strong> e concluindo 100% da apuração da sua base.
              </div>
            </div>

            {/* Lista prévia com barra de rolagem */}
            <div className="max-h-40 overflow-y-auto border border-outline-variant/60 rounded-xl divide-y divide-outline-variant/40 bg-surface text-xs">
              {secoesPendentesBase.map((s) => (
                <div key={s.key} className="px-3 py-1.5 flex items-center justify-between text-[11px]">
                  <div>
                    <span className="font-bold text-primary">Seção {s.secao}</span> • <span className="text-on-surface-variant">Zona {s.zona}</span>
                    <span className="text-[10px] text-on-surface-variant block">{s.localNome} ({s.bairro})</span>
                  </div>
                  <span className="font-semibold text-rose-700">
                    {s.totalCadastrados} cadastrados → 0 votos
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-outline-variant/60">
              <button
                type="button"
                onClick={() => setIsClosePendingModalOpen(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isClosingPending}
                onClick={handleConfirmClosePending}
                className="flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 active:scale-[0.99] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-900/30 cursor-pointer disabled:opacity-50"
              >
                {isClosingPending ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{isClosingPending ? 'Encerrando...' : `Confirmar 0 Votos (${secoesPendentesBase.length})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE IMPRESSÃO PROFISSIONAL DE RELATÓRIO */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/75 backdrop-blur-xs animate-fadeIn overflow-y-auto print:fixed print:inset-0 print:p-0 print:bg-white print:overflow-visible print:z-[9999]">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-5xl w-full shadow-2xl flex flex-col max-h-[95vh] my-auto print:border-none print:shadow-none print:max-w-none print:max-h-none print:p-0 print:m-0 print:rounded-none print:w-full print:h-auto">
            {/* Top Bar do Modal (não visível na impressão física) */}
            <div className="no-print px-5 py-3.5 bg-surface border-b border-outline-variant/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-secondary/10 text-secondary rounded-xl">
                  <Printer className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <h3 className="text-sm md:text-base font-bold text-on-surface">
                    Relatório para Impressão • Cumprimento de Votos
                  </h3>
                  <p className="text-xs text-on-surface-variant font-medium">
                    Pré-visualização formatada para papel A4 e exportação para PDF
                  </p>
                </div>
              </div>

              {/* Controles de Modelo, Escopo e Impressão */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Seletor de Modelo de Relatório */}
                <div className="inline-flex rounded-lg border border-outline-variant bg-surface-container-low p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setPrintReportType('secoes')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                      printReportType === 'secoes'
                        ? 'bg-surface-container-lowest text-on-surface shadow-2xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Por Seção ({filteredSecoes.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintReportType('liderancas')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                      printReportType === 'liderancas'
                        ? 'bg-surface-container-lowest text-on-surface shadow-2xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Por Liderança ({desempenhoLiderancas.length})
                  </button>
                  {printSelectedLideranca && (
                    <button
                      type="button"
                      onClick={() => setPrintReportType('lideranca_individual')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                        printReportType === 'lideranca_individual'
                          ? 'bg-surface-container-lowest text-on-surface shadow-2xs'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {printSelectedLideranca.nome}
                    </button>
                  )}
                </div>

                {/* Filtro de Escopo de Impressão */}
                <select
                  value={printScope}
                  onChange={(e) => setPrintScope(e.target.value as any)}
                  className="h-8 bg-surface-container-lowest border border-outline-variant/60 rounded-lg px-2 text-xs text-on-surface font-medium focus:outline-none"
                >
                  <option value="todas">Todos os registros filtrados</option>
                  <option value="com_votos">Apenas Seções que Tiveram Votos</option>
                  <option value="sem_votos">Apenas Seções que Não Tiveram Votos</option>
                  <option value="apenas_apuradas">Apenas Seções Apuradas</option>
                  <option value="apenas_quebras">Apenas com Quebra / Críticas</option>
                </select>

                {/* Botão de Disparo Direto */}
                <button
                  type="button"
                  onClick={handleTriggerPrint}
                  className="px-4 py-1.5 bg-primary hover:bg-secondary text-on-primary rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Imprimir folha A4 ou salvar como PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Agora (Ctrl + P)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                  title="Fechar pré-visualização"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ÁREA IMPRIMÍVEL DO DOCUMENTO (Formatação A4 Oficial) */}
            <div
              id="printable-report-area"
              className="flex-1 overflow-y-auto bg-white text-slate-900 p-6 md:p-8 custom-scrollbar space-y-4 text-xs font-sans print:p-0 print:border-none print:shadow-none print:overflow-visible print:text-black"
            >
              {/* Cabeçalho Timbrado Oficial */}
              <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black tracking-widest uppercase bg-slate-900 text-white px-2 py-0.5 rounded">
                      SEATI ELEITORAL
                    </span>
                    <span className="text-[11px] font-bold text-slate-600">
                      Sistema de Conciliação e Auditoria de Votos
                    </span>
                  </div>
                  <h1 className="text-lg md:text-xl font-black text-slate-950 mt-1 uppercase tracking-tight">
                    {printReportType === 'secoes'
                      ? 'Relatório de Cumprimento de Votos por Seção Eleitoral'
                      : printReportType === 'liderancas'
                      ? 'Relatório de Auditoria de Cumprimento por Liderança'
                      : `Auditoria de Eficácia: ${printSelectedLideranca?.nome.toUpperCase()}`}
                  </h1>
                  <p className="text-xs text-slate-700 font-medium">
                    Campanha: <strong>{campaignDisplayName}</strong>
                    {printSelectedLideranca?.liderancaPaiNome && (
                      <span> • Articulador Superior: <strong>{printSelectedLideranca.liderancaPaiNome}</strong></span>
                    )}
                  </p>
                </div>

                <div className="text-right text-[10px] text-slate-600 font-mono shrink-0">
                  <p>
                    Emissão: <strong>{new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
                  </p>
                  <p>Operador: <strong>{currentUser?.nome || 'Coordenação de Campanha'}</strong></p>
                  <p className="mt-0.5">
                    Registros Listados: <strong>{
                      printReportType === 'secoes'
                        ? printSecoesList.length
                        : printReportType === 'liderancas'
                        ? printLiderancasList.length
                        : printSelectedLideranca?.detalhesSecoes.length || 0
                    }</strong>
                  </p>
                </div>
              </div>

              {/* Filtros e Escopo Aplicados */}
              <div className="p-2 bg-slate-100 rounded border border-slate-200 text-[10px] text-slate-700 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900">Filtros da Listagem: </span>
                  <span>{activeFiltersSummaryText}</span>
                </div>
                {printScope !== 'todas' && (
                  <span className="font-semibold text-slate-800">
                    • Escopo: {printScope === 'com_votos' ? 'Apenas Seções que Tiveram Votos' : printScope === 'sem_votos' ? 'Apenas Seções que Não Tiveram Votos' : printScope === 'apenas_apuradas' ? 'Apenas Seções Apuradas' : 'Apenas com Quebra de Votos'}
                  </span>
                )}
              </div>

              {/* Resumo Estatístico em 4 Blocos Compactos */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 border border-slate-300 rounded bg-slate-50">
                  <p className="text-[9px] font-bold uppercase text-slate-500">Eleitores Cadastrados</p>
                  <p className="text-sm font-black text-slate-900 mt-0.5 font-mono">{stats.totalEleitoresCadastrados}</p>
                  <p className="text-[9px] text-slate-500">{stats.secoesComEleitoresCount} seções da base</p>
                </div>
                <div className="p-2 border border-slate-300 rounded bg-slate-50">
                  <p className="text-[9px] font-bold uppercase text-slate-500">Votos nas Urnas</p>
                  <p className="text-sm font-black text-slate-900 mt-0.5 font-mono">{stats.totalVotosImportados}</p>
                  <p className="text-[9px] text-slate-500">{stats.totalSecoesImportadas} seções importadas</p>
                </div>
                <div className="p-2 border border-slate-300 rounded bg-slate-50">
                  <p className="text-[9px] font-bold uppercase text-slate-500">Cumprimento Real</p>
                  <p className="text-sm font-black text-slate-900 mt-0.5 font-mono">{stats.taxaCumprimentoReal}%</p>
                  <p className="text-[9px] text-slate-500">
                    {stats.votosCumpridosBase} cumpridos / {stats.totalEleitoresCadastrados} prometidos
                    {stats.votosQuebradosBase > 0 && ` (${stats.votosQuebradosBase} quebras)`}
                  </p>
                </div>
                <div className="p-2 border border-slate-300 rounded bg-slate-50">
                  <p className="text-[9px] font-bold uppercase text-slate-500">Balanço das Seções</p>
                  <p className="text-sm font-black text-slate-900 mt-0.5 font-mono">
                    {stats.secoesCadastradasCumpridasCount} ✓ / {stats.secoesCadastradasQuebradasCount} ✗
                  </p>
                  <p className="text-[9px] text-slate-500">{stats.taxaCoberturaBase}% da base apurada</p>
                </div>
              </div>

              {/* MODELO 1: TABELA DE SEÇÕES ELEITORAIS */}
              {printReportType === 'secoes' && (
                <div className="space-y-2">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold">
                        <th className="py-1.5 px-2 text-center w-8">#</th>
                        <th className="py-1.5 px-2 text-center w-20">Zona / Seção</th>
                        <th className="py-1.5 px-2">Local de Votação (Colégio)</th>
                        <th className="py-1.5 px-2">Bairro</th>
                        <th className="py-1.5 px-2 text-center w-16">Cadastrados</th>
                        <th className="py-1.5 px-2 text-center w-16">Votos Urna</th>
                        <th className="py-1.5 px-2 text-center w-16">Cumprimento</th>
                        <th className="py-1.5 px-2 text-center w-14">Saldo</th>
                        <th className="py-1.5 px-2 text-center w-24">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {printSecoesList.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-500">
                            Nenhuma seção eleitoral encontrada com os filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        printSecoesList.map((item, idx) => (
                          <tr key={item.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-600">{idx + 1}</td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">{item.zona} / {item.secao}</td>
                            <td className="py-1.5 px-2 font-medium">{item.localNome}</td>
                            <td className="py-1.5 px-2 text-slate-600">{item.bairro}</td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">{item.totalCadastrados}</td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">
                              {item.isApurada ? item.votosApurados : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">
                              {item.isApurada ? `${item.cumprimentoPct}%` : 'Pendente'}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">
                              {item.isApurada ? (item.saldo > 0 ? `+${item.saldo}` : item.saldo) : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-center font-semibold text-[9px]">
                              {item.isApurada ? (
                                item.teveVotosSuficientes ? (
                                  <span className="text-emerald-800 font-bold">✓ Meta Cumprida</span>
                                ) : (
                                  <span className="text-rose-800 font-bold">✗ Quebra de Votos</span>
                                )
                              ) : (
                                <span className="text-slate-500 italic">Aguardando Urna</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {printSecoesList.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-200 font-bold text-slate-900 border-t-2 border-slate-800">
                          <td colSpan={4} className="py-1.5 px-2 text-right uppercase">
                            Totais Listados ({printSecoesList.length} seções):
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono">
                            {printSecoesList.reduce((acc, s) => acc + s.totalCadastrados, 0)}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono">
                            {printSecoesList.reduce((acc, s) => acc + (s.votosApurados || 0), 0)}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono">
                            {(() => {
                              const cad = printSecoesList.reduce((acc, s) => acc + (s.isApurada ? s.totalCadastrados : 0), 0);
                              const vot = printSecoesList.reduce((acc, s) => acc + (s.isApurada ? (s.votosApurados || 0) : 0), 0);
                              return cad > 0 ? `${Math.round((vot / cad) * 100)}%` : '-';
                            })()}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono">
                            {(() => {
                              const sld = printSecoesList.reduce((acc, s) => acc + (s.isApurada ? s.saldo : 0), 0);
                              return sld > 0 ? `+${sld}` : sld;
                            })()}
                          </td>
                          <td className="py-1.5 px-2 text-center text-[9px]">
                            {printSecoesList.filter((s) => s.isApurada).length} apuradas
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* MODELO 2: TABELA DE AUDITORIA POR LIDERANÇA */}
              {printReportType === 'liderancas' && (
                <div className="space-y-2">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold">
                        <th className="py-1.5 px-2 text-center w-8">#</th>
                        <th className="py-1.5 px-2">Liderança / Articulador</th>
                        <th className="py-1.5 px-2">Tipo / Superior</th>
                        <th className="py-1.5 px-2 text-center w-20">Prometidos</th>
                        <th className="py-1.5 px-2 text-center w-20">Seções Apuradas</th>
                        <th className="py-1.5 px-2 text-center w-24">Votos Validados</th>
                        <th className="py-1.5 px-2 text-center w-20">Cumprimento</th>
                        <th className="py-1.5 px-2 text-center w-16">Saldo Real</th>
                        <th className="py-1.5 px-2 text-center w-24">Balanço Seções</th>
                        <th className="py-1.5 px-2 text-center w-24">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {printLiderancasList.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-slate-500">
                            Nenhuma liderança encontrada com os filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        printLiderancasList.map((lider, idx) => (
                          <tr key={lider.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-600">{idx + 1}</td>
                            <td className="py-1.5 px-2 font-bold text-slate-900">{lider.nome}</td>
                            <td className="py-1.5 px-2 text-slate-600">
                              {lider.tipo || 'Liderança'} {lider.liderancaPaiNome ? `(Sub de ${lider.liderancaPaiNome})` : ''}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">
                              {lider.totalEleitoresPrometidos}
                              <span className="text-[9px] text-slate-500 block">({lider.eleitoresEmSecoesApuradas} apurados)</span>
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono">
                              {lider.secoesApuradas} / {lider.secoesAtuadas}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-900">
                              {lider.votosValidadosTotal}
                              <span className="text-[9px] text-slate-500 block">de {lider.eleitoresEmSecoesApuradas} esp.</span>
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">
                              {lider.secoesApuradas > 0 ? `${lider.cumprimentoMedioPct}%` : 'Pendente'}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">
                              {lider.secoesApuradas > 0 ? (lider.saldoEstimado > 0 ? `+${lider.saldoEstimado}` : lider.saldoEstimado) : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono text-[9px]">
                              <span className="text-emerald-800 font-bold">{lider.secoesCumpridas}✓</span> / <span className="text-rose-800 font-bold">{lider.secoesComQuebra}✗</span>
                            </td>
                            <td className="py-1.5 px-2 text-center font-semibold text-[9px]">
                              {lider.classificacao === 'Meta Cumprida' ? (
                                <span className="text-emerald-800 font-bold">Meta Cumprida</span>
                              ) : lider.classificacao === 'Cumprimento Parcial' ? (
                                <span className="text-sky-800 font-bold">Dentro da Meta</span>
                              ) : lider.classificacao === 'Quebra Grave' ? (
                                <span className="text-rose-800 font-bold">Quebra de Votos</span>
                              ) : (
                                <span className="text-slate-500 italic">Aguardando Urna</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {printLiderancasList.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-200 font-bold text-slate-900 border-t-2 border-slate-800">
                          <td colSpan={3} className="py-1.5 px-2 text-right uppercase">
                            Totais de Lideranças ({printLiderancasList.length}):
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono">
                            {printLiderancasList.reduce((acc, l) => acc + l.totalEleitoresPrometidos, 0)}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono">
                            {printLiderancasList.reduce((acc, l) => acc + l.secoesApuradas, 0)} apuradas
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono">
                            {printLiderancasList.reduce((acc, l) => acc + l.votosValidadosTotal, 0)}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono">
                            {(() => {
                              const esp = printLiderancasList.reduce((acc, l) => acc + l.eleitoresEmSecoesApuradas, 0);
                              const val = printLiderancasList.reduce((acc, l) => acc + l.votosValidadosTotal, 0);
                              return esp > 0 ? `${Math.round((val / esp) * 100)}%` : '-';
                            })()}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono">
                            {(() => {
                              const esp = printLiderancasList.reduce((acc, l) => acc + l.eleitoresEmSecoesApuradas, 0);
                              const val = printLiderancasList.reduce((acc, l) => acc + l.votosValidadosTotal, 0);
                              const diff = val - esp;
                              return diff > 0 ? `+${diff}` : diff;
                            })()}
                          </td>
                          <td colSpan={2} className="py-1.5 px-2 text-center text-[9px]">
                            {printLiderancasList.reduce((acc, l) => acc + l.secoesCumpridas, 0)} seções cumpridas
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* MODELO 3: AUDITORIA INDIVIDUAL DE UMA LIDERANÇA ESPECÍFICA */}
              {printReportType === 'lideranca_individual' && printSelectedLideranca && (
                <div className="space-y-4">
                  {/* Resumo do Articulador */}
                  <div className="p-3 bg-slate-50 border border-slate-300 rounded grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-[9px] uppercase text-slate-500 font-bold">Total Prometido</p>
                      <p className="text-base font-black text-slate-900 font-mono mt-0.5">
                        {printSelectedLideranca.totalEleitoresPrometidos}
                      </p>
                      <p className="text-[9px] text-slate-500">eleitores na base</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-slate-500 font-bold">Seções de Atuação</p>
                      <p className="text-base font-black text-slate-900 font-mono mt-0.5">
                        {printSelectedLideranca.secoesApuradas} / {printSelectedLideranca.secoesAtuadas}
                      </p>
                      <p className="text-[9px] text-slate-500">{printSelectedLideranca.eleitoresEmSecoesApuradas} eleitores avaliados</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-slate-500 font-bold">Votos Validados</p>
                      <p className="text-base font-black text-slate-900 font-mono mt-0.5">
                        {printSelectedLideranca.votosValidadosTotal}
                      </p>
                      <p className="text-[9px] text-slate-500">atribuídos pelas urnas</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-slate-500 font-bold">Eficácia Real</p>
                      <p className="text-base font-black text-slate-900 font-mono mt-0.5">
                        {printSelectedLideranca.cumprimentoMedioPct}%
                      </p>
                      <p className="text-[9px] text-slate-500">
                        {printSelectedLideranca.saldoEstimado > 0 ? `+${printSelectedLideranca.saldoEstimado}` : printSelectedLideranca.saldoEstimado} saldo real
                      </p>
                    </div>
                  </div>

                  {/* Tabela de Seções Desta Liderança */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
                      Desempenho por Seção Eleitoral ({printSelectedLideranca.detalhesSecoes.length} seções)
                    </h3>
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead>
                        <tr className="bg-slate-900 text-white font-bold">
                          <th className="py-1.5 px-2 text-center w-8">#</th>
                          <th className="py-1.5 px-2 text-center w-20">Zona / Seção</th>
                          <th className="py-1.5 px-2">Local de Votação (Colégio)</th>
                          <th className="py-1.5 px-2">Bairro</th>
                          <th className="py-1.5 px-2 text-center w-16">Prometidos</th>
                          <th className="py-1.5 px-2 text-center w-16">Votos Urna</th>
                          <th className="py-1.5 px-2 text-center w-16">Validados</th>
                          <th className="py-1.5 px-2 text-center w-14">Saldo</th>
                          <th className="py-1.5 px-2 text-center w-24">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300">
                        {printSelectedLideranca.detalhesSecoes.map((sec, idx) => (
                          <tr key={sec.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-600">{idx + 1}</td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">{sec.zona} / {sec.secao}</td>
                            <td className="py-1.5 px-2 font-medium">{sec.localNome}</td>
                            <td className="py-1.5 px-2 text-slate-600">{sec.bairro}</td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">{sec.eleitoresLideranca}</td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">
                              {sec.isApurada ? sec.votosApurados : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">
                              {sec.isApurada ? sec.votosValidados : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">
                              {sec.isApurada ? (sec.saldoSecao > 0 ? `+${sec.saldoSecao}` : sec.saldoSecao) : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-center font-semibold text-[9px]">
                              {sec.isApurada ? (
                                sec.teveVotosSuficientes ? (
                                  <span className="text-emerald-800 font-bold">✓ Cumprida</span>
                                ) : (
                                  <span className="text-rose-800 font-bold">✗ Quebra</span>
                                )
                              ) : (
                                <span className="text-slate-500 italic">Aguardando</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Relação Nominal Resumida dos Eleitores Desta Liderança */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
                      Relação Nominal dos Eleitores Cadastrados ({printSelectedLideranca.detalhesSecoes.flatMap((s) => s.eleitores).length} eleitores)
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] border border-slate-300 p-2 rounded bg-slate-50">
                      {printSelectedLideranca.detalhesSecoes
                        .flatMap((s) => s.eleitores)
                        .map((e, idx) => (
                          <div key={e.id || idx} className="flex items-center justify-between py-0.5 border-b border-slate-200">
                            <span className="font-semibold text-slate-900 truncate max-w-[180px]">
                              {idx + 1}. {e.nome}
                            </span>
                            <span className="text-slate-600 font-mono">
                              Z{e.zona}/S{e.secao} • {e.bairro || 'Sem Bairro'}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Rodapé Oficial da Folha Timbrada */}
              <div className="pt-4 border-t-2 border-slate-800 text-[9px] text-slate-600 flex justify-between items-end">
                <div>
                  <p className="font-bold text-slate-900">SEATI Eleitoral • Sistema de Auditoria e Gestão Estratégica</p>
                  <p>Documento de auditoria interna para conferência e prestação de contas da campanha.</p>
                  <p className="text-slate-500 mt-0.5">Gerado automaticamente em {new Date().toLocaleDateString('pt-BR')}.</p>
                </div>
                <div className="text-right">
                  <p className="mb-6 font-mono text-[8px] text-slate-400">Visto da Coordenação</p>
                  <p className="border-t border-slate-500 pt-1 font-semibold text-slate-800">
                    Assinatura do Responsável
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
