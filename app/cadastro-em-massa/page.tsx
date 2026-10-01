'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Zap,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  Keyboard,
  ListOrdered,
  Table as TableIcon,
  Download,
  Clock,
  Sparkles,
  X,
  FileCheck,
  Share2
} from 'lucide-react';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from 'firebase/firestore';
import { getActiveDb } from '@/lib/firebase';
import Link from 'next/link';
import { useCampaignData, formatTituloUtil } from '@/context/CampaignContext';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { ESTADOS_BRASIL } from '@/lib/locaisCatalog';
import { BairroSelector } from '@/components/BairroSelector';
import { ShareFieldLinkModal } from '@/components/ShareFieldLinkModal';

interface EleitorCadastradoSessao {
  id: string;
  nome: string;
  cpf: string;
  tituloEleitor?: string;
  telefone: string;
  bairro: string;
  lideranca: string;
  liderancaId: string;
  timestamp: Date;
}

interface GridRow {
  tempId: string;
  nome: string;
  cpf: string;
  tituloEleitor: string;
  telefone: string;
  bairro: string;
  liderancaId: string;
  liderancaNome: string;
  zona: string;
  secao: string;
  status: 'idle' | 'valid' | 'saving' | 'saved' | 'error';
  errorMsg?: string;
}

export default function CadastroEmMassaPage() {
  const { solicitarSenhaMestre, registrarLog } = useAuth();
  const { activeDb, currentTenant } = useTenant();
  const targetDb = activeDb || getActiveDb();
  // Mode: 'continuous' (single fast keyboard form) or 'grid' (spreadsheet multi-row)
  const [activeMode, setActiveMode] = useState<'continuous' | 'grid'>('continuous');

  // Campaign Context with instant cached data
  const { liderancas, eleitores, locais } = useCampaignData();

  // Lista única e real de bairros já cadastrados no sistema (eleitores, lideranças e locais)
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

  // Precomputed existing CPFs for duplicate warnings
  const existingCpfs = useMemo(() => {
    const cpfMap = new Map<string, { nome: string; lideranca: string }>();
    eleitores.forEach((d) => {
      if (d.cpf) {
        const clean = d.cpf.replace(/\D/g, '');
        if (clean) {
          cpfMap.set(clean, {
            nome: d.nome || 'Eleitor',
            lideranca: d.lideranca || 'Liderança'
          });
        }
      }
    });
    return cpfMap;
  }, [eleitores]);

  // Precomputed existing Titulos for duplicate warnings
  const existingTitulos = useMemo(() => {
    const tituloMap = new Map<string, { nome: string; lideranca: string; titulo: string }>();
    eleitores.forEach((d) => {
      if (d.tituloEleitor) {
        const clean = d.tituloEleitor.replace(/\D/g, '');
        if (clean && clean.length >= 5) {
          tituloMap.set(clean, {
            nome: d.nome || 'Eleitor',
            lideranca: d.lideranca || 'Liderança',
            titulo: d.tituloEleitor
          });
        }
      }
    });
    return tituloMap;
  }, [eleitores]);

  // Continuous Form State
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [tituloEleitor, setTituloEleitor] = useState('');
  const [telefone, setTelefone] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('SP');
  const [zona, setZona] = useState('001');
  const [secao, setSecao] = useState('0042');
  const [customLiderancaId, setCustomLiderancaId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ nome: string; lideranca: string } | null>(null);
  const [tituloDuplicateWarning, setTituloDuplicateWarning] = useState<{ nome: string; lideranca: string; titulo: string } | null>(null);
  const [isShareFieldModalOpen, setIsShareFieldModalOpen] = useState(false);

  // Inicializar cidade e estado da campanha
  useEffect(() => {
    if (currentTenant?.cidade && !cidade) {
      setCidade(currentTenant.cidade);
    }
    if (currentTenant?.uf && (!estado || estado === 'SP')) {
      setEstado(currentTenant.uf);
    }
  }, [currentTenant]);

  // Sticky Context (Values that remain locked between consecutive registrations)
  const [isContextLocked, setIsContextLocked] = useState(true);
  const [stickyLiderancaId, setStickyLiderancaId] = useState('');
  const [defaultBairro, setDefaultBairro] = useState('');
  const [defaultZona, setDefaultZona] = useState('001');
  const [defaultSecao, setDefaultSecao] = useState('0042');

  const defaultLiderancaId = stickyLiderancaId || (liderancas.length > 0 ? liderancas[0].id : '');
  const setDefaultLiderancaId = setStickyLiderancaId;
  const liderancaId = customLiderancaId || defaultLiderancaId;
  const setLiderancaId = setCustomLiderancaId;

  // Audio Feedback Toggle com persistência no LocalStorage
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('adti_bulk_sound_enabled');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  // Session Statistics & Log
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionStart] = useState<Date>(new Date());
  const [recentSavedList, setRecentSavedList] = useState<EleitorCadastradoSessao[]>([]);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'warn' | 'error' } | null>(null);

  // Form input refs for keyboard autofocus
  const nomeInputRef = useRef<HTMLInputElement>(null);
  const cpfInputRef = useRef<HTMLInputElement>(null);
  const tituloInputRef = useRef<HTMLInputElement>(null);
  const telefoneInputRef = useRef<HTMLInputElement>(null);

  // Grid / Spreadsheet State
  const [gridRows, setGridRows] = useState<GridRow[]>([
    { tempId: '1', nome: '', cpf: '', tituloEleitor: '', telefone: '', bairro: '', liderancaId: '', liderancaNome: '', zona: '001', secao: '0042', status: 'idle' },
    { tempId: '2', nome: '', cpf: '', tituloEleitor: '', telefone: '', bairro: '', liderancaId: '', liderancaNome: '', zona: '001', secao: '0042', status: 'idle' },
    { tempId: '3', nome: '', cpf: '', tituloEleitor: '', telefone: '', bairro: '', liderancaId: '', liderancaNome: '', zona: '001', secao: '0042', status: 'idle' },
    { tempId: '4', nome: '', cpf: '', tituloEleitor: '', telefone: '', bairro: '', liderancaId: '', liderancaNome: '', zona: '001', secao: '0042', status: 'idle' },
    { tempId: '5', nome: '', cpf: '', tituloEleitor: '', telefone: '', bairro: '', liderancaId: '', liderancaNome: '', zona: '001', secao: '0042', status: 'idle' }
  ]);
  const [isSavingGrid, setIsSavingGrid] = useState(false);

  // In-App Confirm Dialog state (Safe for iframes)
  const [deleteDialog, setDeleteDialog] = useState<{ id: string; nome: string } | null>(null);

  // Tecla ESC para fechar janelas/diálogos abertos
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteDialog) setDeleteDialog(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteDialog]);

  // 1. Play subtle harmonic beep for rapid auditory feedback
  const playSuccessSound = useCallback((forcePlay = false) => {
    if (!soundEnabled && !forcePlay) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Harmonic pleasant chord (F5 -> A5)
      osc.frequency.setValueAtTime(698.46, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Audio might be blocked by autoplay policies until user interaction, ignore gracefully
    }
  }, [soundEnabled]);

  // 2. Play warning beep for validation errors or duplications
  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(330, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.16);

      gain.gain.setValueAtTime(0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.20);
    } catch {}
  }, [soundEnabled]);

  // Toggle do som com feedback sonoro imediato
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('adti_bulk_sound_enabled', String(next));
    }
    if (next) {
      playSuccessSound(true);
      setToastMessage({ text: 'Feedback sonoro ativado (bipe harmônico)', type: 'success' });
    } else {
      setToastMessage({ text: 'Feedback sonoro desativado (modo silencioso)', type: 'warn' });
    }
  };

  // Mask CPF: 000.000.000-00
  const formatCPF = (val: string) => {
    const numbers = val.replace(/\D/g, '').slice(0, 11);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9, 11)}`;
  };

  // Mask Phone: (00) 00000-0000
  const formatPhone = (val: string) => {
    const numbers = val.replace(/\D/g, '').slice(0, 11);
    if (numbers.length <= 2) return numbers ? `(${numbers}` : '';
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  // Check CPF in real time
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatCPF(raw);
    setCpf(formatted);

    const clean = formatted.replace(/\D/g, '');
    if (clean.length === 11) {
      const existing = existingCpfs.get(clean);
      if (existing) {
        setDuplicateWarning(existing);
      } else {
        setDuplicateWarning(null);
      }
    } else {
      setDuplicateWarning(null);
    }
  };

  // Check Titulo in real time com pontuação automática (3 blocos de 4 números)
  const handleTituloChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatTituloUtil(raw);
    setTituloEleitor(formatted);

    const clean = raw.replace(/\D/g, '');
    if (clean.length >= 5) {
      const existing = existingTitulos.get(clean);
      if (existing) {
        setTituloDuplicateWarning(existing);
      } else {
        setTituloDuplicateWarning(null);
      }
    } else {
      setTituloDuplicateWarning(null);
    }
  };

  // Autofocus on Mount
  useEffect(() => {
    nomeInputRef.current?.focus();
  }, [activeMode]);

  // ==================== SUBMIT CONTINUOUS FORM ====================
  const handleSaveContinuous = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmedNome = nome.trim();
    const cleanCpf = cpf.replace(/\D/g, '');
    const trimmedTitulo = tituloEleitor.trim();

    if (!trimmedNome) {
      playAlertSound();
      setToastMessage({ text: 'Por favor, digite o Nome Completo do eleitor.', type: 'warn' });
      nomeInputRef.current?.focus();
      return;
    }

    // CPF não é obrigatório: se digitado, valida 11 dígitos
    if (cleanCpf && cleanCpf.length < 11) {
      playAlertSound();
      setToastMessage({ text: 'O CPF digitado deve conter 11 dígitos ou ser deixado em branco.', type: 'warn' });
      cpfInputRef.current?.focus();
      return;
    }

    if (!trimmedTitulo) {
      playAlertSound();
      setToastMessage({ text: 'Informe o Número do Título de Eleitor (obrigatório).', type: 'warn' });
      tituloInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const targetLeader = liderancas.find((l) => l.id === liderancaId) || liderancas[0];
      const leaderName = targetLeader ? targetLeader.nome : 'Sem Liderança';
      const leaderId = targetLeader ? targetLeader.id : '';
      const formattedTitulo = formatTituloUtil(trimmedTitulo);

      const newDocRef = await addDoc(collection(targetDb, 'eleitores'), {
        nome: trimmedNome,
        cpf: cleanCpf ? cpf : '',
        tituloEleitor: formattedTitulo,
        telefone: telefone || '',
        bairro: (bairro || defaultBairro || '').trim(),
        cidade: (cidade || currentTenant?.cidade || '').trim(),
        estado: (estado || currentTenant?.uf || 'SP').trim(),
        zona: zona || defaultZona || '001',
        secao: secao || defaultSecao || '0042',
        lideranca: leaderName,
        liderancaId: leaderId,
        status: 'Pendente de confirmação',
        dataCadastro: serverTimestamp()
      });

      // Feedback sound & toast
      playSuccessSound();
      setToastMessage({
        text: `✓ "${trimmedNome}" cadastrado com sucesso! (#${sessionCount + 1})`,
        type: 'success'
      });

      // Prepend to recent session history
      setRecentSavedList((prev) => [
        {
          id: newDocRef.id,
          nome: trimmedNome,
          cpf: cleanCpf ? cpf : '',
          tituloEleitor: formattedTitulo,
          telefone: telefone,
          bairro: (bairro || defaultBairro || '').trim(),
          lideranca: leaderName,
          liderancaId: leaderId,
          timestamp: new Date()
        },
        ...prev
      ]);
      setSessionCount((prev) => prev + 1);

      await registrarLog({
        tipo: 'ALTERACAO',
        acao: `Cadastro contínuo de eleitor: ${trimmedNome}`,
        detalhes: `CPF: ${cleanCpf ? cpf : 'Não informado'} | Título: ${formattedTitulo} | Liderança: ${leaderName || '-'} | Bairro: ${bairro || defaultBairro || '-'} | Cidade: ${cidade || currentTenant?.cidade || '-'}`,
        entidade: 'Eleitor',
        entidadeId: newDocRef.id
      });

      // Clear voter-specific fields
      setNome('');
      setCpf('');
      setTituloEleitor('');
      setTelefone('');
      setDuplicateWarning(null);
      setTituloDuplicateWarning(null);

      // If context is NOT locked, clear context fields too
      if (!isContextLocked) {
        setBairro('');
      }

      // Keep focus instantly on Nome for zero-friction next entry
      setTimeout(() => {
        nomeInputRef.current?.focus();
      }, 50);
    } catch (err) {
      console.error('Erro ao salvar eleitor:', err);
      setToastMessage({ text: 'Erro ao salvar no banco de dados. Tente novamente.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard shortcut listener
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    // Ctrl + Enter or Cmd + Enter to save and proceed
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSaveContinuous();
      return;
    }

    // Escape to reset current fields (keeps locked defaults)
    if (e.key === 'Escape') {
      setNome('');
      setCpf('');
      setTituloEleitor('');
      setTelefone('');
      setDuplicateWarning(null);
      nomeInputRef.current?.focus();
    }
  };

  // ==================== GRID SPREADSHEET HANDLERS ====================
  const handleGridCellChange = (tempId: string, field: keyof GridRow, value: string) => {
    setGridRows((prev) =>
      prev.map((row) => {
        if (row.tempId !== tempId) return row;

        const updated = { ...row, [field]: value };

        if (field === 'cpf') {
          updated.cpf = formatCPF(value);
        } else if (field === 'tituloEleitor') {
          updated.tituloEleitor = formatTituloUtil(value);
        } else if (field === 'telefone') {
          updated.telefone = formatPhone(value);
        } else if (field === 'liderancaId') {
          const leader = liderancas.find((l) => l.id === value);
          updated.liderancaNome = leader ? leader.nome : '';
        }

        // Validate on the fly: CPF é opcional
        const cleanCpf = updated.cpf.replace(/\D/g, '');
        const hasValidCpf = !cleanCpf || cleanCpf.length === 11;
        if (updated.nome.trim() && updated.tituloEleitor.trim() && hasValidCpf) {
          updated.status = 'valid';
          updated.errorMsg = undefined;
        } else if (!updated.nome.trim() && !cleanCpf && !updated.tituloEleitor.trim()) {
          updated.status = 'idle';
          updated.errorMsg = undefined;
        }

        return updated;
      })
    );
  };

  const handleAddGridRows = (count: number) => {
    const newRows: GridRow[] = [];
    const baseId = Date.now();
    for (let i = 0; i < count; i++) {
      newRows.push({
        tempId: `${baseId}-${i}`,
        nome: '',
        cpf: '',
        tituloEleitor: '',
        telefone: '',
        bairro: defaultBairro || '',
        liderancaId: defaultLiderancaId || '',
        liderancaNome: liderancas.find((l) => l.id === defaultLiderancaId)?.nome || '',
        zona: defaultZona || '001',
        secao: defaultSecao || '0042',
        status: 'idle'
      });
    }
    setGridRows((prev) => [...prev, ...newRows]);
  };

  const handleApplyContextToGrid = () => {
    const leader = liderancas.find((l) => l.id === defaultLiderancaId);
    setGridRows((prev) =>
      prev.map((row) => ({
        ...row,
        bairro: row.bairro || defaultBairro,
        liderancaId: row.liderancaId || defaultLiderancaId,
        liderancaNome: row.liderancaNome || (leader ? leader.nome : ''),
        zona: row.zona || defaultZona,
        secao: row.secao || defaultSecao
      }))
    );
    setToastMessage({
      text: 'Liderança e Bairro padrão aplicados a todas as linhas em branco!',
      type: 'success'
    });
  };

  const handleRemoveGridRow = (tempId: string) => {
    setGridRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const handleSaveAllGrid = async () => {
    const validRows = gridRows.filter(
      (r) => {
        const cleanC = r.cpf.replace(/\D/g, '');
        const hasValidCpf = !cleanC || cleanC.length === 11;
        return r.nome.trim() && r.tituloEleitor.trim() && hasValidCpf;
      }
    );

    if (validRows.length === 0) {
      setToastMessage({
        text: 'Nenhuma linha preenchida com Nome e Número do Título (e CPF com 11 dígitos, se informado).',
        type: 'warn'
      });
      return;
    }

    setIsSavingGrid(true);
    let savedCount = 0;
    const newlySaved: EleitorCadastradoSessao[] = [];

    for (const row of validRows) {
      try {
        const leader = liderancas.find((l) => l.id === row.liderancaId) || liderancas[0];
        const leaderName = leader ? leader.nome : 'Sem Liderança';
        const cleanC = row.cpf.replace(/\D/g, '');
        const formattedTit = formatTituloUtil(row.tituloEleitor.trim());

        const docRef = await addDoc(collection(targetDb, 'eleitores'), {
          nome: row.nome.trim(),
          cpf: cleanC ? row.cpf : '',
          tituloEleitor: formattedTit,
          telefone: row.telefone || '',
          bairro: (row.bairro || defaultBairro || '').trim(),
          cidade: (currentTenant?.cidade || '').trim(),
          estado: (currentTenant?.uf || 'SP').trim(),
          zona: row.zona || defaultZona || '001',
          secao: row.secao || defaultSecao || '0042',
          lideranca: leaderName,
          liderancaId: leader ? leader.id : '',
          status: 'Pendente de confirmação',
          dataCadastro: serverTimestamp()
        });

        newlySaved.push({
          id: docRef.id,
          nome: row.nome.trim(),
          cpf: cleanC ? row.cpf : '',
          tituloEleitor: formattedTit,
          telefone: row.telefone,
          bairro: (row.bairro || defaultBairro || '').trim(),
          lideranca: leaderName,
          liderancaId: leader ? leader.id : '',
          timestamp: new Date()
        });
        savedCount++;
      } catch (e) {
        console.error('Erro ao salvar linha:', e);
      }
    }

    setIsSavingGrid(false);
    playSuccessSound();

    setSessionCount((prev) => prev + savedCount);
    setRecentSavedList((prev) => [...newlySaved, ...prev]);

    // Remove the saved rows, leaving 5 fresh blank rows
    setGridRows([
      { tempId: 'fresh-1', nome: '', cpf: '', tituloEleitor: '', telefone: '', bairro: defaultBairro, liderancaId: defaultLiderancaId, liderancaNome: '', zona: defaultZona, secao: defaultSecao, status: 'idle' },
      { tempId: 'fresh-2', nome: '', cpf: '', tituloEleitor: '', telefone: '', bairro: defaultBairro, liderancaId: defaultLiderancaId, liderancaNome: '', zona: defaultZona, secao: defaultSecao, status: 'idle' },
      { tempId: 'fresh-3', nome: '', cpf: '', tituloEleitor: '', telefone: '', bairro: defaultBairro, liderancaId: defaultLiderancaId, liderancaNome: '', zona: defaultZona, secao: defaultSecao, status: 'idle' }
    ]);

    setToastMessage({
      text: `✓ Lote de ${savedCount} eleitores salvo com sucesso no banco!`,
      type: 'success'
    });
  };

  // ==================== DELETE FROM SESSION LOG COM SENHA MESTRE ====================
  const executeDeleteSessionItem = (id: string, voterName: string) => {
    setDeleteDialog(null);
    solicitarSenhaMestre({
      title: 'Excluir Eleitor da Sessão',
      description: `Para remover o cadastro recém-adicionado de "${voterName}", digite a Senha Mestre do sistema.`,
      onSuccess: async () => {
        try {
          await deleteDoc(doc(targetDb, 'eleitores', id));
          await registrarLog({
            tipo: 'EXCLUSAO',
            acao: `Exclusão de eleitor da sessão: ${voterName}`,
            detalhes: `Registro removido com confirmação de Senha Mestre. ID: ${id}`,
            entidade: 'Eleitor',
            entidadeId: id
          });
          setRecentSavedList((prev) => prev.filter((item) => item.id !== id));
          setSessionCount((prev) => Math.max(0, prev - 1));
          setToastMessage({ text: `Registro de "${voterName}" foi removido do banco.`, type: 'success' });
        } catch (err) {
          console.error('Erro ao excluir:', err);
          setToastMessage({ text: 'Falha ao remover o registro.', type: 'error' });
        }
      }
    });
  };

  // Export session to CSV
  const handleExportSessionCSV = () => {
    if (recentSavedList.length === 0) {
      setToastMessage({ text: 'Nenhum registro nesta sessão para exportar.', type: 'warn' });
      return;
    }
    const headers = 'Nome,CPF,TituloEleitor,Telefone,Bairro,Lideranca,Horario\n';
    const rows = recentSavedList
      .map(
        (e) =>
          `"${e.nome}","${e.cpf}","${e.tituloEleitor || ''}","${e.telefone}","${e.bairro}","${e.lideranca}","${e.timestamp.toLocaleTimeString()}"`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `eleitores_sessao_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto flex-1 h-full flex flex-col">
      {/* ==================== TOP HEADER & WORKSPACE STATS ==================== */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/60 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-xs">
              <Zap className="w-5 h-5 text-primary-fixed" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-on-surface tracking-tight">
                  Cadastro Rápido em Massa
                </h1>
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Alta Velocidade
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                Ambiente de digitação contínua para operadores: preencha dezenas de cadastros sem tocar no mouse.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Session Pill */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Mode Selector */}
          <div className="flex bg-surface-container-low border border-outline-variant/60 rounded-xl p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveMode('continuous')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMode === 'continuous'
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5 text-secondary" /> Digitação Contínua
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('grid')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMode === 'grid'
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5 text-secondary" /> Grade em Lote (Planilha)
            </button>
          </div>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
              soundEnabled
                ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                : 'bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-high'
            }`}
            title={soundEnabled ? 'Feedback sonoro ativado (clique para silenciar)' : 'Feedback sonoro desativado (clique para ativar)'}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-4 h-4 text-primary animate-pulse" />
                <span>Som Ativo</span>
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4 text-on-surface-variant" />
                <span>Mudo</span>
              </>
            )}
          </button>

          {/* Botão de Link para Equipe de Campo */}
          <button
            type="button"
            onClick={() => setIsShareFieldModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl border border-emerald-500/50 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all cursor-pointer shadow-xs"
            title="Gerar link externo para equipe de rua/campo cadastrar sem login"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Link Equipe de Campo</span>
          </button>

          {/* Return to General List Link */}
          <Link
            href="/eleitores"
            prefetch={true}
            className="px-3 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface border border-outline-variant/60 rounded-xl hover:bg-surface-container transition-colors"
          >
            Ver Lista Geral
          </Link>
        </div>
      </div>

      {/* ==================== TOAST FEEDBACK BANNER ==================== */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold animate-fadeIn ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : toastMessage.type === 'warn'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-error-container border-error/40 text-on-error-container'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {toastMessage.type === 'warn' && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
            {toastMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-error shrink-0" />}
            <span>{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-on-surface-variant hover:text-on-surface cursor-pointer p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ==================== STICKY CONTEXT BAR (LOCKABLE VALUES) ==================== */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          isContextLocked
            ? 'bg-primary/5 border-primary/25 shadow-xs'
            : 'bg-surface-container-lowest border-outline-variant/60'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !isContextLocked;
                setIsContextLocked(next);
                if (next) {
                  if (defaultLiderancaId) setLiderancaId(defaultLiderancaId);
                  if (defaultBairro) setBairro(defaultBairro);
                  if (defaultZona) setZona(defaultZona);
                  if (defaultSecao) setSecao(defaultSecao);
                }
              }}
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isContextLocked
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {isContextLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              {isContextLocked ? 'Valores Padrão Fixados' : 'Valores Livres'}
            </button>
            <span className="text-xs text-on-surface-variant">
              {isContextLocked
                ? 'Liderança e Bairro serão mantidos automaticamente a cada novo cadastro.'
                : 'Defina os padrões para acelerar o preenchimento de lotes da mesma região.'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
            <Keyboard className="w-3.5 h-3.5 text-secondary" />
            <span>
              Atalho de envio: <kbd className="px-1.5 py-0.5 bg-surface-container rounded font-mono text-[10px] font-bold">Ctrl + Enter</kbd>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Liderança Padrão */}
          <div>
            <label className="block text-[11px] uppercase font-bold text-on-surface-variant mb-1">
              Liderança / Articulador Padrão
            </label>
            <select
              value={defaultLiderancaId}
              onChange={(e) => {
                setDefaultLiderancaId(e.target.value);
                if (isContextLocked) setLiderancaId(e.target.value);
              }}
              className="w-full h-9 bg-surface-container-lowest border border-outline-variant/60 rounded-lg px-3 text-xs text-on-surface focus:outline-none focus:border-secondary font-medium"
            >
              <option value="">Selecione a liderança...</option>
              {liderancas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} ({l.tipo === 'Sub-liderança' ? `Sub de ${l.liderancaPaiNome || 'Coordenação'}` : 'Principal'})
                </option>
              ))}
            </select>
          </div>

          {/* Bairro Padrão */}
          <div>
            <label className="block text-[11px] uppercase font-bold text-on-surface-variant mb-1">
              Bairro Padrão
            </label>
            <BairroSelector
              value={defaultBairro}
              onChange={(val) => {
                setDefaultBairro(val);
                if (isContextLocked) setBairro(val);
              }}
              bairrosList={registeredBairros}
              placeholder="Bairro padrão..."
              size="sm"
              className="bg-surface-container-lowest border-outline-variant/60 focus:border-secondary"
            />
          </div>

          {/* Zona Padrão */}
          <div>
            <label className="block text-[11px] uppercase font-bold text-on-surface-variant mb-1">
              Zona Eleitoral Padrão
            </label>
            <input
              type="text"
              value={defaultZona}
              onChange={(e) => {
                setDefaultZona(e.target.value);
                if (isContextLocked) setZona(e.target.value);
              }}
              className="w-full h-9 bg-surface-container-lowest border border-outline-variant/60 rounded-lg px-3 text-xs text-on-surface font-mono focus:outline-none focus:border-secondary"
            />
          </div>

          {/* Seção Padrão */}
          <div>
            <label className="block text-[11px] uppercase font-bold text-on-surface-variant mb-1">
              Seção Padrão
            </label>
            <input
              type="text"
              value={defaultSecao}
              onChange={(e) => {
                setDefaultSecao(e.target.value);
                if (isContextLocked) setSecao(e.target.value);
              }}
              className="w-full h-9 bg-surface-container-lowest border border-outline-variant/60 rounded-lg px-3 text-xs text-on-surface font-mono focus:outline-none focus:border-secondary"
            />
          </div>
        </div>
      </div>

      {/* ==================== MAIN WORKSPACE AREA ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
        {/* LEFT COLUMN: Input Mode (Continuous or Grid) */}
        <div className="lg:col-span-8 space-y-6">
          {activeMode === 'continuous' ? (
            /* ==================== MODO DIGITAÇÃO CONTÍNUA ==================== */
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-xs overflow-hidden">
              <div className="px-6 py-4 bg-surface border-b border-outline-variant/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-secondary" />
                  <h2 className="text-sm font-bold text-on-surface">Formulário de Entrada Rápida</h2>
                </div>
                <span className="text-[11px] text-on-surface-variant font-medium">
                  Pressione <kbd className="px-1.5 py-0.5 bg-surface-container rounded font-mono text-[10px] font-bold">Tab</kbd> para avançar e <kbd className="px-1.5 py-0.5 bg-surface-container rounded font-mono text-[10px] font-bold">Ctrl+Enter</kbd> para salvar
                </span>
              </div>

              <form onSubmit={handleSaveContinuous} onKeyDown={handleKeyDown} className="p-6 space-y-5">
                {/* Real-time duplicate warning alert: CPF */}
                {duplicateWarning && (
                  <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-start gap-2.5 animate-fadeIn">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Atenção: CPF já cadastrado no sistema!</p>
                      <p className="text-[11px] text-rose-800 mt-0.5">
                        Este CPF pertence a <strong>{duplicateWarning.nome}</strong> (vinculado a{' '}
                        <strong>{duplicateWarning.lideranca}</strong>). Se você prosseguir, o registro entrará na fila de
                        auditoria de conflitos de CPF.
                      </p>
                    </div>
                  </div>
                )}

                {/* Real-time duplicate warning alert: Título */}
                {tituloDuplicateWarning && (
                  <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-2.5 animate-fadeIn">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Atenção: Título de Eleitor já cadastrado no sistema!</p>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        O Título <strong>{tituloDuplicateWarning.titulo}</strong> pertence a <strong>{tituloDuplicateWarning.nome}</strong> (vinculado a{' '}
                        <strong>{tituloDuplicateWarning.lideranca}</strong>). Se você prosseguir, o registro entrará na fila de
                        auditoria de duplicidades de Título.
                      </p>
                    </div>
                  </div>
                )}

                {/* 1. Nome Completo */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-on-surface">
                      Nome Completo do Eleitor <span className="text-error">*</span>
                    </label>
                    <span className="text-[11px] text-on-surface-variant font-mono">Foco Inicial Automático</span>
                  </div>
                  <input
                    ref={nomeInputRef}
                    type="text"
                    required
                    placeholder="Ex: João Carlos da Silva"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full h-11 bg-surface-container-lowest border-2 border-outline-variant/70 rounded-xl px-3.5 text-sm font-semibold text-on-surface focus:outline-none focus:border-secondary transition-colors"
                  />
                </div>

                {/* 2. CPF e WhatsApp */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface mb-1.5">
                      CPF Oficial <span className="text-[11px] text-on-surface-variant font-normal">(Opcional)</span>
                    </label>
                    <input
                      ref={cpfInputRef}
                      type="text"
                      placeholder="000.000.000-00 (opcional)"
                      value={cpf}
                      onChange={handleCpfChange}
                      className={`w-full h-11 bg-surface-container-lowest border-2 rounded-xl px-3.5 text-sm font-mono font-medium focus:outline-none transition-colors ${
                        duplicateWarning
                           ? 'border-amber-400 bg-amber-50/50 text-amber-900 focus:border-amber-500'
                          : 'border-outline-variant/70 text-on-surface focus:border-secondary'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface mb-1.5">
                      WhatsApp / Telefone Celular
                    </label>
                    <input
                      ref={telefoneInputRef}
                      type="text"
                      placeholder="(00) 00000-0000"
                      value={telefone}
                      onChange={(e) => setTelefone(formatPhone(e.target.value))}
                      className="w-full h-11 bg-surface-container-lowest border-2 border-outline-variant/70 rounded-xl px-3.5 text-sm font-mono font-medium text-on-surface focus:outline-none focus:border-secondary transition-colors"
                    />
                  </div>
                </div>

                {/* 3. Número do Título de Eleitor (Obrigatório) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-on-surface">
                      Número do Título de Eleitor <span className="text-error">*</span>
                    </label>
                    <span className="text-[11px] text-error font-medium">Obrigatório</span>
                  </div>
                  <input
                    ref={tituloInputRef}
                    type="text"
                    required
                    placeholder="0000.0000.0000"
                    value={tituloEleitor}
                    onChange={handleTituloChange}
                    className={`w-full h-11 bg-surface-container-lowest border-2 rounded-xl px-3.5 text-sm font-mono font-semibold focus:outline-none transition-colors ${
                      tituloDuplicateWarning
                        ? 'border-amber-400 bg-amber-50/50 text-amber-900 focus:border-amber-500'
                        : 'border-outline-variant/70 text-on-surface focus:border-secondary'
                    }`}
                  />
                </div>

                {/* Estado e Cidade do Eleitor */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-on-surface mb-1.5">
                      Estado (UF)
                    </label>
                    <select
                      value={estado}
                      onChange={(e) => setEstado(e.target.value)}
                      className="w-full h-11 bg-surface-container-lowest border-2 border-outline-variant/70 rounded-xl px-3 text-xs text-on-surface focus:outline-none focus:border-secondary font-medium cursor-pointer"
                    >
                      <option value="">UF...</option>
                      {ESTADOS_BRASIL.map((est) => (
                        <option key={est.uf} value={est.uf}>
                          {est.uf} - {est.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-on-surface mb-1.5">
                      Cidade / Município
                    </label>
                    <input
                      type="text"
                      placeholder="Cidade do eleitor..."
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      className="w-full h-11 bg-surface-container-lowest border-2 border-outline-variant/70 rounded-xl px-3.5 text-xs text-on-surface focus:outline-none focus:border-secondary"
                    />
                  </div>
                </div>

                {/* 4. Bairro & Liderança */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface mb-1.5">
                      Bairro de Residência
                    </label>
                    <BairroSelector
                      value={bairro}
                      onChange={setBairro}
                      bairrosList={registeredBairros}
                      placeholder="Selecione ou digite o bairro..."
                      size="lg"
                      className="bg-surface-container-lowest border-2 border-outline-variant/70 rounded-xl focus:border-secondary font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface mb-1.5">
                      Liderança Responsável
                    </label>
                    <select
                      value={liderancaId}
                      onChange={(e) => setLiderancaId(e.target.value)}
                      className="w-full h-11 bg-surface-container-lowest border-2 border-outline-variant/70 rounded-xl px-3 text-xs text-on-surface focus:outline-none focus:border-secondary font-medium cursor-pointer"
                    >
                      {liderancas.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nome} ({l.tipo === 'Sub-liderança' ? `Sub de ${l.liderancaPaiNome || 'Coordenação'}` : 'Principal'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 4. Zona e Seção (Compactos) */}
                <div className="grid grid-cols-2 gap-4 pt-1 border-t border-outline-variant/30">
                  <div>
                    <label className="block text-[11px] text-on-surface-variant font-medium mb-1">
                      Zona Eleitoral
                    </label>
                    <input
                      type="text"
                      value={zona}
                      onChange={(e) => setZona(e.target.value)}
                      className="w-full h-8 bg-surface-container-low border border-outline-variant/50 rounded-lg px-2.5 text-xs font-mono text-on-surface focus:outline-none focus:border-secondary"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-on-surface-variant font-medium mb-1">
                      Seção Eleitoral
                    </label>
                    <input
                      type="text"
                      value={secao}
                      onChange={(e) => setSecao(e.target.value)}
                      className="w-full h-8 bg-surface-container-low border border-outline-variant/50 rounded-lg px-2.5 text-xs font-mono text-on-surface focus:outline-none focus:border-secondary"
                    />
                  </div>
                </div>

                {/* Submit Actions Button */}
                <div className="pt-3 flex items-center gap-3">
                  <button
                    type="submit"
                    id="btn-save-continuous"
                    disabled={isSubmitting}
                    className="flex-1 py-3.5 px-5 bg-primary text-on-primary hover:bg-secondary rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <RotateCcw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 text-primary-fixed" />
                    )}
                    <span>Salvar e Cadastrar Próximo</span>
                    <span className="text-[11px] opacity-75 font-normal ml-1 font-mono">(Ctrl + Enter)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNome('');
                      setCpf('');
                      setTituloEleitor('');
                      setTelefone('');
                      setDuplicateWarning(null);
                      nomeInputRef.current?.focus();
                    }}
                    className="px-4 py-3.5 border border-outline-variant/70 text-on-surface-variant hover:text-on-surface rounded-xl text-xs font-semibold hover:bg-surface-container transition-colors cursor-pointer"
                    title="Limpar campos atuais (Esc)"
                  >
                    Limpar
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* ==================== MODO GRADE / PLANILHA EM LOTE ==================== */
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-xs overflow-hidden flex flex-col">
              <div className="px-6 py-4 bg-surface border-b border-outline-variant/40 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-on-surface">Grade de Digitação em Lote</h2>
                  <p className="text-xs text-on-surface-variant">
                    Preencha várias linhas em sequência estilo planilha e salve todas de uma só vez.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApplyContextToGrid}
                    className="px-3 py-1.5 bg-surface-container text-on-surface hover:bg-surface-container-high rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Preencher Vazios com Padrão
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddGridRows(5)}
                    className="px-3 py-1.5 bg-surface-container text-on-surface hover:bg-surface-container-high rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> +5 Linhas
                  </button>
                </div>
              </div>

              {/* Editable Table */}
              <div className="overflow-x-auto custom-scrollbar p-2">
                <table className="w-full text-left text-xs border-collapse min-w-[850px]">
                  <thead>
                    <tr className="bg-surface-container-low text-on-surface-variant uppercase font-semibold border-b border-outline-variant/50">
                      <th className="py-2.5 px-3 w-8">#</th>
                      <th className="py-2.5 px-3">Nome Completo *</th>
                      <th className="py-2.5 px-3 w-36">CPF (Opcional)</th>
                      <th className="py-2.5 px-3 w-36">Título de Eleitor *</th>
                      <th className="py-2.5 px-3 w-36">Telefone</th>
                      <th className="py-2.5 px-3 w-36">Bairro</th>
                      <th className="py-2.5 px-3 w-48">Liderança</th>
                      <th className="py-2.5 px-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {gridRows.map((row, index) => {
                      const cleanC = row.cpf.replace(/\D/g, '');
                      const isRowValid =
                        row.nome.trim() &&
                        row.tituloEleitor.trim() &&
                        (!cleanC || cleanC.length === 11);

                      return (
                        <tr
                          key={row.tempId}
                          className={`hover:bg-surface-container-low/50 transition-colors ${
                            isRowValid ? 'bg-emerald-50/20' : ''
                          }`}
                        >
                          <td className="py-2 px-3 font-mono text-[11px] text-on-surface-variant font-bold">
                            {index + 1}
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              placeholder="Nome do eleitor"
                              value={row.nome}
                              onChange={(e) => handleGridCellChange(row.tempId, 'nome', e.target.value)}
                              className="w-full h-8 px-2.5 bg-surface-container-lowest border border-outline-variant/60 rounded text-xs font-medium focus:outline-none focus:border-secondary"
                            />
                          </td>
                          <td className="py-2 px-2">
                            {(() => {
                              const cleanC = row.cpf.replace(/\D/g, '');
                              const isDup = cleanC.length === 11 && existingCpfs.has(cleanC);
                              return (
                                <input
                                  type="text"
                                  placeholder="000.000.000-00 (opcional)"
                                  value={row.cpf}
                                  onChange={(e) => handleGridCellChange(row.tempId, 'cpf', e.target.value)}
                                  title={isDup ? `Atenção: CPF já cadastrado para ${existingCpfs.get(cleanC)?.nome}` : ''}
                                  className={`w-full h-8 px-2.5 rounded text-xs font-mono focus:outline-none ${
                                    isDup
                                      ? 'border-2 border-rose-400 bg-rose-50 text-rose-950 font-bold'
                                      : 'border border-outline-variant/60 bg-surface-container-lowest focus:border-secondary'
                                  }`}
                                />
                              );
                            })()}
                          </td>
                          <td className="py-2 px-2">
                            {(() => {
                              const cleanT = row.tituloEleitor.replace(/\D/g, '');
                              const isDup = cleanT.length >= 5 && existingTitulos.has(cleanT);
                              return (
                                <input
                                  type="text"
                                  placeholder="0000.0000.0000"
                                  value={row.tituloEleitor}
                                  onChange={(e) => handleGridCellChange(row.tempId, 'tituloEleitor', e.target.value)}
                                  title={isDup ? `Atenção: Título já cadastrado para ${existingTitulos.get(cleanT)?.nome}` : ''}
                                  className={`w-full h-8 px-2.5 rounded text-xs font-mono focus:outline-none ${
                                    isDup
                                      ? 'border-2 border-amber-400 bg-amber-50 text-amber-950 font-bold'
                                      : 'border border-outline-variant/60 bg-surface-container-lowest focus:border-secondary'
                                  }`}
                                />
                              );
                            })()}
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              placeholder="(00) 00000-0000"
                              value={row.telefone}
                              onChange={(e) => handleGridCellChange(row.tempId, 'telefone', e.target.value)}
                              className="w-full h-8 px-2.5 bg-surface-container-lowest border border-outline-variant/60 rounded text-xs font-mono focus:outline-none focus:border-secondary"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              placeholder="Bairro"
                              value={row.bairro}
                              onChange={(e) => handleGridCellChange(row.tempId, 'bairro', e.target.value)}
                              list="bairros-cadastrados-grid"
                              className="w-full h-8 px-2.5 bg-surface-container-lowest border border-outline-variant/60 rounded text-xs focus:outline-none focus:border-secondary"
                            />
                            <datalist id="bairros-cadastrados-grid">
                              {registeredBairros.map((b) => (
                                <option key={b} value={b} />
                              ))}
                            </datalist>
                          </td>
                          <td className="py-2 px-2">
                            <select
                              value={row.liderancaId}
                              onChange={(e) => handleGridCellChange(row.tempId, 'liderancaId', e.target.value)}
                              className="w-full h-8 px-2 bg-surface-container-lowest border border-outline-variant/60 rounded text-xs focus:outline-none focus:border-secondary"
                            >
                              <option value="">Selecione...</option>
                              {liderancas.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.nome}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveGridRow(row.tempId)}
                              className="p-1 text-on-surface-variant hover:text-error rounded cursor-pointer"
                              title="Remover linha"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Grid Footer Actions */}
              <div className="p-4 bg-surface border-t border-outline-variant/40 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    <strong>
                      {
                        gridRows.filter(
                          (r) =>
                            r.nome.trim() &&
                            r.cpf.replace(/\D/g, '').length === 11 &&
                            r.tituloEleitor.trim()
                        ).length
                      }
                    </strong>{' '}
                    de {gridRows.length} linhas prontas para salvar.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddGridRows(5)}
                    className="px-3.5 py-2 border border-outline-variant/60 text-xs font-semibold rounded-lg hover:bg-surface-container transition-colors cursor-pointer"
                  >
                    + Mais 5 Linhas
                  </button>

                  <button
                    type="button"
                    disabled={isSavingGrid}
                    onClick={handleSaveAllGrid}
                    className="px-5 py-2 bg-primary text-on-primary hover:bg-secondary rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSavingGrid ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Salvar Todos os Registros Preenchidos</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Session History & Feed */}
        <div className="lg:col-span-4 space-y-4">
          {/* Session Metrics Card */}
          <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/60 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase font-bold text-on-surface-variant">
                  Produção Nesta Sessão
                </p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-black text-primary font-mono">{sessionCount}</span>
                  <span className="text-xs text-on-surface-variant font-medium">eleitores cadastrados</span>
                </div>
              </div>

              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
            </div>

            {/* Session Time & Velocity */}
            <div className="pt-3 border-t border-outline-variant/30 flex items-center justify-between text-xs text-on-surface-variant">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-secondary" />
                Iniciado às {sessionStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {sessionCount > 0 && (
                <button
                  type="button"
                  onClick={handleExportSessionCSV}
                  className="text-secondary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Baixar CSV
                </button>
              )}
            </div>
          </div>

          {/* Recent Registrations Feed */}
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-xs overflow-hidden flex flex-col">
            <div className="p-4 bg-surface border-b border-outline-variant/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-secondary" />
                <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                  Histórico Recente da Sessão
                </h3>
              </div>
              <span className="text-[11px] text-on-surface-variant font-mono">
                {recentSavedList.length} itens
              </span>
            </div>

            <div className="p-3 divide-y divide-outline-variant/30 max-h-[480px] overflow-y-auto custom-scrollbar">
              {recentSavedList.length === 0 ? (
                <div className="py-8 text-center px-4 space-y-2">
                  <Zap className="w-8 h-8 text-outline-variant mx-auto" />
                  <p className="text-xs font-semibold text-on-surface">Nenhum eleitor nesta sessão ainda</p>
                  <p className="text-[11px] text-on-surface-variant">
                    Preencha os campos ao lado e pressione <kbd className="px-1 py-0.5 bg-surface-container rounded font-mono text-[9px]">Enter</kbd> para cadastrar rapidamente.
                  </p>
                </div>
              ) : (
                recentSavedList.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`py-2.5 px-2 flex items-center justify-between gap-2 group transition-colors rounded-lg ${
                      idx === 0 ? 'bg-emerald-50/50' : 'hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-on-surface truncate">
                          {item.nome}
                        </span>
                        {idx === 0 && (
                          <span className="text-[9px] bg-emerald-200 text-emerald-800 px-1.5 py-0.2 rounded font-bold uppercase">
                            Último
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-on-surface-variant font-mono">
                        CPF: {item.cpf} {item.tituloEleitor ? `• Título: ${item.tituloEleitor}` : ''} • {item.bairro}
                      </p>
                      <p className="text-[10px] text-secondary font-medium truncate">
                        {item.lideranca}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDeleteDialog({ id: item.id, nome: item.nome })}
                      className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"
                      title="Desfazer/Excluir registro recém-criado"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== DELETE CONFIRM DIALOG (IFRAME SAFE) ==================== */}
      {deleteDialog && (
        <div className="fixed inset-0 bg-primary/70 backdrop-blur-xs z-70 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-error-container text-error shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-on-surface">Desfazer Cadastro</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Deseja remover o cadastro recém-criado de <strong>&ldquo;{deleteDialog.nome}&rdquo;</strong> da base de dados?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/30">
              <button
                type="button"
                onClick={() => setDeleteDialog(null)}
                className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => executeDeleteSessionItem(deleteDialog.id, deleteDialog.nome)}
                className="px-4 py-2 bg-error text-on-error hover:bg-error/90 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                Sim, Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Compartilhamento para Equipe de Campo */}
      <ShareFieldLinkModal
        isOpen={isShareFieldModalOpen}
        onClose={() => setIsShareFieldModalOpen(false)}
        defaultLiderId={defaultLiderancaId}
      />
    </div>
  );
}
