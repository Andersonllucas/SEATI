'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LocalCard } from '@/components/LocalCard';
import {
  MapPin,
  Search,
  School,
  Users,
  CheckCircle2,
  ChevronRight,
  BarChart3,
  Plus,
  Trash2,
  X,
  Building2,
  Sparkles,
  Check,
  AlertCircle,
  Layers,
  ArrowUpDown,
  Upload,
  FileSpreadsheet,
  FileText,
  Download,
  AlertTriangle,
  RefreshCw,
  GitMerge,
  ShieldCheck,
  Compass,
  Printer,
  ExternalLink,
  Link2,
  Eye
} from 'lucide-react';
import { useCampaignData, LocalVotacao } from '@/context/CampaignContext';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { exportLocaisReal } from '@/lib/importExportUtils';
import {
  CIDADES_DISPONIVEIS,
  ESTADOS_BRASIL,
  processLocaisCrossMatch,
  parseLocaisCSV,
  LocalConflictItem,
  CrossMatchResult
} from '@/lib/locaisCatalog';

export interface SecaoPendente {
  key: string;              // e.g. "1:42"
  zonaOriginal: string;     // e.g. "001"
  secaoOriginal: string;    // e.g. "0042"
  zonaFormatada: string;    // e.g. "001"
  secaoFormatada: string;   // e.g. "0042"
  totalEleitores: number;
  eleitores: Array<{
    id: string;
    nome: string;
    bairro: string;
    lideranca?: string;
    telefone?: string;
  }>;
  bairrosFrequentes: string[];
  liderancasFrequentes: string[];
}

const normalizeNum = (val?: string | number): string => {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  const digits = str.replace(/\D/g, '');
  if (digits) {
    const num = parseInt(digits, 10);
    return isNaN(num) ? str.toLowerCase() : String(num);
  }
  return str.toLowerCase();
};

const TIPOS_ESTABELECIMENTO = [
  'Escola Estadual',
  'Escola Municipal',
  'Colégio Particular',
  'Faculdade / Universidade',
  'CIEP / Centro Integrado',
  'Creche / Núcleo Infantil',
  'Centro Comunitário',
  'Outro'
];

const formatSecoesText = (secoes?: string | string[]): string => {
  if (!secoes) return '-';
  if (Array.isArray(secoes)) return secoes.join(', ');
  return String(secoes);
};

const toSecoesArray = (secoes?: string | string[]): string[] => {
  if (!secoes) return [];
  if (Array.isArray(secoes)) return secoes;
  return String(secoes).split(',').map((s) => s.trim()).filter(Boolean);
};

