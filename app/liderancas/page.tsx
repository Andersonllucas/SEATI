'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Edit,
  Trash2,
  X,
  Save,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Network,
  List,
  PlusCircle,
  Sparkles,
  UserCheck,
  Download,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { exportLiderancasReal } from '@/lib/importExportUtils';
import { LiderancaRow } from '@/components/LiderancaRow';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from 'firebase/firestore';
import { getActiveDb } from '@/lib/firebase';
import { useCampaignData, Lideranca } from '@/context/CampaignContext';
import { useAuth } from '@/context/AuthContext';

const REGIOES_DISPONIVEIS = [
  'Zona Norte',
  'Zona Sul',
  'Zona Leste',
  'Zona Oeste',
  'Centro',
  'Região Metropolitana',
  'Zona Rural'
];

export default function LiderancasPage() {
  const { liderancas, eleitores, isLoaded } = useCampaignData();
  const { solicitarSenhaMestre, registrarLog } = useAuth();
  const loading = !isLoaded;
  const [viewMode, setViewMode] = useState<'table' | 'hierarchy'>('table');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'todos' | 'principal' | 'sub'>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [regiaoFilter, setRegiaoFilter] = useState<string>('todas');

  // Drawer / Form State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Form Fields
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'Liderança Principal' | 'Sub-liderança'>('Liderança Principal');
  const [liderancaPaiId, setLiderancaPaiId] = useState('');
  const [cpf, setCpf] = useState('');
  const [tituloEleitor, setTituloEleitor] = useState('');
  const [zona, setZona] = useState('');
  const [secao, setSecao] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [regiao, setRegiao] = useState('Zona Norte');
  const [bairro, setBairro] = useState('');
  const [metaVotos, setMetaVotos] = useState<number | ''>(200);
  const [status, setStatus] = useState<'Ativa' | 'Em Formação' | 'Inativa'>('Ativa');
  const [observacoes, setObservacoes] = useState('');

  // Expandable clusters in hierarchy view
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});

  // Compute voters count per leadership
  const votersCountMap = useMemo(() => {
    const counts: Record<string, number> = {};
    eleitores.forEach((e) => {
      if (e.liderancaId) {
        counts[e.liderancaId] = (counts[e.liderancaId] || 0) + 1;
      }
      if (e.lideranca) {
        // also count by name for backward compatibility
        counts[e.lideranca] = (counts[e.lideranca] || 0) + 1;
      }
    });
    return counts;
  }, [eleitores]);

  const getVoterCountForLeader = useCallback(
    (leader: Lideranca) => {
      const countById = votersCountMap[leader.id] || 0;
      const countByName = votersCountMap[leader.nome] || 0;
      return Math.max(countById, countByName);
    },
    [votersCountMap]
  );

  // Only main leaders for parent selection
  const liderancasPrincipais = useMemo(() => {
    return liderancas.filter((l) => l.tipo === 'Liderança Principal');
  }, [liderancas]);

  // Handle open drawer for Create
  const handleOpenCreate = (presetPaiId?: string) => {
    setEditingId(null);
    setNome('');
    setCpf('');
    setTituloEleitor('');
    setZona('');
    setSecao('');
    if (presetPaiId) {
      setTipo('Sub-liderança');
      setLiderancaPaiId(presetPaiId);
      const pai = liderancas.find((l) => l.id === presetPaiId);
      if (pai) setRegiao(pai.regiao);
    } else {
      setTipo('Liderança Principal');
      setLiderancaPaiId('');
      setRegiao('Zona Norte');
    }
    setTelefone('');
    setEmail('');
    setBairro('');
    setMetaVotos(150);
    setStatus('Ativa');
    setObservacoes('');
    setIsDrawerOpen(true);
  };

  // Handle open drawer for Edit
  const handleOpenEdit = (leader: Lideranca) => {
    setEditingId(leader.id);
    setNome(leader.nome);
    setTipo(leader.tipo);
    setLiderancaPaiId(leader.liderancaPaiId || '');
    setCpf(leader.cpf || '');
    setTituloEleitor(leader.tituloEleitor || '');
    setZona(leader.zona || '');
    setSecao(leader.secao || '');
    setTelefone(leader.telefone || '');
    setEmail(leader.email || '');
    setRegiao(leader.regiao || 'Zona Norte');
    setBairro(leader.bairro || '');
    setMetaVotos(leader.metaVotos || 0);
    setStatus(leader.status || 'Ativa');
    setObservacoes(leader.observacoes || '');
    setIsDrawerOpen(true);
  };

  // Tecla ESC para fechar gaveta de cadastro e menus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDrawerOpen) setIsDrawerOpen(false);
        else if (isExportMenuOpen) setIsExportMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, isExportMenuOpen]);

  // Save handler - TODAS AS INFORMAÇÕES SÃO NÃO OBRIGATÓRIAS
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const leaderNome = nome.trim() || 'Liderança sem nome';

    let paiNome = '';
    if (tipo === 'Sub-liderança' && liderancaPaiId) {
      const pai = liderancas.find((l) => l.id === liderancaPaiId);
      paiNome = pai ? pai.nome : '';
    }

    setIsSubmitting(true);
    try {
      const payload: Partial<Lideranca> = {
        nome: leaderNome,
        tipo,
        liderancaPaiId: tipo === 'Sub-liderança' ? liderancaPaiId : '',
        liderancaPaiNome: tipo === 'Sub-liderança' ? paiNome : '',
        cpf: cpf.trim(),
        tituloEleitor: tituloEleitor.trim(),
        zona: zona.trim(),
        secao: secao.trim(),
        telefone: telefone.trim(),
        email: email.trim(),
        regiao: regiao.trim(),
        bairro: bairro.trim(),
        metaVotos: Number(metaVotos) || 0,
        status,
        observacoes: observacoes.trim()
      };

      if (editingId) {
        await updateDoc(doc(getActiveDb(), 'liderancas', editingId), payload);
        await registrarLog({
          tipo: 'ALTERACAO',
          acao: `Alteração na liderança: ${nome.trim()} (${tipo})`,
          detalhes: `Região: ${regiao} | Meta: ${metaVotos} votos | Status: ${status}`,
          entidade: 'Liderança',
          entidadeId: editingId
        });
      } else {
        const docRef = await addDoc(collection(getActiveDb(), 'liderancas'), {
          ...payload,
          dataCadastro: serverTimestamp()
        });
        await registrarLog({
          tipo: 'ALTERACAO',
          acao: `Nova liderança cadastrada: ${nome.trim()} (${tipo})`,
          detalhes: `Região: ${regiao} | Meta: ${metaVotos} votos | Status: ${status}`,
          entidade: 'Liderança',
          entidadeId: docRef.id
        });
      }

      setIsDrawerOpen(false);
    } catch (err) {
      console.error('Error saving lideranca:', err);
      alert('Erro ao salvar liderança. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete handler com Senha Mestre
  const handleDelete = (leader: Lideranca) => {
    const isPrincipal = leader.tipo === 'Liderança Principal';
    const subCount = liderancas.filter((l) => l.liderancaPaiId === leader.id).length;

    let desc = `Tem certeza que deseja excluir a liderança "${leader.nome}"? Esta ação é irreversível e exige a Senha Mestre.`;
    if (isPrincipal && subCount > 0) {
      desc = `Atenção: "${leader.nome}" possui ${subCount} sub-liderança(s) vinculada(s). Excluir removerá o vínculo hierárquico na campanha. Digite a Senha Mestre para autorizar.`;
    }

    solicitarSenhaMestre({
      title: 'Excluir Liderança Política',
      description: desc,
      onSuccess: async () => {
        try {
          await deleteDoc(doc(getActiveDb(), 'liderancas', leader.id));
          await registrarLog({
            tipo: 'EXCLUSAO',
            acao: `Exclusão da liderança: ${leader.nome} (${leader.tipo})`,
            detalhes: `Liderança removida com confirmação de Senha Mestre. ID: ${leader.id}`,
            entidade: 'Liderança',
            entidadeId: leader.id
          });
        } catch (err) {
          console.error('Error deleting lideranca:', err);
          alert('Erro ao excluir liderança.');
        }
      }
    });
  };

  // Quick Seed Demo Leaders
  const handleSeedDemo = async () => {
    if (!confirm('Deseja cadastrar as 6 lideranças e sub-lideranças de demonstração da campanha?')) return;
    setIsSeeding(true);
    try {
      // 1. Main 1
      const doc1 = await addDoc(collection(getActiveDb(), 'liderancas'), {
        nome: 'Pastor Roberto Silva',
        tipo: 'Liderança Principal',
        liderancaPaiId: '',
        liderancaPaiNome: '',
        telefone: '(11) 98123-4567',
        email: 'roberto.silva@campanha.org',
        regiao: 'Zona Norte',
        bairro: 'Santana',
        metaVotos: 600,
        status: 'Ativa',
        observacoes: 'Forte articulação comunitária e eclesiástica em toda a Zona Norte.',
        dataCadastro: serverTimestamp()
      });

      // Sub for Main 1
      await addDoc(collection(getActiveDb(), 'liderancas'), {
        nome: 'Irmão Marcos Andrade',
        tipo: 'Sub-liderança',
        liderancaPaiId: doc1.id,
        liderancaPaiNome: 'Pastor Roberto Silva',
        telefone: '(11) 97654-3210',
        email: 'marcos.andrade@campanha.org',
        regiao: 'Zona Norte',
        bairro: 'Tremembé',
        metaVotos: 200,
        status: 'Ativa',
        observacoes: 'Coordena núcleos jovens e comerciantes da Avenida Nova Cantareira.',
        dataCadastro: serverTimestamp()
      });

      // 2. Main 2
      const doc2 = await addDoc(collection(getActiveDb(), 'liderancas'), {
        nome: 'Dra. Elena Vasconcelos',
        tipo: 'Liderança Principal',
        liderancaPaiId: '',
        liderancaPaiNome: '',
        telefone: '(11) 99345-6789',
        email: 'elena.vasconcelos@advocacia.com',
        regiao: 'Zona Sul',
        bairro: 'Vila Mariana',
        metaVotos: 850,
        status: 'Ativa',
        observacoes: 'Advogada atuante no setor de saúde pública e entidades de bairro.',
        dataCadastro: serverTimestamp()
      });

      // Sub for Main 2
      await addDoc(collection(getActiveDb(), 'liderancas'), {
        nome: 'Dra. Camila Nogueira',
        tipo: 'Sub-liderança',
        liderancaPaiId: doc2.id,
        liderancaPaiNome: 'Dra. Elena Vasconcelos',
        telefone: '(11) 98877-6655',
        email: 'camila.nogueira@saude.org',
        regiao: 'Zona Sul',
        bairro: 'Saúde',
        metaVotos: 300,
        status: 'Ativa',
        observacoes: 'Apoio de agentes comunitários e clínicas da região.',
        dataCadastro: serverTimestamp()
      });

      // 3. Main 3
      const doc3 = await addDoc(collection(getActiveDb(), 'liderancas'), {
        nome: 'Prof. Cláudio Mendes',
        tipo: 'Liderança Principal',
        liderancaPaiId: '',
        liderancaPaiNome: '',
        telefone: '(11) 97112-2334',
        email: 'prof.claudio@educacao.sp.gov.br',
        regiao: 'Zona Leste',
        bairro: 'Itaquera',
        metaVotos: 450,
        status: 'Ativa',
        observacoes: 'Educador e ativista social no polo universitário e escolas técnicas.',
        dataCadastro: serverTimestamp()
      });

      // Sub for Main 3
      await addDoc(collection(getActiveDb(), 'liderancas'), {
        nome: 'Professora Luíza Ferraz',
        tipo: 'Sub-liderança',
        liderancaPaiId: doc3.id,
        liderancaPaiNome: 'Prof. Cláudio Mendes',
        telefone: '(11) 96543-2198',
        email: 'luiza.ferraz@escola.org',
        regiao: 'Zona Leste',
        bairro: 'Artur Alvim',
        metaVotos: 180,
        status: 'Em Formação',
        observacoes: 'Articula grupos de pais e mestres e coletivos culturais.',
        dataCadastro: serverTimestamp()
      });
    } catch (err) {
      console.error('Error seeding demo leaders:', err);
      alert('Erro ao carregar demonstração.');
    } finally {
      setIsSeeding(false);
    }
  };

  // Filtered liderancas
  const filteredLiderancas = useMemo(() => {
    return liderancas.filter((l) => {
      const matchesSearch =
        l.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.telefone || '').includes(searchTerm) ||
        (l.bairro || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.regiao || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.liderancaPaiNome || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesTipo =
        tipoFilter === 'todos'
          ? true
          : tipoFilter === 'principal'
          ? l.tipo === 'Liderança Principal'
          : l.tipo === 'Sub-liderança';

      const matchesStatus = statusFilter === 'todos' ? true : l.status === statusFilter;

      const matchesRegiao = regiaoFilter === 'todas' ? true : l.regiao === regiaoFilter;

      return matchesSearch && matchesTipo && matchesStatus && matchesRegiao;
    });
  }, [liderancas, searchTerm, tipoFilter, statusFilter, regiaoFilter]);

  // Overall metrics
  const totalPrincipais = useMemo(
    () => liderancas.filter((l) => l.tipo === 'Liderança Principal').length,
    [liderancas]
  );
  const totalSubs = useMemo(
    () => liderancas.filter((l) => l.tipo === 'Sub-liderança').length,
    [liderancas]
  );
  const totalMetaVotos = useMemo(
    () => liderancas.reduce((acc, curr) => acc + (curr.metaVotos || 0), 0),
    [liderancas]
  );
  const totalEleitoresVinculados = useMemo(() => {
    let count = 0;
    liderancas.forEach((l) => {
      count += getVoterCountForLeader(l);
    });
    return count;
  }, [liderancas, getVoterCountForLeader]);

  // Toggle cluster in hierarchy view
  const toggleCluster = (id: string) => {
    setExpandedClusters((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto flex-1 h-full flex flex-col relative">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Articulação Política
            </span>
            <span className="text-xs bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full font-medium">
              Rede de Lideranças & Sub-lideranças
            </span>
          </div>
          <h1 className="text-xl md:text-2xl text-on-surface font-bold tracking-tight">
            Gestão de Lideranças e Sub-coordenações
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Cadastre os articuladores de base, estabeleça metas territoriais e acompanhe os eleitores trazidos por cada um.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Export Dropdown */}
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="px-3.5 py-2 bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-outline-variant/60 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-secondary" />
              <span>Exportar</span>
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg py-1 z-30">
                <button
                  type="button"
                  onClick={() => {
                    exportLiderancasReal(liderancas, eleitores, 'pdf');
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2 text-on-surface font-medium cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-error" /> Documento PDF (.pdf)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportLiderancasReal(liderancas, eleitores, 'xlsx');
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2 text-on-surface font-medium cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportLiderancasReal(liderancas, eleitores, 'csv');
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2 text-on-surface font-medium cursor-pointer"
                >
                  <Download className="w-4 h-4 text-secondary" /> CSV (.csv)
                </button>
              </div>
            )}
          </div>

          {liderancas.length === 0 && !loading && (
            <button
              onClick={handleSeedDemo}
              disabled={isSeeding}
              className="px-3 py-2 bg-surface-container-high text-secondary hover:bg-surface-container-highest border border-outline-variant/60 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-secondary" />
              {isSeeding ? 'Carregando...' : 'Carregar Lideranças Demo'}
            </button>
          )}

          <button
            onClick={() => handleOpenCreate()}
            className="px-4 py-2 bg-primary-container text-on-primary rounded-md text-sm font-semibold flex items-center gap-2 hover:bg-secondary transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" /> Nova Liderança / Sub
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Lideranças Principais
            </p>
            <h3 className="text-2xl font-bold mt-1 text-primary">{totalPrincipais}</h3>
            <p className="text-xs text-on-surface-variant mt-1">Coordenadores de polo</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Sub-lideranças Ativas
            </p>
            <h3 className="text-2xl font-bold mt-1 text-secondary">{totalSubs}</h3>
            <p className="text-xs text-on-surface-variant mt-1">Multiplicadores comunitários</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
            <Network className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Meta Geral de Votos
            </p>
            <h3 className="text-2xl font-bold mt-1 text-primary">{totalMetaVotos.toLocaleString('pt-BR')}</h3>
            <p className="text-xs text-on-surface-variant mt-1">Somatório de metas de base</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-primary-container">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Eleitores Cadastrados
            </p>
            <h3 className="text-2xl font-bold mt-1 text-emerald-700">{totalEleitoresVinculados}</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              {totalMetaVotos > 0
                ? `${Math.round((totalEleitoresVinculados / totalMetaVotos) * 100)}% da meta atingida`
                : 'Aguardando vinculações'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm overflow-hidden flex flex-col flex-1">
        {/* Filters and Tabs Toolbar */}
        <div className="px-4 py-3 bg-surface border-b border-outline-variant/50 flex flex-wrap items-center justify-between gap-3">
          {/* Left: View Mode toggle & Type Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex border border-outline-variant/60 rounded-md p-0.5 bg-surface-container-low text-xs">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded font-semibold flex items-center gap-1.5 transition-colors ${
                  viewMode === 'table'
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <List className="w-3.5 h-3.5" /> Lista Geral
              </button>
              <button
                onClick={() => setViewMode('hierarchy')}
                className={`px-3 py-1.5 rounded font-semibold flex items-center gap-1.5 transition-colors ${
                  viewMode === 'hierarchy'
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Network className="w-3.5 h-3.5" /> Visão em Rede / Árvore
              </button>
            </div>

            <div className="h-4 w-px bg-outline-variant/40 hidden sm:block"></div>

            <div className="flex gap-1">
              <button
                onClick={() => setTipoFilter('todos')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  tipoFilter === 'todos'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                Todas ({liderancas.length})
              </button>
              <button
                onClick={() => setTipoFilter('principal')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  tipoFilter === 'principal'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                Principais ({totalPrincipais})
              </button>
              <button
                onClick={() => setTipoFilter('sub')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  tipoFilter === 'sub'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                Sub-lideranças ({totalSubs})
              </button>
            </div>
          </div>

          {/* Right: Search and Dropdown filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status select */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
            >
              <option value="todos">Todos os Status</option>
              <option value="Ativa">Ativa</option>
              <option value="Em Formação">Em Formação</option>
              <option value="Inativa">Inativa</option>
            </select>

            {/* Região select */}
            <select
              value={regiaoFilter}
              onChange={(e) => setRegiaoFilter(e.target.value)}
              className="h-9 bg-surface-container-lowest border border-outline-variant/50 rounded-md px-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
            >
              <option value="todas">Todas as Regiões</option>
              {REGIOES_DISPONIVEIS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Buscar por nome, bairro, telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-48 sm:w-64 h-9 bg-surface-container-lowest border border-outline-variant/50 rounded-md pl-9 pr-3 text-xs text-on-surface focus:outline-none focus:border-secondary"
              />
            </div>
          </div>
        </div>

        {/* View Mode Content */}
        {viewMode === 'table' ? (
          /* Table View */
          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/60 text-xs text-on-surface-variant uppercase font-semibold">
                  <th className="py-3 px-4">Articulador / Cargo</th>
                  <th className="py-3 px-4">Vínculo Hierárquico</th>
                  <th className="py-3 px-4">Território / Base</th>
                  <th className="py-3 px-4">Contato Oficial</th>
                  <th className="py-3 px-4">Captação / Meta</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-on-surface-variant">
                      Carregando lideranças do banco de dados...
                    </td>
                  </tr>
                ) : filteredLiderancas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-on-surface-variant">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users className="w-8 h-8 text-outline-variant" />
                        <p className="font-semibold text-on-surface">Nenhuma liderança encontrada</p>
                        <p className="text-xs text-on-surface-variant">
                          Ajuste os filtros ou crie uma nova liderança clicando no botão acima.
                        </p>
                        {liderancas.length === 0 && (
                          <button
                            onClick={handleSeedDemo}
                            disabled={isSeeding}
                            className="mt-2 px-3 py-1.5 bg-primary text-on-primary text-xs rounded-md font-semibold hover:bg-secondary transition-colors"
                          >
                            Carregar Exemplo de Demonstração
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredLiderancas.map((leader) => {
                    const voterCount = getVoterCountForLeader(leader);
                    const meta = leader.metaVotos || 0;
                    const pct = meta > 0 ? Math.min(100, Math.round((voterCount / meta) * 100)) : 0;
                    const isPrincipal = leader.tipo === 'Liderança Principal';
                    const subsCount = liderancas.filter((l) => l.liderancaPaiId === leader.id).length;

                    return (
                      <LiderancaRow
                        key={leader.id}
                        leader={leader}
                        voterCount={voterCount}
                        meta={meta}
                        pct={pct}
                        isPrincipal={isPrincipal}
                        subsCount={subsCount}
                        onAddSub={() => handleOpenCreate(leader.id)}
                        onEdit={() => handleOpenEdit(leader)}
                        onDelete={() => handleDelete(leader)}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Hierarchy / Tree View */
          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
            <div className="bg-surface-container-low border border-outline-variant/60 rounded-lg p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-on-surface">Estrutura Hierárquica da Campanha</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Cada Liderança Principal coordena um grupo de Sub-lideranças distribuídas por bairros estratégicos.
                </p>
              </div>
              <button
                onClick={() => handleOpenCreate()}
                className="px-3 py-1.5 bg-primary text-on-primary rounded text-xs font-semibold hover:bg-secondary transition-colors"
              >
                + Nova Liderança Principal
              </button>
            </div>

            {loading ? (
              <p className="text-center py-12 text-on-surface-variant text-sm">Carregando estrutura hierárquica...</p>
            ) : liderancasPrincipais.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant text-sm">
                Nenhuma liderança principal cadastrada.
              </div>
            ) : (
              liderancasPrincipais.map((principal) => {
                const subLeaders = liderancas.filter((l) => l.liderancaPaiId === principal.id);
                const isExpanded = expandedClusters[principal.id] !== false; // default expanded

                // Cluster aggregates
                const directVoters = getVoterCountForLeader(principal);
                const subsVoters = subLeaders.reduce((acc, s) => acc + getVoterCountForLeader(s), 0);
                const totalClusterVoters = directVoters + subsVoters;

                const directMeta = principal.metaVotos || 0;
                const subsMeta = subLeaders.reduce((acc, s) => acc + (s.metaVotos || 0), 0);
                const totalClusterMeta = directMeta + subsMeta;

                const clusterPct =
                  totalClusterMeta > 0
                    ? Math.min(100, Math.round((totalClusterVoters / totalClusterMeta) * 100))
                    : 0;

                return (
                  <div
                    key={principal.id}
                    className="border border-outline-variant/70 rounded-xl bg-surface-container-lowest overflow-hidden shadow-xs"
                  >
                    {/* Header: Liderança Principal */}
                    <div className="p-4 bg-surface-container-low/60 border-b border-outline-variant/50 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleCluster(principal.id)}
                          className="p-1 hover:bg-surface-container rounded text-on-surface-variant"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-secondary" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-secondary" />
                          )}
                        </button>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-on-surface">{principal.nome}</h3>
                            <span className="text-[10px] bg-primary text-on-primary px-2 py-0.5 rounded-full font-bold uppercase">
                              Liderança Principal
                            </span>
                            <span className="text-xs text-on-surface-variant">
                              • {principal.bairro} ({principal.regiao})
                            </span>
                          </div>
                          <p className="text-xs text-on-surface-variant mt-0.5">
                            Tel: {principal.telefone} • {subLeaders.length} sub-liderança(s) vinculada(s)
                          </p>
                        </div>
                      </div>

                      {/* Cluster metrics */}
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[10px] uppercase font-bold text-on-surface-variant">
                            Meta Total do Núcleo
                          </p>
                          <p className="text-sm font-bold text-primary">
                            {totalClusterVoters} / {totalClusterMeta} votos ({clusterPct}%)
                          </p>
                          <div className="w-32 h-1.5 bg-surface-container rounded-full overflow-hidden mt-1 ml-auto">
                            <div
                              className="h-full bg-secondary rounded-full"
                              style={{ width: `${clusterPct}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-1 border-l border-outline-variant/50 pl-4">
                          <button
                            onClick={() => handleOpenCreate(principal.id)}
                            className="px-2.5 py-1.5 bg-secondary-container text-on-secondary-container rounded text-xs font-semibold flex items-center gap-1 hover:bg-secondary hover:text-on-primary transition-colors"
                          >
                            <PlusCircle className="w-3.5 h-3.5" /> + Sub
                          </button>
                          <button
                            onClick={() => handleOpenEdit(principal)}
                            className="p-1.5 text-on-surface-variant hover:text-on-surface rounded"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(principal)}
                            className="p-1.5 text-error hover:bg-error/10 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Sub-leaders child list */}
                    {isExpanded && (
                      <div className="p-4 pl-12 space-y-3 bg-surface-container-lowest">
                        {subLeaders.length === 0 ? (
                          <div className="py-4 px-3 border border-dashed border-outline-variant/60 rounded-lg text-center">
                            <p className="text-xs text-on-surface-variant">
                              Nenhuma sub-liderança vinculada a este núcleo ainda.
                            </p>
                            <button
                              onClick={() => handleOpenCreate(principal.id)}
                              className="text-xs text-secondary font-semibold hover:underline mt-1 inline-block"
                            >
                              + Vincular primeira sub-liderança
                            </button>
                          </div>
                        ) : (
                          subLeaders.map((sub) => {
                            const subVoters = getVoterCountForLeader(sub);
                            const subMeta = sub.metaVotos || 0;
                            const subPct =
                              subMeta > 0 ? Math.min(100, Math.round((subVoters / subMeta) * 100)) : 0;

                            return (
                              <div
                                key={sub.id}
                                className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-container-low/40 border border-outline-variant/40 rounded-lg hover:border-secondary/40 transition-colors"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-on-surface">{sub.nome}</p>
                                    <span className="text-[9px] bg-secondary/10 text-secondary border border-secondary/20 px-1.5 py-0.5 rounded font-bold uppercase">
                                      Sub
                                    </span>
                                  </div>
                                  <p className="text-xs text-on-surface-variant mt-0.5">
                                    {sub.bairro} ({sub.regiao}) • Tel: {sub.telefone}
                                  </p>
                                </div>

                                <div className="flex items-center gap-6">
                                  <div className="w-28 text-right">
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className="text-[10px] text-on-surface-variant">Captação:</span>
                                      <span className="font-bold text-xs">
                                        {subVoters}/{subMeta}
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-secondary rounded-full"
                                        style={{ width: `${subPct}%` }}
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleOpenEdit(sub)}
                                      className="p-1 text-on-surface-variant hover:text-on-surface"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(sub)}
                                      className="p-1 text-error hover:bg-error/10 rounded"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Overlay Backdrop */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      {/* Side Drawer for Add / Edit */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-[520px] bg-surface-container-lowest shadow-2xl border-l border-outline-variant z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="px-6 py-5 bg-primary text-on-primary flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-container-lowest/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary-fixed" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">
                {editingId ? 'Editar Articulador' : 'Cadastro de Liderança / Sub'}
              </h2>
              <p className="text-xs text-inverse-primary">Articulação Territorial da Campanha</p>
            </div>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="hover:bg-surface-container-lowest/20 p-1.5 rounded transition-colors text-on-primary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          <form id="lideranca-form" onSubmit={handleSave} className="space-y-4">
            {/* Cargo / Tipo Selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                Nível na Hierarquia Política <span className="text-error">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTipo('Liderança Principal');
                    setLiderancaPaiId('');
                  }}
                  className={`p-3 rounded-lg border text-left flex flex-col transition-all ${
                    tipo === 'Liderança Principal'
                      ? 'border-secondary bg-secondary/5 ring-2 ring-secondary/20'
                      : 'border-outline-variant hover:bg-surface-container-low'
                  }`}
                >
                  <span className="text-xs font-bold text-primary">Liderança Principal</span>
                  <span className="text-[11px] text-on-surface-variant mt-0.5">
                    Coordena um polo ou grande região
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTipo('Sub-liderança')}
                  className={`p-3 rounded-lg border text-left flex flex-col transition-all ${
                    tipo === 'Sub-liderança'
                      ? 'border-secondary bg-secondary/5 ring-2 ring-secondary/20'
                      : 'border-outline-variant hover:bg-surface-container-low'
                  }`}
                >
                  <span className="text-xs font-bold text-secondary">Sub-liderança</span>
                  <span className="text-[11px] text-on-surface-variant mt-0.5">
                    Atua em bairro ou núcleo específico
                  </span>
                </button>
              </div>
            </div>

            {/* Parent Leader Selector (If Sub-liderança) */}
            {tipo === 'Sub-liderança' && (
              <div className="bg-surface-container-low p-3.5 rounded-lg border border-secondary/30 space-y-1.5">
                <label className="block text-xs font-semibold text-on-surface">
                  Vincular à Liderança Principal <span className="text-on-surface-variant font-normal">(Opcional)</span>
                </label>
                <select
                  value={liderancaPaiId}
                  onChange={(e) => setLiderancaPaiId(e.target.value)}
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none bg-surface text-on-surface"
                >
                  <option value="">Nenhuma ou selecione depois...</option>
                  {liderancasPrincipais.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({p.regiao} - {p.bairro})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-on-surface-variant">
                  Os eleitores captados por esta sub-liderança somarão também à meta do líder principal.
                </p>
              </div>
            )}

            {/* Dados Pessoais */}
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30 pb-2 pt-2">
              Identificação & Contato
            </h3>

            <div>
              <label className="block text-xs font-semibold mb-1 text-on-surface">
                Nome da Liderança <span className="text-on-surface-variant font-normal">(Opcional)</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Carlos Eduardo Silveira"
                className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none placeholder:text-outline/70 bg-surface text-on-surface"
              />
            </div>

            {/* Documentos & Dados Eleitorais da Liderança (Opcionais) */}
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30 pb-2 pt-2">
              Documentos & Dados Eleitorais (Opcional)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">
                  CPF <span className="text-on-surface-variant font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none font-mono placeholder:text-outline/70 bg-surface text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">
                  Título de Eleitor <span className="text-on-surface-variant font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={tituloEleitor}
                  onChange={(e) => setTituloEleitor(e.target.value)}
                  placeholder="0000 0000 0000"
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none font-mono placeholder:text-outline/70 bg-surface text-on-surface"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">
                  Zona Eleitoral <span className="text-on-surface-variant font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={zona}
                  onChange={(e) => setZona(e.target.value)}
                  placeholder="Ex: 001"
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none font-mono placeholder:text-outline/70 bg-surface text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">
                  Seção Eleitoral <span className="text-on-surface-variant font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={secao}
                  onChange={(e) => setSecao(e.target.value)}
                  placeholder="Ex: 0042"
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none font-mono placeholder:text-outline/70 bg-surface text-on-surface"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">
                  Telefone / WhatsApp <span className="text-on-surface-variant font-normal">(Opcional)</span>
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
                <label className="block text-xs font-semibold mb-1 text-on-surface">
                  E-mail <span className="text-on-surface-variant font-normal">(Opcional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="articulador@email.com"
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none placeholder:text-outline/70 bg-surface text-on-surface"
                />
              </div>
            </div>

            {/* Território & Meta */}
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30 pb-2 pt-2">
              Território de Atuação & Metas (Opcional)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">
                  Região / Polo <span className="text-on-surface-variant font-normal">(Opcional)</span>
                </label>
                <select
                  value={regiao}
                  onChange={(e) => setRegiao(e.target.value)}
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none bg-surface text-on-surface"
                >
                  <option value="">Não especificada</option>
                  {REGIOES_DISPONIVEIS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">
                  Bairro Principal <span className="text-on-surface-variant font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  placeholder="Ex: Santana, Tatuapé"
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none placeholder:text-outline/70 bg-surface text-on-surface"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">
                  Meta de Votos / Eleitores <span className="text-on-surface-variant font-normal">(Opcional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={metaVotos}
                  onChange={(e) => setMetaVotos(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="200"
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none font-mono bg-surface text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">Status do Articulador</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full h-10 border border-outline-variant rounded-md px-3 text-sm focus:border-secondary outline-none bg-surface text-on-surface"
                >
                  <option value="Ativa">Ativa (Em campo)</option>
                  <option value="Em Formação">Em Formação</option>
                  <option value="Inativa">Inativa</option>
                </select>
              </div>
            </div>

            {/* Observações Políticas */}
            <div>
              <label className="block text-xs font-semibold mb-1 text-on-surface">
                Observações Estratégicas / Perfil de Articulação
              </label>
              <textarea
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: Presença consolidada em associações de moradores, forte diálogo com servidores..."
                className="w-full border border-outline-variant rounded-md p-3 text-xs focus:border-secondary outline-none bg-surface text-on-surface custom-scrollbar"
              />
            </div>
          </form>
        </div>

        {/* Drawer Footer */}
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
            form="lideranca-form"
            disabled={isSubmitting}
            className="px-6 py-2 bg-primary-container text-on-primary rounded-md text-sm font-semibold flex items-center gap-2 hover:bg-secondary transition-colors shadow disabled:opacity-70"
          >
            <Save className="w-4 h-4" /> {isSubmitting ? 'Salvando...' : 'Salvar Articulador'}
          </button>
        </div>
      </div>
    </div>
  );
}