export default function LocaisVotacaoPage() {
  const {
    locais,
    eleitores,
    addLocalVotacao,
    updateLocalVotacao,
    deleteLocalVotacao,
    batchDeleteLocais,
    batchSaveLocais
  } = useCampaignData();
  const { solicitarSenhaMestre, registrarLog, systemConfig, atualizarConfiguracoes } = useAuth();
  const activeCity = systemConfig?.municipioPadrao || 'Teresina';
  const activeUf = systemConfig?.ufPadrao || 'PI';

  // Search, filter & sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedZona, setSelectedZona] = useState('todas');
  const [selectedTipo, setSelectedTipo] = useState('todos');
  const [sortBy, setSortBy] = useState<'nome' | 'eleitores' | 'secoes' | 'capacidade'>('eleitores');

  // Batch Selection & Batch Delete State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBatchDeleteDialogOpen, setIsBatchDeleteDialogOpen] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // Drawer / Form state for manual creation & edit
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('Escola Estadual');
  const [zona, setZona] = useState('001');
  const [bairro, setBairro] = useState('');
  const [endereco, setEndereco] = useState('');
  const [municipio, setMunicipio] = useState(activeCity);
  const [uf, setUf] = useState(activeUf);
  const [capacidadeAprox, setCapacidadeAprox] = useState<number>(1500);
  const [secoes, setSecoes] = useState<string[]>([]);
  const [newSecaoInput, setNewSecaoInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // In-app Delete Confirmation Dialog (Iframe-safe)
  const [deleteDialog, setDeleteDialog] = useState<LocalVotacao | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Detail Modal / View Voters State
  const [viewVotersLocal, setViewVotersLocal] = useState<LocalVotacao | null>(null);

  // Modal 1: Official Catalog Importer by State / City
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogUf, setCatalogUf] = useState<string>(activeUf);
  const [selectedCidadeIdx, setSelectedCidadeIdx] = useState(0);
  const [isProcessingCatalog, setIsProcessingCatalog] = useState(false);
  const [definirPadraoAoImportar, setDefinirPadraoAoImportar] = useState(true);
  const [customCidadeNome, setCustomCidadeNome] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Quick State/City Changer Modal
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locModalUf, setLocModalUf] = useState<string>(activeUf);
  const [locModalCidade, setLocModalCidade] = useState<string>(activeCity);
  const [isSavingLocation, setIsSavingLocation] = useState(false);

  // Modal 2: CSV Importer
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<Omit<LocalVotacao, 'id'>[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isProcessingCsv, setIsProcessingCsv] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cross-Matching & Conflicts Engine State
  const [activeConflicts, setActiveConflicts] = useState<LocalConflictItem[]>([]);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const { currentTenant, subdomain } = useTenant();
  const activeCampaignName = currentTenant?.nome || (subdomain && subdomain !== 'demo' ? `Campanha ${subdomain}` : 'Campanha Teresina 2026');

  // Estado para seções pendentes de cadastro (identificadas nos eleitores mas sem local cadastrado)
  const [isPendingExpanded, setIsPendingExpanded] = useState(true);
  const [searchPending, setSearchPending] = useState('');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [viewPendingVotersItem, setViewPendingVotersItem] = useState<SecaoPendente | null>(null);
  const [linkModalItem, setLinkModalItem] = useState<SecaoPendente | null>(null);
  const [selectedLocalToLink, setSelectedLocalToLink] = useState('');
  const [isLinkingSecao, setIsLinkingSecao] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Tecla ESC para fechar gavetas e modais abertos
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDrawerOpen) setIsDrawerOpen(false);
        else if (isCatalogModalOpen) setIsCatalogModalOpen(false);
        else if (isLocationModalOpen) setIsLocationModalOpen(false);
        else if (isCsvModalOpen) setIsCsvModalOpen(false);
        else if (isConflictModalOpen) setIsConflictModalOpen(false);
        else if (isPrintModalOpen) setIsPrintModalOpen(false);
        else if (viewPendingVotersItem) setViewPendingVotersItem(null);
        else if (linkModalItem) setLinkModalItem(null);
        else if (viewVotersLocal) setViewVotersLocal(null);
        else if (isExportMenuOpen) setIsExportMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isDrawerOpen,
    isCatalogModalOpen,
    isLocationModalOpen,
    isCsvModalOpen,
    isConflictModalOpen,
    isPrintModalOpen,
    viewPendingVotersItem,
    linkModalItem,
    viewVotersLocal,
    isExportMenuOpen
  ]);

  // Associate voters to voting locations based on zone & section match or neighborhood
  const locaisWithStats = useMemo(() => {
    return locais.map((local) => {
      const votersInLocal = eleitores.filter((e) => {
        if (e.zona && local.zona && normalizeNum(e.zona) === normalizeNum(local.zona)) {
          const voterSecao = (e.secao || '').trim();
          if (voterSecao && toSecoesArray(local.secoes).some((s) => normalizeNum(s) === normalizeNum(voterSecao))) {
            return true;
          }
        }
        if (e.bairro && local.bairro && e.bairro.trim().toLowerCase() === local.bairro.trim().toLowerCase()) {
          return true;
        }
        return false;
      });

      return {
        ...local,
        eleitoresIdentificados: votersInLocal.length,
        votersList: votersInLocal
      };
    });
  }, [locais, eleitores]);

  // Conjunto normalizado de todas as combinações (Zona, Seção) já cadastradas nos locais de votação
  const registeredPairs = useMemo(() => {
    const set = new Set<string>();
    locais.forEach((l) => {
      const normZ = normalizeNum(l.zona);
      if (!normZ) return;
      const sArr = toSecoesArray(l.secoes);
      sArr.forEach((s) => {
        const normS = normalizeNum(s);
        if (normS) {
          set.add(`${normZ}:${normS}`);
        }
      });
    });
    return set;
  }, [locais]);

  // Identificação e agrupamento de todas as Zonas e Seções dos eleitores que ainda NÃO possuem local cadastrado
  const secoesPendentes = useMemo(() => {
    const groups = new Map<
      string,
      {
        zonaRaw: string;
        secaoRaw: string;
        eleitores: Array<{ id: string; nome: string; bairro: string; lideranca?: string; telefone?: string }>;
        bairrosMap: Map<string, number>;
        liderancasMap: Map<string, number>;
      }
    >();

    eleitores.forEach((e) => {
      const rawZ = (e.zona || '').trim();
      const rawS = (e.secao || '').trim();
      if (!rawZ || !rawS) return;

      const normZ = normalizeNum(rawZ);
      const normS = normalizeNum(rawS);
      if (!normZ || !normS) return;

      const key = `${normZ}:${normS}`;
      if (!registeredPairs.has(key)) {
        if (!groups.has(key)) {
          groups.set(key, {
            zonaRaw: rawZ,
            secaoRaw: rawS,
            eleitores: [],
            bairrosMap: new Map<string, number>(),
            liderancasMap: new Map<string, number>()
          });
        }
        const g = groups.get(key)!;
        g.eleitores.push({
          id: e.id,
          nome: e.nome,
          bairro: e.bairro || '',
          lideranca: e.lideranca || '',
          telefone: e.telefone || ''
        });

        if (e.bairro && e.bairro.trim()) {
          const b = e.bairro.trim();
          g.bairrosMap.set(b, (g.bairrosMap.get(b) || 0) + 1);
        }
        if (e.lideranca && e.lideranca.trim()) {
          const l = e.lideranca.trim();
          g.liderancasMap.set(l, (g.liderancasMap.get(l) || 0) + 1);
        }
      }
    });

    const list: SecaoPendente[] = [];
    groups.forEach((g, key) => {
      const [normZ, normS] = key.split(':');
      const zonaFormatada = normZ.padStart(3, '0');
      const secaoFormatada = normS.padStart(4, '0');

      const topBairros = Array.from(g.bairrosMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map((entry) => entry[0]);

      const topLiderancas = Array.from(g.liderancasMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map((entry) => entry[0]);

      list.push({
        key,
        zonaOriginal: g.zonaRaw,
        secaoOriginal: g.secaoRaw,
        zonaFormatada,
        secaoFormatada,
        totalEleitores: g.eleitores.length,
        eleitores: g.eleitores,
        bairrosFrequentes: topBairros,
        liderancasFrequentes: topLiderancas
      });
    });

    return list.sort((a, b) => {
      if (b.totalEleitores !== a.totalEleitores) {
        return b.totalEleitores - a.totalEleitores;
      }
      if (a.zonaFormatada !== b.zonaFormatada) {
        return a.zonaFormatada.localeCompare(b.zonaFormatada);
      }
      return a.secaoFormatada.localeCompare(b.secaoFormatada);
    });
  }, [eleitores, registeredPairs]);

  const totalEleitoresPendentes = useMemo(() => {
    return secoesPendentes.reduce((acc, s) => acc + s.totalEleitores, 0);
  }, [secoesPendentes]);

  // Filtro de busca na lista de seções pendentes
  const filteredSecoesPendentes = useMemo(() => {
    const q = (searchPending || '').toLowerCase().trim();
    if (!q) return secoesPendentes;
    return secoesPendentes.filter((s) => {
      return (
        s.zonaFormatada.includes(q) ||
        s.secaoFormatada.includes(q) ||
        s.zonaOriginal.toLowerCase().includes(q) ||
        s.secaoOriginal.toLowerCase().includes(q) ||
        s.bairrosFrequentes.some((b) => b.toLowerCase().includes(q)) ||
        s.liderancasFrequentes.some((l) => l.toLowerCase().includes(q))
      );
    });
  }, [secoesPendentes, searchPending]);

  // Handlers para ações rápidas de resolução de pendências
  const handleOpenCreateForSecao = (p: SecaoPendente) => {
    setEditingId(null);
    setNome('');
    setTipo('Escola Municipal');
    setZona(p.zonaFormatada);
    setBairro(p.bairrosFrequentes[0] || '');
    setEndereco('');
    setMunicipio(activeCity);
    setUf(activeUf);
    setCapacidadeAprox(1500);
    setSecoes([p.secaoFormatada]);
    setNewSecaoInput('');
    setIsDrawerOpen(true);
  };

  const handleOpenLinkModal = (p: SecaoPendente) => {
    setLinkModalItem(p);
    const sameZonaLocals = locais.filter((l) => normalizeNum(l.zona) === normalizeNum(p.zonaFormatada));
    setSelectedLocalToLink(sameZonaLocals[0]?.id || locais[0]?.id || '');
  };

  const handleConfirmLinkToExisting = async () => {
    if (!linkModalItem || !selectedLocalToLink) return;
    const target = locais.find((l) => l.id === selectedLocalToLink);
    if (!target) return;

    setIsLinkingSecao(true);
    try {
      const currentSecoes = toSecoesArray(target.secoes);
      const secaoToAdd = linkModalItem.secaoFormatada;
      if (!currentSecoes.includes(secaoToAdd)) {
        const updatedSecoes = [...currentSecoes, secaoToAdd];
        await updateLocalVotacao(target.id, { secoes: updatedSecoes });
        await registrarLog({
          tipo: 'ALTERACAO',
          acao: `Seção ${secaoToAdd} vinculada ao local existente: ${target.nome}`,
          detalhes: `Zona ${target.zona} | Seções atualizadas: ${updatedSecoes.join(', ')}`,
          entidade: 'Local de Votação',
          entidadeId: target.id
        });
        showToast(`Seção ${secaoToAdd} vinculada ao local "${target.nome}" com sucesso!`, 'success');
      } else {
        showToast(`A seção ${secaoToAdd} já constava no local selecionado.`, 'info');
      }
      setLinkModalItem(null);
    } catch (err) {
      console.error('Erro ao vincular seção ao local:', err);
      showToast('Falha ao vincular seção ao local existente.', 'error');
    } finally {
      setIsLinkingSecao(false);
    }
  };

  const handleSearchWeb = (p: SecaoPendente) => {
    const bairroQuery = p.bairrosFrequentes[0] ? ` ${p.bairrosFrequentes[0]}` : '';
    const query = `local de votacao zona ${p.zonaFormatada} secao ${p.secaoFormatada}${bairroQuery} ${activeCity} ${activeUf} TSE`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
  };

  // Filter and Sort
  const filteredLocais = useMemo(() => {
    return locaisWithStats
      .filter((local) => {
        const query = (searchTerm || '').toLowerCase().trim();
        const nomeStr = (local.nome || '').toLowerCase();
        const bairroStr = (local.bairro || '').toLowerCase();
        const endStr = (local.endereco || '').toLowerCase();
        const matchSearch =
          !query ||
          nomeStr.includes(query) ||
          bairroStr.includes(query) ||
          endStr.includes(query) ||
          (Array.isArray(local.secoes) && local.secoes.some((s) => String(s).toLowerCase().includes(query)));

        const matchZona = selectedZona === 'todas' || local.zona === selectedZona;
        const matchTipo = selectedTipo === 'todos' || local.tipo === selectedTipo;

        return matchSearch && matchZona && matchTipo;
      })
      .sort((a, b) => {
        if (sortBy === 'eleitores') return (b.eleitoresIdentificados || 0) - (a.eleitoresIdentificados || 0);
        if (sortBy === 'secoes') {
          const countA = Array.isArray(a.secoes) ? a.secoes.length : (a.secoes ? 1 : 0);
          const countB = Array.isArray(b.secoes) ? b.secoes.length : (b.secoes ? 1 : 0);
          return countB - countA;
        }
        if (sortBy === 'capacidade') return (Number(b.capacidadeAprox) || 0) - (Number(a.capacidadeAprox) || 0);
        return (a.nome || '').localeCompare(b.nome || '');
      });
  }, [locaisWithStats, searchTerm, selectedZona, selectedTipo, sortBy]);

  // Overall Statistics
  const totalLocaisCount = locais.length;
  const totalCapacidade = useMemo(
    () => locais.reduce((acc, l) => acc + (Number(l.capacidadeAprox) || 0), 0),
    [locais]
  );
  const totalSecoesUnicas = useMemo(() => {
    const set = new Set<string>();
    locais.forEach((l) => {
      if (Array.isArray(l.secoes)) {
        l.secoes.forEach((s) => set.add(`${l.zona || '001'}-${String(s).trim()}`));
      }
    });
    return set.size;
  }, [locais]);

  const totalEleitoresMapeados = useMemo(() => {
    const ids = new Set<string>();
    locaisWithStats.forEach((l) => {
      if (Array.isArray(l.votersList)) {
        l.votersList.forEach((v) => ids.add(v.id));
      }
    });
    return ids.size;
  }, [locaisWithStats]);

  const taxaCobertura = eleitores.length > 0 ? Math.round((totalEleitoresMapeados / eleitores.length) * 100) : 0;

  // Available unique zones across registered locais
  const zonasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    locais.forEach((l) => {
      if (l.zona) set.add(l.zona);
    });
    return Array.from(set).sort();
  }, [locais]);

  // Open Create Drawer
  const handleOpenCreate = () => {
    setEditingId(null);
    setNome('');
    setTipo('Escola Estadual');
    setZona('001');
    setBairro('');
    setEndereco('');
    setMunicipio(activeCity);
    setUf(activeUf);
    setCapacidadeAprox(1500);
    setSecoes([]);
    setNewSecaoInput('');
    setIsDrawerOpen(true);
  };

  // Open Edit Drawer
  const handleOpenEdit = (local: LocalVotacao) => {
    setEditingId(local.id);
    setNome(local.nome || '');
    setTipo(local.tipo || 'Escola Estadual');
    setZona(local.zona || '001');
    setBairro(local.bairro || '');
    setEndereco(local.endereco || '');
    setMunicipio(local.municipio || activeCity);
    setUf(local.uf || activeUf);
    setCapacidadeAprox(local.capacidadeAprox || 1000);
    setSecoes(Array.isArray(local.secoes) ? [...local.secoes] : []);
    setNewSecaoInput('');
    setIsDrawerOpen(true);
  };

  // Add Section to form
  const handleAddSecao = () => {
    const raw = newSecaoInput.trim();
    if (!raw) return;

    const parts = raw
      .split(/[,;\s]+/)
      .map((s) => s.replace(/\D/g, '').padStart(4, '0'))
      .filter((s) => s.length > 0);

    const merged = Array.from(new Set([...secoes, ...parts]));
    setSecoes(merged);
    setNewSecaoInput('');
  };

  const handleRemoveSecao = (sec: string) => {
    setSecoes((prev) => prev.filter((s) => s !== sec));
  };

  // Save Local (Create or Update)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      showToast('O nome do colégio ou local é obrigatório.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        nome: nome.trim(),
        tipo: tipo.trim(),
        zona: zona.trim() || '001',
        bairro: bairro.trim() || 'Centro',
        endereco: endereco.trim() || '',
        municipio: municipio.trim() || 'Teresina',
        uf: uf.trim() || 'PI',
        capacidadeAprox: Number(capacidadeAprox) || 1000,
        secoes: secoes
      };

      if (editingId) {
        await updateLocalVotacao(editingId, payload);
        await registrarLog({
          tipo: 'ALTERACAO',
          acao: `Alteração do local de votação: ${nome.trim()}`,
          detalhes: `Zona: ${payload.zona} | Bairro: ${payload.bairro} | Seções: ${payload.secoes.join(', ')}`,
          entidade: 'Local de Votação',
          entidadeId: editingId
        });
        showToast(`Local "${nome}" atualizado com sucesso!`);
      } else {
        const newId = await addLocalVotacao(payload);
        await registrarLog({
          tipo: 'ALTERACAO',
          acao: `Novo local de votação cadastrado: ${nome.trim()}`,
          detalhes: `Zona: ${payload.zona} | Bairro: ${payload.bairro} | Seções: ${payload.secoes.join(', ')}`,
          entidade: 'Local de Votação',
          entidadeId: newId
        });
        showToast(`Local "${nome}" cadastrado com sucesso!`);
      }

      setIsDrawerOpen(false);
    } catch (err) {
      console.error('Erro ao salvar local de votação:', err);
      showToast('Erro ao salvar no Firestore.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Action com Senha Mestre
  const handleConfirmDelete = async () => {
    if (!deleteDialog) return;
    const target = deleteDialog;
    setDeleteDialog(null);

    solicitarSenhaMestre({
      title: 'Excluir Local de Votação',
      description: `Para remover o colégio eleitoral "${target.nome}", informe a Senha Mestre do sistema.`,
      onSuccess: async () => {
        setIsDeleting(true);
        try {
          await deleteLocalVotacao(target.id);
          await registrarLog({
            tipo: 'EXCLUSAO',
            acao: `Exclusão do local de votação: ${target.nome}`,
            detalhes: `Zona: ${target.zona} | Bairro: ${target.bairro} | Seções: ${Array.isArray(target.secoes) ? target.secoes.join(', ') : (target.secoes || target.secao || '-')}`,
            entidade: 'Local de Votação',
            entidadeId: target.id
          });
          showToast(`Local "${target.nome}" excluído com sucesso.`);
        } catch (err) {
          console.error('Erro ao excluir local:', err);
          showToast('Erro ao excluir local de votação.', 'error');
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  // Batch Selection Handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (filteredLocais.length === 0) return;
    const allFilteredIds = filteredLocais.map((l) => l.id);
    const allSelected = allFilteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const isAllFilteredSelected =
    filteredLocais.length > 0 && filteredLocais.every((l) => selectedIds.includes(l.id));

  const isSomeFilteredSelected =
    filteredLocais.some((l) => selectedIds.includes(l.id)) && !isAllFilteredSelected;

  const handleConfirmBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    setIsBatchDeleteDialogOpen(false);

    solicitarSenhaMestre({
      title: 'Excluir Vários Locais de Votação',
      description: `Para confirmar a exclusão permanente de ${count} local(is) de votação selecionado(s), informe a Senha Mestre do sistema.`,
      onSuccess: async () => {
        setIsBatchDeleting(true);
        try {
          const { deleted } = await batchDeleteLocais(selectedIds);
          await registrarLog({
            tipo: 'EXCLUSAO',
            acao: `Exclusão em massa de ${deleted} locais de votação`,
            detalhes: `${deleted} locais removidos pelo usuário`,
            entidade: 'Local de Votação',
            entidadeId: 'lote'
          });
          showToast(`${deleted} local(is) de votação excluído(s) com sucesso.`);
          setSelectedIds([]);
        } catch (err) {
          console.error('Erro ao excluir locais selecionados:', err);
          showToast('Erro ao excluir locais de votação selecionados.', 'error');
        } finally {
          setIsBatchDeleting(false);
        }
      }
    });
  };

  const pacotesNaUf = useMemo(() => {
    return CIDADES_DISPONIVEIS.filter((c) => c.uf === catalogUf);
  }, [catalogUf]);

  // Quick Location Save
  const handleSaveQuickLocation = async (novaUf: string, novaCidade: string) => {
    if (!novaCidade.trim()) return;
    setIsSavingLocation(true);
    try {
      if (atualizarConfiguracoes) {
        await atualizarConfiguracoes({
          municipioPadrao: novaCidade.trim(),
          ufPadrao: novaUf.trim().toUpperCase()
        });
      }
      setMunicipio(novaCidade.trim());
      setUf(novaUf.trim().toUpperCase());
      setIsLocationModalOpen(false);
      showToast(`Cidade e Estado da campanha definidos para ${novaCidade} - ${novaUf}!`, 'success');
    } catch (err) {
      console.error('Erro ao salvar localidade:', err);
      showToast('Erro ao atualizar localidade da campanha.', 'error');
    } finally {
      setIsSavingLocation(false);
    }
  };

  // ==================== CROSS-MATCHING EXECUTION: OFFICIAL CATALOG ====================
  const handleImportOfficialCatalog = async () => {
    const selected = pacotesNaUf[selectedCidadeIdx] || CIDADES_DISPONIVEIS[0];
    if (!selected) return;

    setIsProcessingCatalog(true);
    try {
      // Run through our Cross-Matching and Conflict Resolution Engine!
      const result: CrossMatchResult = processLocaisCrossMatch(locais, selected.itens);

      // Save non-conflicting creations and updates directly via Firestore batch
      const { created, updated } = await batchSaveLocais(result.criados, result.atualizados);

      if (definirPadraoAoImportar && atualizarConfiguracoes) {
        await atualizarConfiguracoes({
          municipioPadrao: selected.cidade,
          ufPadrao: selected.uf
        });
      }

      // If conflicts were isolated, add them to active conflicts list
      if (result.conflitos.length > 0) {
        setActiveConflicts((prev) => [...prev, ...result.conflitos]);
        showToast(
          `Importação de ${selected.cidade} - ${selected.uf}: ${created} criados, ${updated} atualizados. ${result.conflitos.length} conflito(s) isolado(s) para sua revisão.`,
          'info'
        );
      } else {
        showToast(
          `Importação concluída com sucesso! ${created} novos colégios e ${updated} atualizados para ${selected.cidade} - ${selected.uf}.`,
          'success'
        );
      }

      setIsCatalogModalOpen(false);
    } catch (err) {
      console.error('Erro na importação oficial:', err);
      showToast('Falha ao processar a importação.', 'error');
    } finally {
      setIsProcessingCatalog(false);
    }
  };

  // ==================== CSV UPLOAD & CROSS-MATCHING ====================
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setCsvError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseLocaisCSV(text, activeUf, activeCity);
        if (parsed.length === 0) {
          setCsvError('Nenhum registro válido de local de votação pôde ser extraído do arquivo.');
          setCsvPreview([]);
        } else {
          setCsvPreview(parsed);
        }
      } catch (err: any) {
        setCsvError(err.message || 'Erro ao processar arquivo CSV.');
        setCsvPreview([]);
      }
    };
    reader.onerror = () => {
      setCsvError('Erro ao ler arquivo.');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImportCsv = async () => {
    if (csvPreview.length === 0) return;

    setIsProcessingCsv(true);
    try {
      // Execute Cross-Matching Engine between existing database and uploaded CSV
      const result: CrossMatchResult = processLocaisCrossMatch(locais, csvPreview);

      // Safe batch save for valid records
      const { created, updated } = await batchSaveLocais(result.criados, result.atualizados);

      if (result.conflitos.length > 0) {
        setActiveConflicts((prev) => [...prev, ...result.conflitos]);
        showToast(
          `CSV processado: ${created} criados, ${updated} atualizados. ${result.conflitos.length} conflito(s) retido(s) para verificação.`,
          'info'
        );
      } else {
        showToast(
          `Planilha importada com sucesso: ${created} colégios criados e ${updated} atualizados!`,
          'success'
        );
      }

      setIsCsvModalOpen(false);
      setCsvFile(null);
      setCsvPreview([]);
    } catch (err) {
      console.error('Erro ao importar CSV:', err);
      showToast('Erro ao gravar dados da planilha.', 'error');
    } finally {
      setIsProcessingCsv(false);
    }
  };

  // Download Sample CSV
  const handleDownloadSampleCsv = () => {
    const sampleContent =
      'NM_LOCAL_VOTACAO;NR_ZONA;NR_SECAO;NM_BAIRRO;DS_ENDERECO;DS_TIPO_LOCAL;QT_APTOS;NM_MUNICIPIO;SG_UF\n' +
      'Unidade Escolar Zacarias de Goes - Liceu;001;0001,0002,0003,0042;Centro;Praca Landri Sales, s/n;Escola Estadual;2800;Teresina;PI\n' +
      'Colegio Diocesano;001;0010,0011,0012,0013;Centro;Rua Desembargador Pires de Castro, 140;Colegio Particular;2500;Teresina;PI\n' +
      'Premen Norte;002;0110,0111,0112;Buenos Aires;Rua Desembargador Freitas, s/n;Escola Estadual;1850;Teresina;PI\n' +
      'UFPI - Campus Ininga;063;0201,0202,0203;Ininga;Campus Universitario Ministro Petronio Portella;Faculdade / Universidade;4200;Teresina;PI\n';

    const blob = new Blob([sampleContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'modelo_locais_votacao_tse.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ==================== CONFLICT RESOLUTION ACTIONS ====================
  const handleKeepExisting = (conflictId: string) => {
    setActiveConflicts((prev) => prev.filter((c) => c.id !== conflictId));
    showToast('Registro atual mantido. A alteração da importação foi desconsiderada.', 'info');
  };

  const handleAdoptImported = async (conflict: LocalConflictItem) => {
    try {
      await updateLocalVotacao(conflict.localExistente.id, {
        nome: conflict.localImportado.nome,
        bairro: conflict.localImportado.bairro,
        endereco: conflict.localImportado.endereco,
        capacidadeAprox: conflict.localImportado.capacidadeAprox
      });
      setActiveConflicts((prev) => prev.filter((c) => c.id !== conflict.id));
      showToast('Registro atualizado com a versão da importação!', 'success');
    } catch (err) {
      console.error('Erro ao adotar versão importada:', err);
      showToast('Falha ao atualizar o local de votação.', 'error');
    }
  };

  const handleMergeSections = async (conflict: LocalConflictItem) => {
    try {
      const merged = Array.from(
        new Set([...toSecoesArray(conflict.localExistente.secoes), ...toSecoesArray(conflict.localImportado.secoes)])
      );
      await updateLocalVotacao(conflict.localExistente.id, {
        secoes: merged
      });
      setActiveConflicts((prev) => prev.filter((c) => c.id !== conflict.id));
      showToast('Seções mescladas com sucesso no colégio existente!', 'success');
    } catch (err) {
      console.error('Erro ao mesclar seções:', err);
      showToast('Falha ao mesclar seções.', 'error');
    }
  };

  const handleDismissAllConflicts = () => {
    setActiveConflicts([]);
    setIsConflictModalOpen(false);
    showToast('Todos os conflitos foram desconsiderados e a base mantida íntegra.', 'info');
  };

  // Voters for selected detail view
  const activeDetailData = useMemo(() => {
    if (!viewVotersLocal) return null;
    const match = locaisWithStats.find((l) => l.id === viewVotersLocal.id);
    return match || null;
  }, [viewVotersLocal, locaisWithStats]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 duration-200 ${
            toastMessage.type === 'error'
              ? 'bg-error-container text-on-error-container border-error/30'
              : toastMessage.type === 'info'
              ? 'bg-secondary-container text-on-secondary-container border-secondary/30'
              : 'bg-surface-container-highest text-on-surface border-outline-variant'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-error shrink-0" />
          ) : toastMessage.type === 'info' ? (
            <AlertTriangle className="w-4 h-4 text-secondary shrink-0" />
          ) : (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/50 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-secondary uppercase tracking-wider">
              Geografia Eleitoral & Zonas
            </span>
            <button
              type="button"
              onClick={() => {
                setLocModalUf(activeUf);
                setLocModalCidade(activeCity);
                setIsLocationModalOpen(true);
              }}
              title="Clique para alterar a UF e Cidade da campanha"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all cursor-pointer shadow-xs"
            >
              <Compass className="w-3.5 h-3.5 text-secondary" />
              <span>{activeCity} - {activeUf} (TRE-{activeUf})</span>
              <span className="text-[10px] bg-primary/20 hover:bg-primary/30 text-primary px-1.5 py-0.2 rounded font-semibold ml-0.5">
                Alterar
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-xs">
              <MapPin className="w-5 h-5 text-primary-fixed" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-on-surface tracking-tight">
                Locais de Votação e Seções
              </h1>
              <p className="text-xs text-on-surface-variant">
                Gerenciamento em tempo real de colégios para <strong>{activeCity} - {activeUf}</strong> com importação oficial, suporte a planilhas CSV do TSE e conciliação eleitoral.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Conflict Badge Button (when conflicts exist) */}
          {activeConflicts.length > 0 && (
            <button
              onClick={() => setIsConflictModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 border border-amber-500/30 rounded-lg shadow-xs transition-colors cursor-pointer animate-pulse"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Conflitos Pendentes ({activeConflicts.length})</span>
            </button>
          )}

          {/* Official City Importer */}
          <button
            onClick={() => {
              setCatalogUf(activeUf);
              setSelectedCidadeIdx(0);
              setIsCustomMode(false);
              setIsCatalogModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant rounded-lg transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-secondary" />
            <span>Importar Colégios Oficiais (UF/Cidade)</span>
          </button>

          {/* CSV File Importer */}
          <button
            onClick={() => setIsCsvModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant rounded-lg transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-secondary" />
            <span>Importar CSV</span>
          </button>

          {/* Export Dropdown */}
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-secondary" />
              <span>Exportar</span>
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg py-1 z-30">
                <button
                  type="button"
                  onClick={() => {
                    exportLocaisReal(locais, eleitores, 'pdf');
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2 text-on-surface font-medium cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-error" /> Documento PDF (.pdf)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportLocaisReal(locais, eleitores, 'xlsx');
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2 text-on-surface font-medium cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportLocaisReal(locais, eleitores, 'csv');
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2 text-on-surface font-medium cursor-pointer"
                >
                  <Download className="w-4 h-4 text-secondary" /> CSV (.csv)
                </button>
              </div>
            )}
          </div>

          {/* Manual Create */}
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-primary hover:bg-primary/95 text-on-primary rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Local</span>
          </button>
        </div>
      </div>

      {/* CONFLICT ALERT BANNER (If conflicts exist) */}
      {activeConflicts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-amber-900 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-lg shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-950">
                Atenção: O Motor Eleitoral isolou {activeConflicts.length} conflito(s) entre as importações
              </h4>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Para proteger a integridade dos dados, as seções e registros conflitantes foram desconsiderados da gravação automática. Você pode inspecionar e decidir qual registro manter.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsConflictModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer shadow-2xs"
          >
            <span>Analisar e Resolver Conflitos</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase text-on-surface-variant">Colégios Mapeados</p>
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-black text-primary font-mono mt-1">{totalLocaisCount}</p>
          <p className="text-[11px] text-on-surface-variant mt-0.5">Sincronizados com o Firestore</p>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase text-on-surface-variant">Seções Cadastradas</p>
            <Layers className="w-4 h-4 text-secondary" />
          </div>
          <p className="text-2xl font-black text-secondary font-mono mt-1">{totalSecoesUnicas}</p>
          <p className="text-[11px] text-on-surface-variant mt-0.5">Seções ativas distribuídas</p>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase text-on-surface-variant">Eleitores da Base</p>
            <Users className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-2xl font-black text-emerald-700 font-mono">{totalEleitoresMapeados}</p>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
              {taxaCobertura}% da base
            </span>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-0.5">Localizados em seções cadastradas</p>
        </div>

        {/* Card de Seções Pendentes */}
        <div
          onClick={() => {
            setIsPendingExpanded(true);
            const el = document.getElementById('painel-secoes-pendentes');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`p-4 rounded-xl border shadow-xs transition-all cursor-pointer ${
            secoesPendentes.length > 0
              ? 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20'
              : 'bg-emerald-500/10 border-emerald-500/30'
          }`}
          title="Clique para ir ao painel de resolução de seções pendentes"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Seções Pendentes
            </p>
            {secoesPendentes.length > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 animate-pulse" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            )}
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <p
              className={`text-2xl font-black font-mono ${
                secoesPendentes.length > 0 ? 'text-amber-800 dark:text-amber-400' : 'text-emerald-700'
              }`}
            >
              {secoesPendentes.length}
            </p>
            {secoesPendentes.length > 0 && (
              <span className="text-xs font-bold text-amber-800 bg-amber-200/90 px-1.5 py-0.5 rounded">
                {totalEleitoresPendentes} eleitor(es)
              </span>
            )}
          </div>
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            {secoesPendentes.length > 0 ? 'Sem colégio cadastrado' : '100% dos eleitores mapeados'}
          </p>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase text-on-surface-variant">Capacidade Estimada</p>
            <BarChart3 className="w-4 h-4 text-secondary" />
          </div>
          <p className="text-2xl font-black text-on-surface font-mono mt-1">
            {totalCapacidade.toLocaleString('pt-BR')}
          </p>
          <p className="text-[11px] text-on-surface-variant mt-0.5">Eleitores aptos na circunscrição</p>
        </div>
      </div>

      {/* ==================== PAINEL DE DIAGNÓSTICO: SEÇÕES PENDENTES DE CADASTRO ==================== */}
      <div id="painel-secoes-pendentes" className="scroll-mt-4">
        {secoesPendentes.length > 0 ? (
          <div className="bg-surface-container-lowest border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            {/* Cabeçalho do Painel */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-outline-variant/40 pb-3.5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-extrabold text-on-surface tracking-tight">
                      Seções Eleitorais Pendentes de Mapeamento
                    </h3>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 border border-amber-500/30">
                      {secoesPendentes.length} combinação(ões) pendente(s)
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                      {totalEleitoresPendentes} eleitor(es) aguardando colégio
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    Estas combinações de <strong>Zona e Seção</strong> já foram informadas no cadastro de eleitores da campanha, mas seus colégios ainda não constam no sistema. Pesquise o nome da escola na internet ou portal do TSE e cadastre para conciliar 100% da sua base eleitoral.
                  </p>
                </div>
              </div>

              {/* Botões de Ação do Painel */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                  title="Imprimir relatório para pesquisa em papel ou salvar em PDF"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Relatório de Pesquisa</span>
                </button>

                <a
                  href="https://www.tse.jus.br/servicos-eleitorais/titulo-e-local-de-votacao"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant rounded-xl transition-colors"
                  title="Abrir página oficial do TSE para consulta de locais de votação"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-secondary" />
                  <span>Portal do TSE</span>
                </a>

                <button
                  type="button"
                  onClick={() => setIsPendingExpanded((prev) => !prev)}
                  className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                  title={isPendingExpanded ? 'Recolher painel' : 'Expandir painel'}
                >
                  <ChevronRight
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isPendingExpanded ? 'rotate-90' : 'rotate-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Conteúdo Expansível do Painel */}
            {isPendingExpanded && (
              <div className="space-y-3">
                {/* Barra de Busca de Pendências */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filtrar por zona, seção ou bairro..."
                      value={searchPending}
                      onChange={(e) => setSearchPending(e.target.value)}
                      className="w-full h-8.5 pl-9 pr-3 text-xs bg-surface-container-low border border-outline-variant/60 rounded-lg focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>

                  <span className="text-[11px] text-on-surface-variant font-medium">
                    Exibindo <strong>{filteredSecoesPendentes.length}</strong> de <strong>{secoesPendentes.length}</strong> seção(ões) pendente(s)
                  </span>
                </div>

                {/* Tabela de Seções Pendentes */}
                <div className="overflow-x-auto border border-outline-variant/60 rounded-xl bg-surface-container-lowest">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant/60 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                        <th className="py-2.5 px-3">Zona Eleitoral</th>
                        <th className="py-2.5 px-3">Seção</th>
                        <th className="py-2.5 px-3">Cadastros (Qtd)</th>
                        <th className="py-2.5 px-3">Bairros Informados pelos Eleitores</th>
                        <th className="py-2.5 px-3 text-right">Ações de Resolução</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/30 font-medium">
                      {filteredSecoesPendentes.map((item) => (
                        <tr key={item.key} className="hover:bg-amber-500/[0.04] transition-colors">
                          {/* Zona */}
                          <td className="py-2.5 px-3 font-mono font-bold text-on-surface whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container text-on-surface border border-outline-variant/40">
                              Zona {item.zonaFormatada}
                            </span>
                          </td>

                          {/* Seção */}
                          <td className="py-2.5 px-3 font-mono font-bold text-primary whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                              Seção {item.secaoFormatada}
                            </span>
                          </td>

                          {/* Qtd Eleitores com Modal View */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setViewPendingVotersItem(item)}
                              title="Clique para ver os eleitores cadastrados nesta seção"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 font-bold transition-colors cursor-pointer text-xs"
                            >
                              <Users className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{item.totalEleitores} eleitor(es)</span>
                              <Eye className="w-3 h-3 text-emerald-700 opacity-70 ml-0.5" />
                            </button>
                          </td>

                          {/* Bairros de Referência */}
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap items-center gap-1 max-w-sm">
                              {item.bairrosFrequentes.length > 0 ? (
                                item.bairrosFrequentes.slice(0, 3).map((b, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded bg-surface-container text-on-surface-variant truncate max-w-[140px]"
                                    title={`Bairro de eleitor cadastrado nesta seção: ${b}`}
                                  >
                                    {b}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-on-surface-variant italic">
                                  Bairro não informado
                                </span>
                              )}
                              {item.bairrosFrequentes.length > 3 && (
                                <span className="text-[10px] text-on-surface-variant">
                                  +{item.bairrosFrequentes.length - 3} outros
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Ações */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* 1. Buscar no Google/TSE */}
                              <button
                                type="button"
                                onClick={() => handleSearchWeb(item)}
                                title={`Pesquisar no Google por colégios da Zona ${item.zonaFormatada} Seção ${item.secaoFormatada}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant transition-colors cursor-pointer"
                              >
                                <Search className="w-3 h-3 text-secondary" />
                                <span>Buscar na Web</span>
                              </button>

                              {/* 2. Vincular a Local Existente */}
                              <button
                                type="button"
                                onClick={() => handleOpenLinkModal(item)}
                                title="Vincular esta seção a um colégio já cadastrado no sistema"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/20 transition-colors cursor-pointer"
                              >
                                <Link2 className="w-3 h-3" />
                                <span>Vincular</span>
                              </button>

                              {/* 3. Cadastrar Novo Local com esta Zona e Seção pré-preenchidas */}
                              <button
                                type="button"
                                onClick={() => handleOpenCreateForSecao(item)}
                                title="Abrir cadastro de colégio já com esta Zona e Seção preenchidas"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-primary hover:bg-primary/95 text-on-primary shadow-2xs transition-colors cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Cadastrar Local</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-emerald-900 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-emerald-950">
                  Locais e Seções de Votação 100% Mapeados
                </h4>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Todas as zonas e seções dos eleitores cadastrados possuem colégios eleitorais correspondentes no sistema. Nenhuma pendência encontrada.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-emerald-600 text-white rounded-lg shrink-0">
              Base 100% Conciliada
            </span>
          </div>
        )}
      </div>

      {/* Filters, Search & Sort Bar */}
      <div className="bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant/60 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por colégio, bairro, endereço ou número de seção..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-9 pr-4 text-xs bg-surface-container-low border border-outline-variant/60 rounded-lg focus:outline-none focus:border-secondary transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* Zona Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-on-surface-variant">Zona:</span>
            <select
              value={selectedZona}
              onChange={(e) => setSelectedZona(e.target.value)}
              className="h-9 px-2.5 bg-surface-container-low border border-outline-variant/60 rounded-lg font-medium text-on-surface focus:outline-none focus:border-secondary text-xs"
            >
              <option value="todas">Todas as Zonas</option>
              {zonasDisponiveis.map((z) => (
                <option key={z} value={z}>
                  Zona {z}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-on-surface-variant">Tipo:</span>
            <select
              value={selectedTipo}
              onChange={(e) => setSelectedTipo(e.target.value)}
              className="h-9 px-2.5 bg-surface-container-low border border-outline-variant/60 rounded-lg font-medium text-on-surface focus:outline-none focus:border-secondary text-xs"
            >
              <option value="todos">Todos os Tipos</option>
              {TIPOS_ESTABELECIMENTO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-on-surface-variant" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 px-2.5 bg-surface-container-low border border-outline-variant/60 rounded-lg font-medium text-on-surface focus:outline-none focus:border-secondary text-xs"
            >
              <option value="eleitores">Mais Eleitores na Base</option>
              <option value="nome">Nome (A-Z)</option>
              <option value="secoes">Mais Seções</option>
              <option value="capacidade">Maior Capacidade</option>
            </select>
          </div>
        </div>
      </div>

      {/* Empty State when no locais found */}
      {filteredLocais.length === 0 && (
        <div className="bg-surface-container-lowest border border-dashed border-outline-variant rounded-2xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-surface-container text-on-surface-variant flex items-center justify-center mx-auto">
            <School className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-surface">
              {totalLocaisCount === 0 ? 'Nenhum Local de Votação Cadastrado' : 'Nenhum local encontrado para os filtros'}
            </h3>
            <p className="text-xs text-on-surface-variant max-w-md mx-auto mt-1">
              {totalLocaisCount === 0
                ? 'Importe automaticamente os colégios e seções de Teresina - PI pelo assistente ou faça o upload de uma planilha CSV.'
                : 'Tente alterar os termos de busca ou limpar os filtros de zona eleitoral.'}
            </p>
          </div>
          {totalLocaisCount === 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setIsCatalogModalOpen(true)}
                className="px-4 py-2 text-xs font-bold bg-primary text-on-primary rounded-lg shadow-xs hover:bg-primary/90 transition-colors cursor-pointer"
              >
                Importar Teresina - PI (TRE-PI)
              </button>
              <button
                onClick={() => setIsCsvModalOpen(true)}
                className="px-4 py-2 text-xs font-bold bg-secondary text-on-secondary rounded-lg shadow-xs hover:bg-secondary/90 transition-colors cursor-pointer"
              >
                Importar Planilha CSV
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selection Toolbar & Bulk Action Bar */}
      {filteredLocais.length > 0 && (
        <div
          id="locais-selection-toolbar"
          className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition-all ${
            selectedIds.length > 0
              ? 'bg-primary/5 border-primary/40 shadow-xs ring-1 ring-primary/20'
              : 'bg-surface-container-lowest border-outline-variant/60'
          }`}
        >
          <div className="flex items-center gap-3">
            <label
              htmlFor="select-all-filtered-locais"
              className="flex items-center gap-2 cursor-pointer select-none font-semibold text-xs text-on-surface hover:text-primary transition-colors"
            >
              <input
                id="select-all-filtered-locais"
                type="checkbox"
                checked={isAllFilteredSelected}
                ref={(el) => {
                  if (el) el.indeterminate = isSomeFilteredSelected;
                }}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded text-primary focus:ring-primary/20 border-outline-variant cursor-pointer accent-primary"
              />
              <span>
                {isAllFilteredSelected
                  ? `Todos os ${filteredLocais.length} locais da listagem selecionados`
                  : selectedIds.length > 0
                  ? `${selectedIds.length} de ${filteredLocais.length} local(is) selecionado(s)`
                  : `Selecionar todos (${filteredLocais.length})`}
              </span>
            </label>

            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-[11px] font-bold text-on-surface-variant hover:text-on-surface underline underline-offset-2 ml-1 cursor-pointer"
              >
                Limpar seleção
              </button>
            )}
          </div>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-on-surface-variant font-medium hidden sm:inline">
                Ação em massa:
              </span>
              <button
                id="btn-batch-delete-locais"
                type="button"
                onClick={() => setIsBatchDeleteDialogOpen(true)}
                disabled={isBatchDeleting}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-error text-on-error hover:bg-error/90 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isBatchDeleting ? 'Excluindo...' : `Excluir Selecionados (${selectedIds.length})`}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Grid of Voting Locations */}
      {filteredLocais.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLocais.map((local) => (
            <LocalCard
              key={local.id}
              local={local}
              isSelected={selectedIds.includes(local.id)}
              onToggleSelect={() => handleToggleSelect(local.id)}
              onViewVoters={() => setViewVotersLocal(local)}
              onEdit={() => handleOpenEdit(local)}
              onDelete={() => setDeleteDialog(local)}
            />
          ))}
        </div>
      )}

      {/* ==================== MODAL 1: IMPORTAR COLÉGIOS POR CIDADE (ESTADOS & MUNICÍPIOS) ==================== */}
      {isCatalogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col justify-between">
            <div className="flex items-start justify-between border-b border-outline-variant/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Importador Oficial por Localidade</h3>
                  <p className="text-xs text-on-surface-variant">
                    Dados Oficiais da Justiça Eleitoral (TSE / TRE) com seleção de Estado e Município
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCatalogModalOpen(false)}
                className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
              {/* Esclarecimento sobre Dados Reais do TSE */}
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-[11px] text-blue-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-blue-800">
                  <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>Transparência e Autenticidade dos Dados (TSE / TRE)</span>
                </div>
                <p className="text-blue-900/90 leading-relaxed">
                  <strong>Sim, os dados são reais!</strong> Os colégios, zonas e seções pré-carregados são extraídos da base oficial de Dados Abertos do TSE. Como o Brasil possui 5.570 municípios e o TSE não possui uma API online irrestrita, você pode selecionar os catálogos oficiais prontos ou carregar a planilha CSV do TSE da sua cidade com 1 clique.
                </p>
              </div>

              {/* Filtro de Estado (UF) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-on-surface mb-1">1. Selecione o Estado (UF):</label>
                  <select
                    value={catalogUf}
                    onChange={(e) => {
                      const newUf = e.target.value;
                      setCatalogUf(newUf);
                      setSelectedCidadeIdx(0);
                      const matching = CIDADES_DISPONIVEIS.filter((c) => c.uf === newUf);
                      setIsCustomMode(matching.length === 0);
                    }}
                    className="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/70 rounded-lg font-medium text-on-surface focus:outline-none focus:border-secondary"
                  >
                    {ESTADOS_BRASIL.map((est) => (
                      <option key={est.uf} value={est.uf}>
                        {est.uf} - {est.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-on-surface mb-1">2. Modo do Município:</label>
                  <div className="flex items-center gap-1.5 h-10">
                    <button
                      type="button"
                      onClick={() => setIsCustomMode(false)}
                      disabled={pacotesNaUf.length === 0}
                      className={`flex-1 h-full rounded-lg font-bold text-[11px] border transition-colors cursor-pointer disabled:opacity-40 ${
                        !isCustomMode && pacotesNaUf.length > 0
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-surface-container-low text-on-surface-variant border-outline-variant/60 hover:bg-surface-container'
                      }`}
                    >
                      Catálogo TSE ({pacotesNaUf.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCustomMode(true)}
                      className={`flex-1 h-full rounded-lg font-bold text-[11px] border transition-colors cursor-pointer ${
                        isCustomMode || pacotesNaUf.length === 0
                          ? 'bg-secondary text-on-secondary border-secondary'
                          : 'bg-surface-container-low text-on-surface-variant border-outline-variant/60 hover:bg-surface-container'
                      }`}
                    >
                      Outra Cidade...
                    </button>
                  </div>
                </div>
              </div>

              {/* SELEÇÃO 1: Pacote Pré-carregado Oficial */}
              {!isCustomMode && pacotesNaUf.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-on-surface mb-1">
                      Municípios de {catalogUf} com pacote oficial pronto:
                    </label>
                    <select
                      value={selectedCidadeIdx}
                      onChange={(e) => setSelectedCidadeIdx(Number(e.target.value))}
                      className="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/70 rounded-lg font-medium text-on-surface focus:outline-none focus:border-secondary"
                    >
                      {pacotesNaUf.map((c, idx) => (
                        <option key={idx} value={idx}>
                          {c.cidade} — {c.totalLocais} colégios oficiais mapeados
                        </option>
                      ))}
                    </select>
                  </div>

                  {pacotesNaUf[selectedCidadeIdx] && (
                    <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/60 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-on-surface text-xs">
                          {pacotesNaUf[selectedCidadeIdx].nomeCompleto}
                        </span>
                        <span className="text-[10px] font-mono font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">
                          {pacotesNaUf[selectedCidadeIdx].totalLocais} colégios oficiais
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                        <span className="font-semibold">Zonas Eleitorais:</span>
                        <div className="flex flex-wrap gap-1">
                          {pacotesNaUf[selectedCidadeIdx].zonas.map((z) => (
                            <span key={z} className="px-1.5 py-0.2 bg-surface-container-lowest border rounded text-[10px] font-mono">
                              Zona {z}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="text-[11px] text-on-surface-variant">
                        <p className="font-semibold mb-1 text-on-surface">Amostra dos Colégios Registrados:</p>
                        <ul className="list-disc list-inside space-y-0.5 text-on-surface-variant/90 max-h-[120px] overflow-y-auto">
                          {pacotesNaUf[selectedCidadeIdx].itens.slice(0, 8).map((loc, i) => (
                            <li key={i} className="truncate">
                              <strong>{loc.nome}</strong> (Zona {loc.zona} - {loc.bairro}) • {Array.isArray(loc.secoes) ? loc.secoes.length : (loc.secoes ? 1 : 0)} seções
                            </li>
                          ))}
                          {pacotesNaUf[selectedCidadeIdx].itens.length > 8 && (
                            <li className="font-semibold text-secondary">
                              + {pacotesNaUf[selectedCidadeIdx].itens.length - 8} outros colégios no lote...
                            </li>
                          )}
                        </ul>
                      </div>

                      <label className="flex items-center gap-2 p-2 bg-surface-container-lowest border border-outline-variant/50 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={definirPadraoAoImportar}
                          onChange={(e) => setDefinirPadraoAoImportar(e.target.checked)}
                          className="rounded text-primary focus:ring-primary h-4 w-4"
                        />
                        <span className="text-[11px] font-medium text-on-surface">
                          Definir <strong>{pacotesNaUf[selectedCidadeIdx].cidade} - {pacotesNaUf[selectedCidadeIdx].uf}</strong> como cidade/estado padrão da campanha
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* SELEÇÃO 2: Outro Município da UF (Customizado) */}
              {(isCustomMode || pacotesNaUf.length === 0) && (
                <div className="space-y-3 bg-surface-container-low p-4 rounded-xl border border-outline-variant/60">
                  <div>
                    <label className="block font-bold text-on-surface mb-1">
                      Digite o nome do Município ({catalogUf}):
                    </label>
                    <input
                      type="text"
                      value={customCidadeNome}
                      onChange={(e) => setCustomCidadeNome(e.target.value)}
                      placeholder="Ex: Parnaíba, Picos, Floriano, Campinas, Santos..."
                      className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg font-semibold text-on-surface focus:border-primary outline-none"
                    />
                  </div>

                  <div className="p-3 bg-surface-container-lowest border border-outline-variant/50 rounded-xl space-y-2">
                    <span className="font-bold text-on-surface text-[11px] block">
                      Como carregar colégios reais para {customCidadeNome || 'este município'} ({catalogUf}):
                    </span>
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-on-surface-variant">
                      <li>
                        <strong>Importação de Planilha do TSE (Recomendado):</strong> Baixe a lista de locais de votação de {catalogUf} no portal Dados Abertos do TSE e carregue pelo nosso botão de CSV.
                      </li>
                      <li>
                        <strong>Definir como Sede da Campanha:</strong> Defina {customCidadeNome || 'este município'} como cidade padrão para vincular automaticamente novas seções e eleitores.
                      </li>
                      <li>
                        <strong>Cadastro Manual:</strong> Cadastre as escolas e seções diretamente no botão &quot;Novo Local&quot;.
                      </li>
                    </ol>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-outline-variant/40">
                      <button
                        type="button"
                        onClick={async () => {
                          const cid = customCidadeNome.trim() || 'Meu Município';
                          if (atualizarConfiguracoes) {
                            await atualizarConfiguracoes({
                              municipioPadrao: cid,
                              ufPadrao: catalogUf
                            });
                          }
                          setMunicipio(cid);
                          setUf(catalogUf);
                          setIsCatalogModalOpen(false);
                          setIsCsvModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-on-primary rounded-lg font-bold text-[11px] cursor-pointer hover:bg-primary/90"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Abrir Importador CSV com {customCidadeNome || catalogUf}</span>
                      </button>

                      <button
                        type="button"
                        disabled={!customCidadeNome.trim()}
                        onClick={async () => {
                          const cid = customCidadeNome.trim();
                          if (!cid) return;
                          if (atualizarConfiguracoes) {
                            await atualizarConfiguracoes({
                              municipioPadrao: cid,
                              ufPadrao: catalogUf
                            });
                          }
                          setMunicipio(cid);
                          setUf(catalogUf);
                          setIsCatalogModalOpen(false);
                          showToast(`Localidade da campanha atualizada para ${cid} - ${catalogUf}!`, 'success');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-surface-container-high text-on-surface border border-outline-variant rounded-lg font-semibold text-[11px] cursor-pointer hover:bg-surface-container-highest disabled:opacity-50"
                      >
                        <MapPin className="w-3.5 h-3.5 text-secondary" />
                        <span>Definir como Cidade Padrão</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-outline-variant/50 flex items-center justify-between gap-2">
              <span className="text-[10px] text-on-surface-variant">
                Localidade atual da campanha: <strong>{activeCity} - {activeUf}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCatalogModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
                >
                  Fechar
                </button>

                {!isCustomMode && pacotesNaUf.length > 0 && (
                  <button
                    type="button"
                    onClick={handleImportOfficialCatalog}
                    disabled={isProcessingCatalog}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-primary hover:bg-primary/95 text-on-primary rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isProcessingCatalog ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Importando e Cruzando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Importar para Minha Base</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL RÁPIDO: ALTERAR ESTADO E CIDADE DA CAMPANHA ==================== */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-outline-variant/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Alterar Localidade da Campanha</h3>
                  <p className="text-xs text-on-surface-variant">
                    Configuração do Estado (TRE) e Município sede
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsLocationModalOpen(false)}
                className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-on-surface mb-1">Estado (UF):</label>
                <select
                  value={locModalUf}
                  onChange={(e) => setLocModalUf(e.target.value)}
                  className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg font-semibold text-on-surface focus:border-primary outline-none"
                >
                  {ESTADOS_BRASIL.map((est) => (
                    <option key={est.uf} value={est.uf}>
                      {est.uf} - {est.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-on-surface mb-1">Município / Cidade Sede:</label>
                <input
                  type="text"
                  value={locModalCidade}
                  onChange={(e) => setLocModalCidade(e.target.value)}
                  placeholder="Ex: Teresina, Parnaíba, Fortaleza, São Paulo..."
                  className="w-full h-10 px-3 bg-surface border border-outline-variant rounded-lg font-bold text-on-surface focus:border-primary outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-on-surface-variant font-medium">Atalhos rápidos:</span>
                {CIDADES_DISPONIVEIS.map((c) => (
                  <button
                    key={c.cidade + c.uf}
                    type="button"
                    onClick={() => {
                      setLocModalCidade(c.cidade);
                      setLocModalUf(c.uf);
                    }}
                    className="text-[10px] px-1.5 py-0.5 bg-surface-container hover:bg-surface-container-high rounded border text-on-surface-variant font-mono cursor-pointer"
                  >
                    {c.cidade}-{c.uf}
                  </button>
                ))}
              </div>

              <div className="p-3 bg-surface-container-low rounded-xl text-[11px] text-on-surface-variant">
                Ao alterar a localidade padrão, os novos locais de votação e eleitores inseridos serão automaticamente vinculados a <strong>{locModalCidade || 'este município'} - {locModalUf}</strong>.
              </div>
            </div>

            <div className="pt-3 border-t border-outline-variant/50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsLocationModalOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingLocation || !locModalCidade.trim()}
                onClick={() => handleSaveQuickLocation(locModalUf, locModalCidade)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-primary hover:bg-primary/95 text-on-primary rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSavingLocation ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Salvar Localidade</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: IMPORTADOR VIA PLANILHA CSV ==================== */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col justify-between">
            <div className="flex items-start justify-between border-b border-outline-variant/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Importar Colégios via Planilha CSV</h3>
                  <p className="text-xs text-on-surface-variant">
                    Compatível com o formato oficial do TSE / TRE ou planilhas customizadas
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsCsvModalOpen(false);
                  setCsvFile(null);
                  setCsvPreview([]);
                }}
                className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
              {/* Sample Download Bar & TSE Open Data Portal Link */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-surface-container-low border border-outline-variant/60 rounded-xl gap-2">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-secondary shrink-0" />
                  <span className="text-[11px] text-on-surface font-medium">
                    Precisa de um arquivo modelo ou dados oficiais do TSE?
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href="https://dadosabertos.tse.jus.br/dataset/locais-de-votacao-2024"
                    target="_blank"
                    rel="noreferrer"
                    title="Acessar o portal oficial de dados abertos do Tribunal Superior Eleitoral (TSE)"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Portal TSE</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-secondary bg-secondary/10 hover:bg-secondary/20 rounded-md transition-colors cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Baixar Modelo CSV</span>
                  </button>
                </div>
              </div>

              {/* Upload Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-outline-variant/80 hover:border-secondary rounded-xl p-6 text-center cursor-pointer transition-colors bg-surface-container-low/50 space-y-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileChange}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-xl bg-surface-container text-on-surface-variant flex items-center justify-center mx-auto">
                  <Upload className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <p className="font-bold text-on-surface text-xs">
                    {csvFile ? csvFile.name : 'Clique para selecionar ou arraste o arquivo CSV aqui'}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Colunas aceitas: Nome do Local, Zona, Seções, Bairro, Endereço, Capacidade
                  </p>
                </div>
              </div>

              {/* CSV Error */}
              {csvError && (
                <div className="p-3 bg-error-container/30 border border-error/30 rounded-xl flex items-center gap-2 text-xs text-error">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{csvError}</span>
                </div>
              )}

              {/* Preview Table */}
              {csvPreview.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-on-surface">
                      Colégios Identificados no Arquivo ({csvPreview.length})
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-mono">
                      Prontos para cruzamento
                    </span>
                  </div>

                  <div className="max-h-[160px] overflow-y-auto border border-outline-variant/60 rounded-xl bg-surface-container-lowest">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-surface-container-low border-b border-outline-variant/60 sticky top-0 font-bold text-on-surface-variant">
                        <tr>
                          <th className="p-2">Colégio / Local</th>
                          <th className="p-2">Zona</th>
                          <th className="p-2">Bairro</th>
                          <th className="p-2">Seções</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/30">
                        {csvPreview.map((item, idx) => (
                          <tr key={idx} className="hover:bg-surface-container-low/40">
                            <td className="p-2 font-bold text-on-surface truncate max-w-[200px]">{item.nome}</td>
                            <td className="p-2 font-mono">Zona {item.zona}</td>
                            <td className="p-2">{item.bairro}</td>
                            <td className="p-2 font-mono text-[10px] text-secondary">
                              {Array.isArray(item.secoes)
                                ? item.secoes.slice(0, 4).join(', ')
                                : (item.secoes || item.secao || '-')}
                              {Array.isArray(item.secoes) && item.secoes.length > 4 ? ` +${item.secoes.length - 4}` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-2.5 bg-primary/5 rounded-lg border border-primary/20 flex items-center gap-2 text-[11px] text-primary">
                    <GitMerge className="w-4 h-4 shrink-0" />
                    <span>
                      O motor de cruzamento comparará este arquivo com os colégios já existentes, detectando e isolando seções duplicadas ou divergências de endereço.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-outline-variant/50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCsvModalOpen(false);
                  setCsvFile(null);
                  setCsvPreview([]);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportCsv}
                disabled={isProcessingCsv || csvPreview.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-secondary hover:bg-secondary/95 text-on-secondary rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isProcessingCsv ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processando e Cruzando...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importar {csvPreview.length} Colégios</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 3: CENTRAL DE RESOLUÇÃO DE CONFLITOS ==================== */}
      {isConflictModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-3xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col justify-between">
            <div className="flex items-start justify-between border-b border-outline-variant/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Central de Conciliação Eleitoral</h3>
                  <p className="text-xs text-on-surface-variant">
                    {activeConflicts.length} conflito(s) isolado(s) pelo motor para sua deliberação
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsConflictModalOpen(false)}
                className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
              {activeConflicts.length === 0 ? (
                <div className="py-12 text-center text-xs text-on-surface-variant space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="font-bold text-on-surface">Nenhum conflito pendente na base!</p>
                  <p className="text-[11px]">Todos os colégios e seções eleitorais estão em perfeita harmonia.</p>
                </div>
              ) : (
                activeConflicts.map((conf) => (
                  <div
                    key={conf.id}
                    className="p-4 bg-surface-container-low border border-amber-200/80 rounded-xl space-y-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          {conf.type === 'secao_duplicada' ? 'Seção em Colégios Diferentes' : 'Divergência Cadastral'}
                        </span>
                        <span className="font-bold text-xs text-on-surface">{conf.titulo}</span>
                      </div>
                      <span className="text-[10px] font-mono text-on-surface-variant">Zona {conf.zona}</span>
                    </div>

                    <p className="text-[11px] text-on-surface-variant bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/40">
                      {conf.descricao}
                    </p>

                    {/* Side by side comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                      {/* Existing */}
                      <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/60 space-y-1">
                        <p className="font-bold text-on-surface flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-primary" />
                          <span>Atual no Banco de Dados:</span>
                        </p>
                        <p className="font-semibold text-primary">{conf.localExistente.nome}</p>
                        <p className="text-on-surface-variant">Bairro: {conf.localExistente.bairro}</p>
                        {conf.localExistente.endereco && (
                          <p className="text-on-surface-variant truncate">Endereço: {conf.localExistente.endereco}</p>
                        )}
                        <p className="font-mono text-[10px] text-secondary">
                          Seções: {formatSecoesText(conf.localExistente.secoes)}
                        </p>
                      </div>

                      {/* Incoming */}
                      <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/60 space-y-1">
                        <p className="font-bold text-on-surface flex items-center gap-1.5">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-secondary" />
                          <span>Versão Proposta na Importação:</span>
                        </p>
                        <p className="font-semibold text-secondary">{conf.localImportado.nome}</p>
                        <p className="text-on-surface-variant">Bairro: {conf.localImportado.bairro}</p>
                        {conf.localImportado.endereco && (
                          <p className="text-on-surface-variant truncate">Endereço: {conf.localImportado.endereco}</p>
                        )}
                        <p className="font-mono text-[10px] text-secondary">
                          Seções: {formatSecoesText(conf.localImportado.secoes)}
                        </p>
                      </div>
                    </div>

                    {/* Actions for this conflict */}
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleKeepExisting(conf.id)}
                        className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold rounded-lg text-[11px] transition-colors cursor-pointer"
                      >
                        Manter Registro Atual
                      </button>

                      {conf.type === 'divergencia_dados' ? (
                        <button
                          type="button"
                          onClick={() => handleAdoptImported(conf)}
                          className="px-3 py-1.5 bg-primary text-on-primary font-bold rounded-lg text-[11px] shadow-xs hover:bg-primary/95 transition-colors cursor-pointer"
                        >
                          Adotar Versão Importada
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMergeSections(conf)}
                          className="px-3 py-1.5 bg-secondary text-on-secondary font-bold rounded-lg text-[11px] shadow-xs hover:bg-secondary/95 transition-colors cursor-pointer"
                        >
                          Mesclar Seções
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-outline-variant/50 flex items-center justify-between">
              {activeConflicts.length > 0 ? (
                <button
                  type="button"
                  onClick={handleDismissAllConflicts}
                  className="text-xs font-semibold text-error hover:underline cursor-pointer"
                >
                  Desconsiderar Todos os Conflitos Restantes
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setIsConflictModalOpen(false)}
                className="px-4 py-2 text-xs font-bold bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-lg transition-colors cursor-pointer"
              >
                Concluir Análise
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== DRAWER: Create / Edit Local de Votação ==================== */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-scrim/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-surface-container-lowest border-l border-outline-variant shadow-xl flex flex-col justify-between">
              {/* Drawer Header */}
              <div className="p-5 border-b border-outline-variant/50 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-on-surface">
                    {editingId ? 'Editar Local de Votação' : 'Cadastrar Local de Votação'}
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    {editingId ? 'Atualize as informações e seções do colégio' : 'Adicione uma nova escola ou colégio eleitoral'}
                  </p>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Body */}
              <form id="local-form" onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
                <div>
                  <label className="block font-bold text-on-surface mb-1">Nome do Estabelecimento / Colégio *</label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Unidade Escolar Zacarias de Góis"
                    className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/70 rounded-lg text-on-surface focus:outline-none focus:border-secondary font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-on-surface mb-1">Tipo de Local</label>
                    <select
                      value={tipo}
                      onChange={(e) => setTipo(e.target.value)}
                      className="w-full h-9 px-2 bg-surface-container-low border border-outline-variant/70 rounded-lg text-on-surface focus:outline-none focus:border-secondary"
                    >
                      {TIPOS_ESTABELECIMENTO.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface mb-1">Zona Eleitoral</label>
                    <input
                      type="text"
                      value={zona}
                      onChange={(e) => setZona(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Ex: 001"
                      className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/70 rounded-lg text-on-surface focus:outline-none focus:border-secondary font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-on-surface mb-1">Município</label>
                    <input
                      type="text"
                      value={municipio}
                      onChange={(e) => setMunicipio(e.target.value)}
                      placeholder="Ex: Teresina"
                      className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/70 rounded-lg text-on-surface focus:outline-none focus:border-secondary"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface mb-1">Estado (UF)</label>
                    <input
                      type="text"
                      value={uf}
                      onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="Ex: PI"
                      className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/70 rounded-lg text-on-surface focus:outline-none focus:border-secondary font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-on-surface mb-1">Bairro</label>
                    <input
                      type="text"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                      placeholder="Ex: Centro"
                      className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/70 rounded-lg text-on-surface focus:outline-none focus:border-secondary"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface mb-1">Capacidade Estimada</label>
                    <input
                      type="number"
                      value={capacidadeAprox}
                      onChange={(e) => setCapacidadeAprox(Number(e.target.value))}
                      placeholder="Ex: 1800"
                      className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/70 rounded-lg text-on-surface focus:outline-none focus:border-secondary font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-on-surface mb-1">Endereço / Referência</label>
                  <input
                    type="text"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    placeholder="Ex: Praça Landri Sales, s/n - Centro"
                    className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/70 rounded-lg text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>

                {/* Seções Manager */}
                <div className="pt-2 border-t border-outline-variant/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block font-bold text-on-surface">Seções Eleitorais do Local</label>
                    <span className="text-[11px] text-on-surface-variant font-mono">{secoes.length} adicionadas</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newSecaoInput}
                      onChange={(e) => setNewSecaoInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSecao();
                        }
                      }}
                      placeholder="Digite a seção (ex: 0042) ou cole separadas por vírgula"
                      className="flex-1 h-9 px-3 bg-surface-container-low border border-outline-variant/70 rounded-lg text-on-surface focus:outline-none focus:border-secondary font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddSecao}
                      className="h-9 px-3 bg-secondary text-on-secondary font-bold rounded-lg text-xs hover:bg-secondary/90 transition-colors cursor-pointer"
                    >
                      Adicionar
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 p-2.5 bg-surface-container-low border border-outline-variant/50 rounded-lg min-h-[50px] max-h-[140px] overflow-y-auto">
                    {secoes.map((sec) => (
                      <span
                        key={sec}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-container-lowest border border-outline-variant text-on-surface font-mono text-[11px] rounded-md shadow-2xs"
                      >
                        <span>Seção {sec}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSecao(sec)}
                          className="hover:text-error transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {secoes.length === 0 && (
                      <span className="text-on-surface-variant italic text-[11px] py-1">
                        Nenhuma seção adicionada ainda.
                      </span>
                    )}
                  </div>
                </div>
              </form>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-outline-variant/50 flex items-center justify-end gap-2.5 bg-surface-container-low">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  form="local-form"
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold bg-primary text-on-primary rounded-lg shadow-xs hover:bg-primary/95 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Cadastrar Local'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== DETAIL MODAL: Eleitores que votam neste Colégio ==================== */}
      {viewVotersLocal && activeDetailData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col justify-between">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-outline-variant/50 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <School className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">{activeDetailData.nome}</h3>
                  <p className="text-xs text-on-surface-variant">
                    Zona {activeDetailData.zona} • Bairro {activeDetailData.bairro} • {activeDetailData.tipo}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewVotersLocal(null)}
                className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Voter summary info */}
            <div className="grid grid-cols-3 gap-3 bg-surface-container-low p-3 rounded-xl border border-outline-variant/40 text-center">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Eleitores na Base</p>
                <p className="text-lg font-black text-emerald-700 font-mono mt-0.5">
                  {activeDetailData.eleitoresIdentificados}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Seções no Colégio</p>
                <p className="text-lg font-black text-secondary font-mono mt-0.5">
                  {toSecoesArray(activeDetailData.secoes).length}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Capacidade Estimada</p>
                <p className="text-lg font-black text-on-surface font-mono mt-0.5">
                  {Number(activeDetailData.capacidadeAprox || 0).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>

            {/* List of voters */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px]">
              <div className="flex items-center justify-between text-xs font-bold text-on-surface pb-1 border-b border-outline-variant/30">
                <span>Eleitores Registrados ({activeDetailData.votersList.length})</span>
                <span className="text-[11px] text-on-surface-variant">Liderança / Seção</span>
              </div>

              {activeDetailData.votersList.length === 0 ? (
                <div className="py-8 text-center text-xs text-on-surface-variant">
                  <p className="font-semibold">Nenhum eleitor da base vota neste colégio ainda.</p>
                  <p className="text-[11px] mt-1">
                    Ao cadastrar novos eleitores com a Zona {activeDetailData.zona} e uma de suas seções ({formatSecoesText(activeDetailData.secoes)}), eles aparecerão aqui automaticamente.
                  </p>
                </div>
              ) : (
                activeDetailData.votersList.map((v) => (
                  <div
                    key={v.id}
                    className="p-2.5 bg-surface-container-low border border-outline-variant/50 rounded-lg flex items-center justify-between text-xs hover:border-secondary/40 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-on-surface">{v.nome}</p>
                      <p className="text-[11px] text-on-surface-variant font-mono">
                        CPF: {v.cpf || 'Não informado'} • {v.telefone || 'Sem tel'}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="inline-block px-2 py-0.5 text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20 rounded">
                        Seção {v.secao || 'S/S'}
                      </span>
                      <p className="text-[10px] text-secondary font-semibold mt-0.5">
                        {v.lideranca || 'Sem Liderança'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-outline-variant/50 flex justify-end">
              <button
                type="button"
                onClick={() => setViewVotersLocal(null)}
                className="px-4 py-2 text-xs font-bold bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-lg transition-colors cursor-pointer"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== IN-APP CONFIRM DELETE DIALOG ==================== */}
      {deleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-error-container text-error flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface">Excluir Local de Votação</h3>
              <p className="text-xs text-on-surface-variant mt-1">
                Tem certeza que deseja remover <strong>&ldquo;{deleteDialog.nome}&rdquo;</strong>? Esta ação excluirá o colégio e suas seções cadastradas.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteDialog(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-1.5 text-xs font-bold bg-error text-on-error rounded-lg shadow-xs hover:bg-error/90 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ==================== BATCH CONFIRM DELETE DIALOG ==================== */}
      {isBatchDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="w-11 h-11 rounded-xl bg-error-container text-error flex items-center justify-center shrink-0">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface">
                Excluir {selectedIds.length} Local(is) de Votação
              </h3>
              <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                Você selecionou <strong>{selectedIds.length} locais de votação</strong> para exclusão. Esta ação removerá definitivamente os colégios e o vínculo com suas respectivas seções eleitorais.
              </p>
            </div>

            {/* List preview of some selected locais */}
            <div className="max-h-36 overflow-y-auto border border-outline-variant/50 rounded-xl bg-surface-container-low p-2.5 space-y-1 text-xs">
              {locais
                .filter((l) => selectedIds.includes(l.id))
                .slice(0, 8)
                .map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="font-semibold text-on-surface truncate max-w-[260px]">{l.nome}</span>
                    <span className="font-mono text-on-surface-variant">Zona {l.zona}</span>
                  </div>
                ))}
              {selectedIds.length > 8 && (
                <p className="text-[10px] text-on-surface-variant italic text-center pt-1 border-t border-outline-variant/30">
                  + {selectedIds.length - 8} outros locais selecionados
                </p>
              )}
            </div>

            <p className="text-[11px] text-error font-medium bg-error/10 border border-error/20 p-2.5 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-error" />
              <span>Esta operação requer confirmação com a Senha Mestre do sistema.</span>
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/50">
              <button
                type="button"
                onClick={() => setIsBatchDeleteDialogOpen(false)}
                disabled={isBatchDeleting}
                className="px-3.5 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                disabled={isBatchDeleting}
                className="px-4 py-1.5 text-xs font-bold bg-error text-on-error rounded-lg shadow-xs hover:bg-error/90 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isBatchDeleting ? 'Excluindo...' : `Sim, Excluir (${selectedIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: ELEITORES DA SEÇÃO PENDENTE ==================== */}
      {viewPendingVotersItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col justify-between">
            <div className="flex items-start justify-between border-b border-outline-variant/50 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">
                    Eleitores da Zona {viewPendingVotersItem.zonaFormatada} • Seção {viewPendingVotersItem.secaoFormatada}
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    {viewPendingVotersItem.totalEleitores} eleitor(es) cadastrado(s) aguardando vinculação de colégio eleitoral
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewPendingVotersItem(null)}
                className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista dos eleitores */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {viewPendingVotersItem.eleitores.map((eleitor, idx) => (
                <div
                  key={eleitor.id || idx}
                  className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/40 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-on-surface truncate">{eleitor.nome}</p>
                    <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                      Bairro: <strong>{eleitor.bairro || 'Não informado'}</strong>
                      {eleitor.lideranca && ` • Liderança: ${eleitor.lideranca}`}
                    </p>
                  </div>
                  {eleitor.telefone && (
                    <span className="text-[11px] font-mono text-secondary bg-secondary/10 px-2 py-0.5 rounded-md shrink-0">
                      {eleitor.telefone}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-outline-variant/50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleSearchWeb(viewPendingVotersItem)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant rounded-lg transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-secondary" />
                <span>Buscar Local no Google/TSE</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewPendingVotersItem(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const item = viewPendingVotersItem;
                    setViewPendingVotersItem(null);
                    handleOpenCreateForSecao(item);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-primary text-on-primary rounded-lg shadow-xs hover:bg-primary/95 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Cadastrar Local</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: VINCULAR SEÇÃO PENDENTE A LOCAL EXISTENTE ==================== */}
      {linkModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-outline-variant/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center shrink-0">
                  <Link2 className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Vincular a Local Existente</h3>
                  <p className="text-xs text-on-surface-variant">
                    Associar a <strong>Zona {linkModalItem.zonaFormatada} • Seção {linkModalItem.secaoFormatada}</strong> a um colégio já cadastrado
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLinkModalItem(null)}
                className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-on-surface-variant">
                Se você já sabe a qual colégio eleitoral esta seção pertence, selecione o colégio abaixo para adicioná-la imediatamente:
              </p>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-on-surface uppercase tracking-wider">
                  Selecione o Colégio Eleitoral:
                </label>
                <select
                  value={selectedLocalToLink}
                  onChange={(e) => setSelectedLocalToLink(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/60 rounded-xl text-xs font-medium text-on-surface focus:outline-none focus:border-secondary"
                >
                  <option value="">Selecione um local...</option>
                  {locais.map((local) => {
                    const isSameZona = normalizeNum(local.zona) === normalizeNum(linkModalItem.zonaFormatada);
                    return (
                      <option key={local.id} value={local.id}>
                        {isSameZona ? '⭐ ' : ''}{local.nome} (Zona {local.zona} • {local.bairro})
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] text-on-surface-variant italic">
                  Os colégios com estrela (⭐) pertencem à mesma Zona {linkModalItem.zonaFormatada}.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-outline-variant/50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setLinkModalItem(null)}
                disabled={isLinkingSecao}
                className="px-3.5 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLinkToExisting}
                disabled={isLinkingSecao || !selectedLocalToLink}
                className="px-4 py-1.5 text-xs font-bold bg-secondary text-on-secondary rounded-lg shadow-xs hover:bg-secondary/90 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLinkingSecao ? 'Vinculando...' : 'Confirmar e Vincular Seção'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: RELATÓRIO DE IMPRESSÃO DE SEÇÕES PENDENTES ==================== */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-scrim/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-5 my-auto max-h-[95vh] flex flex-col justify-between">
            {/* Top Bar do Modal (não visível na impressão física) */}
            <div className="no-print flex items-center justify-between border-b border-outline-variant/50 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
                  <Printer className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-on-surface tracking-tight">
                    Relatório de Zonas e Seções para Pesquisa Manual
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    Folha formatada para impressão com tabela para anotação a caneta de colégios encontrados na internet
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Agora (Ctrl + P)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ÁREA IMPRIMÍVEL DO RELATÓRIO (Formatação oficial para folha A4) */}
            <div
              id="printable-report-area"
              className="flex-1 overflow-y-auto bg-white text-slate-900 p-6 rounded-xl border border-slate-200 custom-scrollbar space-y-5 text-xs font-sans print:p-0 print:border-none print:shadow-none"
            >
              {/* Cabeçalho Oficial do Relatório */}
              <div className="border-b-2 border-slate-800 pb-3 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black tracking-widest uppercase bg-slate-900 text-white px-2 py-0.5 rounded">
                      SEATI ELEITORAL
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      Sistema de Gestão & Conciliação Eleitoral
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 mt-1 uppercase tracking-tight">
                    Relatório de Zonas e Seções Pendentes de Mapeamento
                  </h2>
                  <p className="text-xs text-slate-600">
                    Campanha: <strong>{activeCampaignName}</strong> • Município: <strong>{activeCity} - {activeUf}</strong>
                  </p>
                </div>

                <div className="text-right text-[11px] text-slate-600 font-mono shrink-0">
                  <p>Data de Emissão: <strong>{new Date().toLocaleDateString('pt-BR')}</strong></p>
                  <p>Hora: <strong>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></p>
                  <p className="text-[10px] text-slate-500 mt-1">Uso Operacional Interno</p>
                </div>
              </div>

              {/* Quadro Resumo Estatístico */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-300 rounded-lg text-center text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Seções Não Mapeadas</span>
                  <p className="text-xl font-black text-slate-900 mt-0.5">{secoesPendentes.length}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Eleitores Impactados</span>
                  <p className="text-xl font-black text-slate-900 mt-0.5">{totalEleitoresPendentes}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Status da Base</span>
                  <p className="text-sm font-bold text-amber-700 mt-1">Aguardando Pesquisa Web</p>
                </div>
              </div>

              {/* Instruções de Pesquisa para o Operador */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-[11px] text-slate-700 space-y-1">
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <span>📌 Instruções para o Operador de Dados:</span>
                </p>
                <p className="leading-relaxed">
                  1. Acesse o portal do TSE (<strong>www.tse.jus.br</strong>) na aba <em>Serviços Eleitorais &gt; Título e Local de Votação</em>, ou pesquise no Google: <code>&quot;local de votacao zona [X] secao [Y] {activeCity} {activeUf} TSE&quot;</code>.<br />
                  2. Anote a caneta o <strong>Nome do Colégio</strong> e o <strong>Endereço</strong> nas colunas à direita.<br />
                  3. Em seguida, acesse a tela <em>Locais de Votação</em> no sistema, clique no botão <strong>&quot;Cadastrar Local&quot;</strong> ao lado da seção correspondente e digite o nome e endereço para eliminar a pendência.
                </p>
              </div>

              {/* Tabela Formatada para Preenchimento a Mão */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-[10px] font-bold uppercase text-slate-700 tracking-wider">
                      <th className="py-2 px-2.5 w-10 text-center">#</th>
                      <th className="py-2 px-2.5 w-24">Zona</th>
                      <th className="py-2 px-2.5 w-24">Seção</th>
                      <th className="py-2 px-2.5 w-20 text-center">Eleitores</th>
                      <th className="py-2 px-2.5 w-44">Bairro(s) do Eleitor</th>
                      <th className="py-2 px-3">Local Encontrado na Internet (Anotação Manual)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[11px]">
                    {secoesPendentes.map((item, index) => (
                      <tr key={item.key} className="break-inside-avoid">
                        {/* Índice */}
                        <td className="py-3 px-2.5 text-center font-mono font-bold text-slate-500">
                          {index + 1}
                        </td>

                        {/* Zona */}
                        <td className="py-3 px-2.5 font-mono font-bold text-slate-900">
                          Zona {item.zonaFormatada}
                        </td>

                        {/* Seção */}
                        <td className="py-3 px-2.5 font-mono font-bold text-slate-900">
                          Seção {item.secaoFormatada}
                        </td>

                        {/* Qtd Eleitores */}
                        <td className="py-3 px-2.5 text-center font-bold text-slate-800">
                          {item.totalEleitores}
                        </td>

                        {/* Bairros de Referência */}
                        <td className="py-3 px-2.5 text-slate-600 text-[10px]">
                          {item.bairrosFrequentes.length > 0
                            ? item.bairrosFrequentes.slice(0, 2).join(', ')
                            : 'Não informado'}
                        </td>

                        {/* Campo com linhas pontilhadas para preenchimento manual */}
                        <td className="py-3 px-3">
                          <div className="space-y-1.5">
                            <div className="flex items-baseline gap-1 text-[10px] text-slate-600">
                              <span className="font-semibold text-slate-700 shrink-0">Colégio:</span>
                              <span className="flex-1 border-b border-dotted border-slate-400 min-h-[14px]" />
                            </div>
                            <div className="flex items-baseline gap-1 text-[10px] text-slate-600">
                              <span className="font-semibold text-slate-700 shrink-0">Endereço:</span>
                              <span className="flex-1 border-b border-dotted border-slate-400 min-h-[14px]" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Rodapé Oficial da Impressão */}
              <div className="pt-4 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>SEATI Gestão Eleitoral • Documento Operacional Confidencial</span>
                <span>Página 1 de 1</span>
              </div>
            </div>

            {/* Rodapé do Modal (Botões no-print) */}
            <div className="no-print pt-3 border-t border-outline-variant/50 flex items-center justify-between gap-3">
              <span className="text-xs text-on-surface-variant font-medium">
                Total de <strong>{secoesPendentes.length}</strong> seção(ões) para pesquisa manual
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-xl transition-colors cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Relatório</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Regras CSS globais para impressão física sem navbar ou botões */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-report-area, #printable-report-area * {
            visibility: visible;
          }
          #printable-report-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 12px;
            background: white !important;
            color: #0f172a !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
