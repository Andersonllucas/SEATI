'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Users,
  Award,
  UserPlus,
  Save,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  VolumeX,
  Share2,
  Copy,
  Check,
  RotateCcw,
  QrCode,
  MessageCircle,
  Lock,
  Unlock,
  Clock,
  Eye,
  EyeOff,
  KeyRound
} from 'lucide-react';
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  getDocs,
  getDoc,
  doc,
  query,
  limit
} from 'firebase/firestore';
import { getActiveDb } from '@/lib/firebase';
import { useTenant } from '@/context/TenantContext';
import { formatTituloUtil } from '@/context/CampaignContext';
import { ESTADOS_BRASIL } from '@/lib/locaisCatalog';
import { BairroSelector } from '@/components/BairroSelector';
import { QRCodeSVG } from 'qrcode.react';

interface LiderancaItem {
  id: string;
  nome: string;
  tipo?: string;
  liderancaPaiNome?: string;
  liderancaPaiId?: string;
  bairro?: string;
  regiao?: string;
}

interface EleitorSessaoItem {
  id: string;
  nome: string;
  bairro?: string;
  lideranca?: string;
  timestamp: Date;
}

export default function CadastroExternoCampoPage() {
  const { currentTenant, subdomain } = useTenant();

  // Tab Ativa: 'eleitor' (público sem senha) | 'lideranca' (exige senha cadastrada no sistema)
  const [activeMainTab, setActiveMainTab] = useState<'eleitor' | 'lideranca'>('eleitor');

  // Senha de autorização configurada no sistema (sincronizada do Firestore)
  const [configuredPassword, setConfiguredPassword] = useState<string>('123456');

  // URL Query Parameters para pré-configuração de liderança e bairro
  const [urlLiderId, setUrlLiderId] = useState<string>('');
  const [urlBairro, setUrlBairro] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const lid = params.get('lider') || params.get('lideranca') || '';
      const b = params.get('bairro') || '';
      const tab = params.get('tab');
      if (lid) setUrlLiderId(lid);
      if (b) setUrlBairro(b);
      if (tab === 'lideranca' || tab === 'lider') setActiveMainTab('lideranca');
    }
  }, []);

  // Lista de lideranças da campanha
  const [liderancas, setLiderancas] = useState<LiderancaItem[]>([]);
  const [registeredBairros, setRegisteredBairros] = useState<string[]>([]);
  const [isLoadingLiderancas, setIsLoadingLiderancas] = useState(true);

  // Sincroniza lideranças, bairros e senha configurada em tempo real
  useEffect(() => {
    try {
      const db = getActiveDb();

      // 1. Sincroniza senha de liderança em campo
      const unsubConfig = onSnapshot(doc(db, 'configuracoes', 'geral'), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.senhaCadastroLiderancaCampo) {
            setConfiguredPassword(String(data.senhaCadastroLiderancaCampo).trim());
          }
        }
      }, (err) => {
        console.warn('Aviso ao sincronizar config de segurança:', err);
      });

      // 2. Sincroniza lista de lideranças
      const unsubLiderancas = onSnapshot(collection(db, 'liderancas'), (snapshot) => {
        const list: LiderancaItem[] = [];
        const bairrosSet = new Set<string>();

        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            nome: data.nome || 'Sem Nome',
            tipo: data.tipo || 'Liderança Principal',
            liderancaPaiNome: data.liderancaPaiNome || '',
            liderancaPaiId: data.liderancaPaiId || '',
            bairro: data.bairro || '',
            regiao: data.regiao || ''
          });
          if (data.bairro && data.bairro.trim()) {
            bairrosSet.add(data.bairro.trim());
          }
        });

        // Ordena lideranças alfabeticamente
        list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        setLiderancas(list);

        // Busca bairros cadastrados de eleitores recentes para enriquecer a lista
        getDocs(query(collection(db, 'eleitores'), limit(150))).then((elSnap) => {
          elSnap.forEach((docSnap) => {
            const eb = docSnap.data().bairro;
            if (eb && typeof eb === 'string' && eb.trim()) {
              bairrosSet.add(eb.trim());
            }
          });
          setRegisteredBairros(Array.from(bairrosSet).sort((a, b) => a.localeCompare(b, 'pt-BR')));
        }).catch(() => {
          setRegisteredBairros(Array.from(bairrosSet).sort((a, b) => a.localeCompare(b, 'pt-BR')));
        });

        setIsLoadingLiderancas(false);
      }, (err) => {
        console.warn('Erro ao sincronizar lideranças:', err);
        setIsLoadingLiderancas(false);
      });

      return () => {
        unsubConfig();
        unsubLiderancas();
      };
    } catch (e) {
      console.warn('Falha na inicialização do Firestore:', e);
      setIsLoadingLiderancas(false);
    }
  }, []);

  // Contexto do Agente de Campo (salvo no LocalStorage do celular/dispositivo)
  const [operadorNome, setOperadorNome] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('adti_campo_operador_nome') || '';
    }
    return '';
  });

  const [operadorTelefone, setOperadorTelefone] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('adti_campo_operador_telefone') || '';
    }
    return '';
  });

  const [isContextLocked, setIsContextLocked] = useState<boolean>(true);
  const [fixedLiderancaId, setFixedLiderancaId] = useState<string>('');
  const [fixedBairro, setFixedBairro] = useState<string>('');
  const fixedZona = '001';
  const fixedSecao = '0042';

  // Sincroniza com parâmetros de URL se existirem
  useEffect(() => {
    if (urlLiderId && liderancas.length > 0) {
      const match = liderancas.find((l) => l.id === urlLiderId || l.nome.toLowerCase() === urlLiderId.toLowerCase());
      if (match) {
        setFixedLiderancaId(match.id);
        setSelectedLiderId(match.id);
      }
    }
  }, [urlLiderId, liderancas]);

  useEffect(() => {
    if (urlBairro) {
      setFixedBairro(urlBairro);
      setBairro(urlBairro);
    }
  }, [urlBairro]);

  // Se não houver liderança pré-fixada, inicializa com a primeira disponível
  useEffect(() => {
    if (!fixedLiderancaId && liderancas.length > 0 && !urlLiderId) {
      setFixedLiderancaId(liderancas[0].id);
      setSelectedLiderId(liderancas[0].id);
    }
  }, [liderancas, fixedLiderancaId, urlLiderId]);

  // Formulário do Eleitor
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [tituloEleitor, setTituloEleitor] = useState('');
  const [telefone, setTelefone] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('PI');
  const [zona, setZona] = useState('');
  const [secao, setSecao] = useState('');
  const [selectedLiderId, setSelectedLiderId] = useState('');
  const [observacoes, setObservacoes] = useState('');

  // Formulário de Liderança / Sub-liderança
  const [tipoLideranca, setTipoLideranca] = useState<'Liderança Principal' | 'Sub-liderança'>('Liderança Principal');
  const [parentLiderId, setParentLiderId] = useState<string>('');
  const [nomeLider, setNomeLider] = useState('');
  const [telefoneLider, setTelefoneLider] = useState('');
  const [cpfLider, setCpfLider] = useState('');
  const [tituloLider, setTituloLider] = useState('');
  const [zonaLider, setZonaLider] = useState('');
  const [secaoLider, setSecaoLider] = useState('');
  const [bairroLider, setBairroLider] = useState('');
  const [cidadeLider, setCidadeLider] = useState('');
  const [estadoLider, setEstadoLider] = useState('PI');
  const [metaVotosLider, setMetaVotosLider] = useState('100');
  const [observacoesLider, setObservacoesLider] = useState('');
  const [senhaAutorizacao, setSenhaAutorizacao] = useState('');
  const [mostrarSenhaAutorizacao, setMostrarSenhaAutorizacao] = useState(false);
  const [isSubmittingLider, setIsSubmittingLider] = useState(false);

  // Controle de Bloqueio/Desbloqueio com Senha de Segurança para Lideranças
  const [isLiderancaUnlocked, setIsLiderancaUnlocked] = useState(false);
  const [senhaTentativa, setSenhaTentativa] = useState('');
  const [mostrarSenhaTentativa, setMostrarSenhaTentativa] = useState(false);
  const [isCheckingPassword, setIsCheckingPassword] = useState(false);
  const [senhaError, setSenhaError] = useState<string | null>(null);

  // Inicializa cidade e estado padrão da campanha
  useEffect(() => {
    const defaultCity = currentTenant?.cidade || 'Teresina';
    const defaultUf = currentTenant?.uf || 'PI';
    setCidade(defaultCity);
    setCidadeLider(defaultCity);
    setEstado(defaultUf);
    setEstadoLider(defaultUf);
  }, [currentTenant]);

  // Sessão local de cadastros realizados
  const [sessionVoters, setSessionVoters] = useState<EleitorSessaoItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'warn';
    message: string;
    actionButton?: { label: string; onClick: () => void };
  } | null>(null);

  // Audio Feedback Toggle
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('adti_campo_sound_enabled');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('adti_campo_sound_enabled', String(next));
    }
    if (next) {
      playSuccessSound(true);
    }
  };

  // Beep harmônico Web Audio API
  const playSuccessSound = useCallback((force = false) => {
    if (!soundEnabled && !force) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, now);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.12); // D6

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);
    } catch {}
  }, [soundEnabled]);

  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.setValueAtTime(200, now + 0.08);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }, [soundEnabled]);

  // Modal de compartilhamento / QR Code
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Máscaras e formatações
  const formatCPF = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  };

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  // Referência para focar no nome a cada submissão
  const nomeInputRef = useRef<HTMLInputElement>(null);
  const nomeLiderInputRef = useRef<HTMLInputElement>(null);
  const senhaInputRef = useRef<HTMLInputElement>(null);

  // Link público desta página
  const currentPublicUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    const baseUrl = `${origin}/cadastro-externo`;
    const params = new URLSearchParams();
    if (subdomain && subdomain !== 'demo') {
      params.set('subdomain', subdomain);
    }
    if (fixedLiderancaId) {
      params.set('lider', fixedLiderancaId);
    }
    if (fixedBairro) {
      params.set('bairro', fixedBairro);
    }
    const qStr = params.toString();
    return qStr ? `${baseUrl}?${qStr}` : baseUrl;
  }, [subdomain, fixedLiderancaId, fixedBairro]);

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(currentPublicUrl).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      });
    }
  };

  const handleShareWhatsApp = () => {
    const leaderName = liderancas.find((l) => l.id === fixedLiderancaId)?.nome;
    const msg = `Olá equipe! Acessem o link oficial de cadastro rápido de eleitores e lideranças em campo${
      leaderName ? ` (Liderança: ${leaderName})` : ''
    }:\n\n${currentPublicUrl}\n\nBom trabalho!`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  };

  // ==================== SUBMISSÃO DO ELEITOR (PÚBLICO, SEM SENHA) ====================
  const handleSubmitEleitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackBanner(null);

    const trimmedNome = nome.trim();
    const cleanCpfDigits = cpf.replace(/\D/g, '');
    const trimmedTitulo = tituloEleitor.trim();

    // Validação básica do nome
    if (!trimmedNome || trimmedNome.length < 3) {
      playAlertSound();
      setFeedbackBanner({
        type: 'error',
        message: 'Por favor, digite o Nome Completo do eleitor (mínimo de 3 letras).'
      });
      nomeInputRef.current?.focus();
      return;
    }

    // CPF é opcional: se digitado, valida 11 dígitos
    if (cleanCpfDigits && cleanCpfDigits.length !== 11) {
      playAlertSound();
      setFeedbackBanner({
        type: 'warn',
        message: 'O CPF digitado está incompleto. Digite os 11 números ou deixe o campo em branco.'
      });
      return;
    }

    // Título de eleitor é obrigatório
    if (!trimmedTitulo) {
      playAlertSound();
      setFeedbackBanner({
        type: 'warn',
        message: 'Por favor, informe o Número do Título de Eleitor oficial.'
      });
      return;
    }

    // Define a liderança ativa
    const activeLiderId = selectedLiderId || fixedLiderancaId;
    const activeLider = liderancas.find((l) => l.id === activeLiderId);
    const activeLiderNome = activeLider ? activeLider.nome : 'Equipe de Campo';

    // Formata o título em 3 blocos de 4 dígitos (0000.0000.0000)
    const formattedTitulo = formatTituloUtil(trimmedTitulo);

    setIsSubmitting(true);
    try {
      const db = getActiveDb();

      // Salva diretamente na coleção de eleitores
      const docRef = await addDoc(collection(db, 'eleitores'), {
        nome: trimmedNome,
        cpf: cleanCpfDigits ? formatCPF(cleanCpfDigits) : '',
        tituloEleitor: formattedTitulo,
        telefone: telefone.trim(),
        bairro: (bairro || fixedBairro || '').trim(),
        cidade: cidade.trim() || currentTenant?.cidade || 'Teresina',
        estado: estado.trim() || currentTenant?.uf || 'PI',
        zona: (zona || fixedZona || '001').trim(),
        secao: (secao || fixedSecao || '0042').trim(),
        lideranca: activeLiderNome,
        liderancaId: activeLiderId || '',
        status: 'Pendente',
        observacoes: observacoes.trim() ? `${observacoes.trim()} [Cadastrado em Campo por: ${operadorNome || 'Voluntário'}]` : `[Cadastrado em Campo por: ${operadorNome || 'Voluntário'}]`,
        origemCadastro: 'Campo / Equipe Externa',
        operadorCampoNome: operadorNome.trim() || 'Equipe de Campo',
        operadorCampoTelefone: operadorTelefone.trim() || '',
        dataCadastro: serverTimestamp()
      });

      // Feedback sonoro e visual
      playSuccessSound();
      setFeedbackBanner({
        type: 'success',
        message: `✓ "${trimmedNome}" cadastrado e sincronizado com sucesso!`
      });

      // Registra na sessão local
      setSessionVoters((prev) => [
        {
          id: docRef.id,
          nome: trimmedNome,
          bairro: (bairro || fixedBairro || '').trim(),
          lideranca: activeLiderNome,
          timestamp: new Date()
        },
        ...prev
      ]);

      // Limpa dados específicos do eleitor
      setNome('');
      setCpf('');
      setTituloEleitor('');
      setTelefone('');
      setObservacoes('');

      // Se o contexto não estiver travado, limpa bairro/zona/seção
      if (!isContextLocked) {
        setBairro('');
        setZona('');
        setSecao('');
      } else {
        if (fixedBairro) setBairro(fixedBairro);
        if (fixedLiderancaId) setSelectedLiderId(fixedLiderancaId);
      }

      // Devolve o foco imediatamente para o Nome do próximo eleitor
      setTimeout(() => {
        nomeInputRef.current?.focus();
      }, 50);
    } catch (err: any) {
      console.error('Erro ao gravar eleitor em campo:', err);
      playAlertSound();
      setFeedbackBanner({
        type: 'error',
        message: `Falha ao salvar no banco: ${err.message || 'Verifique a conexão com a internet.'}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==================== DESBLOQUEIO DE ACESSO COM SENHA OBRIGATÓRIA ====================
  const handleUnlockLideranca = async (e: React.FormEvent) => {
    e.preventDefault();
    setSenhaError(null);
    const cleanInput = senhaTentativa.trim();

    if (!cleanInput) {
      playAlertSound();
      setSenhaError('Por favor, digite a Senha de Autorização.');
      return;
    }

    setIsCheckingPassword(true);
    try {
      let expected = configuredPassword;
      try {
        const configSnap = await getDoc(doc(getActiveDb(), 'configuracoes', 'geral'));
        if (configSnap.exists()) {
          const cfgData = configSnap.data();
          if (cfgData.senhaCadastroLiderancaCampo) {
            expected = String(cfgData.senhaCadastroLiderancaCampo).trim();
            setConfiguredPassword(expected);
          }
        }
      } catch (err) {
        console.warn('Erro ao consultar senha de liderança:', err);
      }

      if (cleanInput === expected) {
        playSuccessSound();
        setIsLiderancaUnlocked(true);
        setSenhaAutorizacao(cleanInput);
        setFeedbackBanner({
          type: 'success',
          message: '✓ Acesso autorizado! Formulário de cadastro de liderança desbloqueado.'
        });
        setTimeout(() => setFeedbackBanner(null), 3500);
      } else {
        playAlertSound();
        setSenhaError('❌ Senha incorreta! Digite a senha definida pela coordenação em Configurações > Segurança.');
      }
    } finally {
      setIsCheckingPassword(false);
    }
  };

  // ==================== SUBMISSÃO DA LIDERANÇA (EXIGE SENHA OBRIGATÓRIA) ====================
  const handleSubmitLideranca = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackBanner(null);

    if (!isLiderancaUnlocked) {
      playAlertSound();
      setFeedbackBanner({
        type: 'error',
        message: '❌ É obrigatório desbloquear com a Senha de Autorização antes de cadastrar uma liderança.'
      });
      return;
    }

    const trimmedNomeLider = nomeLider.trim();
    if (!trimmedNomeLider || trimmedNomeLider.length < 3) {
      playAlertSound();
      setFeedbackBanner({
        type: 'error',
        message: 'Por favor, digite o Nome Completo da liderança (mínimo de 3 letras).'
      });
      nomeLiderInputRef.current?.focus();
      return;
    }

    const cleanCpf = cpfLider.replace(/\D/g, '');
    const cleanSenha = senhaAutorizacao.trim();

    // Senha de autorização é estritamente OBRIGATÓRIA para cadastrar liderança em campo
    if (!cleanSenha) {
      playAlertSound();
      setFeedbackBanner({
        type: 'error',
        message: '❌ A Senha de Autorização é obrigatória para cadastrar uma liderança política em campo.'
      });
      senhaInputRef.current?.focus();
      return;
    }

    let activeExpectedPassword = configuredPassword;
    try {
      const configSnap = await getDoc(doc(getActiveDb(), 'configuracoes', 'geral'));
      if (configSnap.exists()) {
        const cfgData = configSnap.data();
        if (cfgData.senhaCadastroLiderancaCampo) {
          activeExpectedPassword = String(cfgData.senhaCadastroLiderancaCampo).trim();
          setConfiguredPassword(activeExpectedPassword);
        }
      }
    } catch (cfgErr) {
      console.warn('Usando senha de cache:', cfgErr);
    }

    if (cleanSenha !== activeExpectedPassword) {
      playAlertSound();
      setFeedbackBanner({
        type: 'error',
        message: '❌ Senha de autorização incorreta! Solicite a senha correta à coordenação da campanha.'
      });
      senhaInputRef.current?.focus();
      return;
    }

    setIsSubmittingLider(true);

    try {
      const db = getActiveDb();

      // Prepara os dados da liderança
      const parentObj = liderancas.find((l) => l.id === parentLiderId);
      const parentName = tipoLideranca === 'Sub-liderança' ? (parentObj?.nome || '') : '';

      const docRef = await addDoc(collection(db, 'liderancas'), {
        nome: trimmedNomeLider,
        tipo: tipoLideranca,
        liderancaPaiId: tipoLideranca === 'Sub-liderança' ? parentLiderId : '',
        liderancaPaiNome: parentName,
        cpf: cleanCpf ? formatCPF(cleanCpf) : '',
        tituloEleitor: tituloLider.trim(),
        zona: zonaLider.trim(),
        secao: secaoLider.trim(),
        telefone: telefoneLider.trim(),
        bairro: (bairroLider || fixedBairro || '').trim(),
        cidade: cidadeLider.trim() || currentTenant?.cidade || 'Teresina',
        estado: estadoLider.trim() || currentTenant?.uf || 'PI',
        metaVotos: Number(metaVotosLider) || 0,
        observacoes: observacoesLider.trim()
          ? `${observacoesLider.trim()} [Cadastrada em Campo por: ${operadorNome || 'Articulador'}]`
          : `[Cadastrada em Campo por: ${operadorNome || 'Articulador'}]`,
        origemCadastro: 'Campo / Equipe Externa',
        cadastradoPor: operadorNome.trim() || 'Equipe de Campo',
        status: 'Ativo',
        dataCadastro: serverTimestamp()
      });

      // Sucesso!
      playSuccessSound();

      // Já seleciona esta nova liderança para o cadastro de eleitores
      setSelectedLiderId(docRef.id);
      setFixedLiderancaId(docRef.id);

      setFeedbackBanner({
        type: 'success',
        message: `✓ ${tipoLideranca} "${trimmedNomeLider}" cadastrada com sucesso! Já está disponível para vincular eleitores.`,
        actionButton: {
          label: 'Ir para Cadastro de Eleitores desta Liderança',
          onClick: () => {
            setActiveMainTab('eleitor');
            setTimeout(() => nomeInputRef.current?.focus(), 100);
          }
        }
      });

      // Limpa o formulário de liderança
      setNomeLider('');
      setTelefoneLider('');
      setCpfLider('');
      setTituloLider('');
      setZonaLider('');
      setSecaoLider('');
      setBairroLider('');
      setObservacoesLider('');
      setSenhaAutorizacao('');
      setMetaVotosLider('100');
    } catch (err: any) {
      console.error('Erro ao cadastrar liderança em campo:', err);
      playAlertSound();
      setFeedbackBanner({
        type: 'error',
        message: `Falha ao salvar liderança: ${err.message || 'Verifique a conexão.'}`
      });
    } finally {
      setIsSubmittingLider(false);
    }
  };

  const selectedLeaderData = useMemo(() => {
    return liderancas.find((l) => l.id === (selectedLiderId || fixedLiderancaId));
  }, [liderancas, selectedLiderId, fixedLiderancaId]);

  // Lista de Lideranças Principais para o dropdown de sub-liderança
  const principaisLiderancas = useMemo(() => {
    return liderancas.filter((l) => l.tipo !== 'Sub-liderança');
  }, [liderancas]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-secondary selection:text-white pb-16">
      {/* Barra de Topo Oficial da Campanha (Responsiva e Otimizada para Celular) */}
      <header className="bg-slate-950/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-30 px-4 py-3 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white shadow-md font-extrabold text-base shrink-0">
              SE
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white tracking-tight">
                  {currentTenant?.nome || 'Campanha Oficial 2026'}
                </span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Equipe de Campo
                </span>
                {selectedLeaderData && (
                  <span className="text-[10px] font-bold text-secondary bg-secondary/10 border border-secondary/30 px-2 py-0.5 rounded-full">
                    Liderança: {selectedLeaderData.nome}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Página pública de coleta rápida • Eleitores livres • Lideranças protegidas por senha
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão de Som */}
            <button
              type="button"
              onClick={toggleSound}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                soundEnabled
                  ? 'bg-secondary/20 text-secondary border-secondary/40 hover:bg-secondary/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
              title={soundEnabled ? 'Feedback Sonoro Ativo' : 'Feedback Sonoro Desativado'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden sm:inline text-[11px]">{soundEnabled ? 'Som Ativo' : 'Mudo'}</span>
            </button>

            {/* Botão de Compartilhar Link / QR Code */}
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="px-3 py-2 rounded-xl bg-primary hover:bg-secondary text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Compartilhar link desta página ou ver QR Code"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Compartilhar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo Central */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-5 space-y-5">
        {/* Banner de Feedback (Sucesso / Alerta) */}
        {feedbackBanner && (
          <div
            className={`p-4 rounded-2xl border text-sm font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${
              feedbackBanner.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
                : feedbackBanner.type === 'warn'
                ? 'bg-amber-950/80 border-amber-500/60 text-amber-200'
                : 'bg-rose-950/80 border-rose-500/60 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {feedbackBanner.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <span>{feedbackBanner.message}</span>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              {feedbackBanner.actionButton && (
                <button
                  type="button"
                  onClick={feedbackBanner.actionButton.onClick}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  {feedbackBanner.actionButton.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => setFeedbackBanner(null)}
                className="text-xs opacity-75 hover:opacity-100 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* SELETOR DE MODO: ELEITOR (LIVRE) vs LIDERANÇA (COM SENHA) */}
        <div className="bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 flex items-center gap-2 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveMainTab('eleitor')}
            className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeMainTab === 'eleitor'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Cadastrar Eleitor</span>
            <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-black/20 text-white/90">
              Livre
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('lideranca')}
            className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeMainTab === 'lideranca'
                ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Cadastrar Liderança</span>
            <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-black/20 text-white/90 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" /> Exige Senha
            </span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* ABA 1: CADASTRO RÁPIDO DO ELEITOR (PÚBLICO, SEM SENHA)   */}
        {/* ======================================================== */}
        {activeMainTab === 'eleitor' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* 1. BARRA DE CONTEXTO RÁPIDO DO AGENTE DE CAMPO */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-md backdrop-blur-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-secondary inline-block"></span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    1. Contexto da Ação de Campo
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsContextLocked((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isContextLocked
                        ? 'bg-secondary text-white shadow-xs'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                    title="Quando travado, a liderança e o bairro permanecem preenchidos a cada novo cadastro"
                  >
                    {isContextLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    <span>{isContextLocked ? 'Valores Fixados' : 'Valores Livres'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                {/* Identificação do Agente */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Seu Nome (Operador)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Lucas / Voluntário"
                    value={operadorNome}
                    onChange={(e) => {
                      setOperadorNome(e.target.value);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('adti_campo_operador_nome', e.target.value);
                      }
                    }}
                    className="w-full h-9 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-secondary"
                  />
                </div>

                {/* Telefone do Agente */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Seu WhatsApp / Telefone
                  </label>
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={operadorTelefone}
                    onChange={(e) => {
                      const formatted = formatPhone(e.target.value);
                      setOperadorTelefone(formatted);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('adti_campo_operador_telefone', formatted);
                      }
                    }}
                    className="w-full h-9 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-secondary"
                  />
                </div>

                {/* Liderança Responsável */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-300">
                      Liderança Vinculada <span className="text-slate-400 font-normal">(Opcional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveMainTab('lideranca')}
                      className="text-[10px] text-secondary hover:underline font-semibold"
                    >
                      + Nova
                    </button>
                  </div>
                  <select
                    value={selectedLiderId || fixedLiderancaId}
                    onChange={(e) => {
                      setSelectedLiderId(e.target.value);
                      if (isContextLocked) setFixedLiderancaId(e.target.value);
                    }}
                    disabled={isLoadingLiderancas}
                    className="w-full h-9 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white focus:outline-none focus:border-secondary cursor-pointer font-medium"
                  >
                    <option value="">Sem Liderança Definida (Opcional)</option>
                    {isLoadingLiderancas ? (
                      <option value="">Carregando lideranças...</option>
                    ) : (
                      liderancas.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nome} ({l.tipo === 'Sub-liderança' ? `Sub de ${l.liderancaPaiNome || 'Coordenação'}` : 'Principal'})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Bairro Padrão de Atuação Hoje */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Bairro de Atuação Hoje
                  </label>
                  <BairroSelector
                    value={bairro || fixedBairro}
                    onChange={(val) => {
                      setBairro(val);
                      if (isContextLocked) setFixedBairro(val);
                    }}
                    bairrosList={registeredBairros}
                    placeholder="Ex: Centro, Ilhotas..."
                    size="sm"
                    className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus:border-secondary"
                  />
                </div>
              </div>
            </div>

            {/* 2. FORMULÁRIO DE CADASTRO CONTÍNUO DO ELEITOR */}
            <form
              onSubmit={handleSubmitEleitor}
              className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                    2. Ficha Rápida do Eleitor
                  </h2>
                </div>
                <span className="text-xs text-slate-400">
                  * Campos com asterisco são obrigatórios
                </span>
              </div>

              {/* Nome Completo */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  Nome Completo do Eleitor <span className="text-rose-400">*</span>
                </label>
                <input
                  ref={nomeInputRef}
                  type="text"
                  required
                  placeholder="Digite o nome completo..."
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-secondary transition-all font-medium"
                />
              </div>

              {/* Título de Eleitor e CPF */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Título de Eleitor (3 blocos de 4 números com pontuação automática) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-200">
                      Título de Eleitor <span className="text-rose-400">*</span>
                    </label>
                    <span className="text-[10px] text-emerald-400 font-semibold">
                      3 grupos de 4 números
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="0000.0000.0000"
                    value={tituloEleitor}
                    onChange={(e) => setTituloEleitor(formatTituloUtil(e.target.value))}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-secondary transition-all"
                  />
                </div>

                {/* CPF Oficial (Opcional) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-200">
                      CPF <span className="text-slate-400 font-normal">(Opcional)</span>
                    </label>
                    <span className="text-[10px] text-slate-400">
                      11 dígitos se informado
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="000.000.000-00 (opcional)"
                    value={cpf}
                    onChange={(e) => setCpf(formatCPF(e.target.value))}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-secondary transition-all"
                  />
                </div>
              </div>

              {/* Telefone / WhatsApp e Bairro */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    WhatsApp / Telefone de Contato
                  </label>
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={telefone}
                    onChange={(e) => setTelefone(formatPhone(e.target.value))}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-secondary transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Bairro de Residência
                  </label>
                  <BairroSelector
                    value={bairro}
                    onChange={setBairro}
                    bairrosList={registeredBairros}
                    placeholder="Selecione ou digite o bairro..."
                    size="lg"
                    className="bg-slate-900 border-2 border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:border-secondary"
                  />
                </div>
              </div>

              {/* Estado e Cidade */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Estado (UF)
                  </label>
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-secondary cursor-pointer font-medium"
                  >
                    {ESTADOS_BRASIL.map((est) => (
                      <option key={est.uf} value={est.uf}>
                        {est.uf} - {est.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Cidade / Município
                  </label>
                  <input
                    type="text"
                    placeholder="Cidade do eleitor..."
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              {/* Zona e Seção */}
              <div className="grid grid-cols-2 gap-3.5 pt-1 border-t border-slate-700/40">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Zona Eleitoral
                  </label>
                  <input
                    type="text"
                    placeholder="001"
                    value={zona}
                    onChange={(e) => setZona(e.target.value)}
                    className="w-full h-9 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-secondary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Seção Eleitoral
                  </label>
                  <input
                    type="text"
                    placeholder="0042"
                    value={secao}
                    onChange={(e) => setSecao(e.target.value)}
                    className="w-full h-9 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              {/* Observações / Anotações de Campo (Opcional) */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  Observações de Campo <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Quer participar de reunião, pediu material, indicação de vizinho..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full h-9 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-secondary"
                />
              </div>

              {/* Botão de Salvar Eleitor */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] text-white rounded-xl text-base font-extrabold flex items-center justify-center gap-2.5 transition-all shadow-xl shadow-emerald-900/30 cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <RotateCcw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  <span>{isSubmitting ? 'Gravando no Banco...' : 'Cadastrar Eleitor no Banco'}</span>
                </button>
              </div>
            </form>

            {/* 3. HISTÓRICO DESTA SESSÃO DE CAMPO */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Cadastros Feitos por Você Hoje ({sessionVoters.length})
                  </h3>
                </div>
                {sessionVoters.length > 0 && (
                  <span className="text-[11px] text-emerald-400 font-bold">
                    ✓ Sincronizados com a nuvem
                  </span>
                )}
              </div>

              {sessionVoters.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-700 rounded-xl">
                  Nenhum eleitor cadastrado nesta sessão ainda. Preencha o formulário acima para registrar o primeiro!
                </div>
              ) : (
                <div className="divide-y divide-slate-700/60 max-h-56 overflow-y-auto custom-scrollbar">
                  {sessionVoters.map((item, idx) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between text-xs gap-3">
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {sessionVoters.length - idx}
                        </span>
                        <span className="font-semibold text-white truncate">{item.nome}</span>
                        {item.bairro && (
                          <span className="text-slate-400 text-[11px] truncate">
                            • {item.bairro}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 shrink-0 font-mono">
                        {item.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 2: CADASTRO DE LIDERANÇA / SUB-LIDERANÇA (COM SENHA) */}
        {/* ======================================================== */}
        {activeMainTab === 'lideranca' && !isLiderancaUnlocked && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl text-center max-w-lg mx-auto space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border-2 border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <Lock className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-lg font-black text-white">
                  Acesso Restrito: Cadastro de Liderança
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Para cadastrar uma nova liderança ou sub-liderança em campo, digite a <strong>Senha de Autorização</strong> definida pela coordenação em <em>Configurações &gt; Segurança</em>.
                </p>
              </div>

              {senhaError && (
                <div className="p-3 bg-rose-950/60 border border-rose-500/50 rounded-xl text-xs text-rose-200 font-semibold text-left flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{senhaError}</span>
                </div>
              )}

              <form onSubmit={handleUnlockLideranca} className="space-y-3.5">
                <div className="relative text-left">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Senha de Autorização de Campo <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarSenhaTentativa ? 'text' : 'password'}
                      value={senhaTentativa}
                      onChange={(e) => {
                        setSenhaTentativa(e.target.value);
                        setSenhaError(null);
                      }}
                      placeholder="Digite a senha configurada no sistema..."
                      autoFocus
                      required
                      className="w-full h-11 bg-slate-950 border-2 border-slate-700 focus:border-amber-400 rounded-xl pl-3.5 pr-11 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none transition-colors font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenhaTentativa(!mostrarSenhaTentativa)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                      title={mostrarSenhaTentativa ? 'Ocultar Senha' : 'Ver Senha'}
                    >
                      {mostrarSenhaTentativa ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCheckingPassword}
                  className="w-full py-3.5 px-5 bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 active:scale-[0.99] text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  <Unlock className="w-4 h-4" />
                  <span>{isCheckingPassword ? 'Verificando Senha...' : 'Desbloquear Cadastro de Liderança'}</span>
                </button>
              </form>

              <div className="pt-2 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setActiveMainTab('eleitor')}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  &larr; Voltar para Cadastro de Eleitores
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: FORMULÁRIO QUANDO DESBLOQUEADO COM SENHA */}
        {activeMainTab === 'lideranca' && isLiderancaUnlocked && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <form
              onSubmit={handleSubmitLideranca}
              className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4"
            >
              {/* Header do Card de Liderança */}
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-primary/20 text-primary-fixed rounded-xl">
                    <Award className="w-5 h-5 text-secondary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                        Cadastrar Liderança ou Sub-liderança
                      </h2>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <Unlock className="w-2.5 h-2.5" /> Acesso Autorizado
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Cadastre novos apoios políticos e sub-lideranças vinculadas diretamente de campo.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsLiderancaUnlocked(false);
                    setSenhaTentativa('');
                    setSenhaAutorizacao('');
                  }}
                  className="px-2.5 py-1 text-xs bg-slate-900 hover:bg-slate-950 text-slate-400 hover:text-rose-300 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Bloquear formulário e exigir senha novamente"
                >
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>Bloquear</span>
                </button>
              </div>

              {/* 1. Escolha do Tipo: Principal vs Sub */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-2">
                  Tipo de Liderança <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setTipoLideranca('Liderança Principal');
                      setParentLiderId('');
                    }}
                    className={`py-3 px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      tipoLideranca === 'Liderança Principal'
                        ? 'bg-secondary/20 border-secondary text-white shadow-xs'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Award className="w-4 h-4 text-secondary" />
                    <span>Liderança Principal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTipoLideranca('Sub-liderança');
                      if (!parentLiderId && principaisLiderancas.length > 0) {
                        setParentLiderId(principaisLiderancas[0].id);
                      }
                    }}
                    className={`py-3 px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      tipoLideranca === 'Sub-liderança'
                        ? 'bg-primary/30 border-primary text-white shadow-xs'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <UserPlus className="w-4 h-4 text-primary-fixed" />
                    <span>Sub-liderança</span>
                  </button>
                </div>
              </div>

              {/* Se for Sub-liderança, seleciona a Liderança Principal */}
              {tipoLideranca === 'Sub-liderança' && (
                <div className="p-3.5 bg-slate-900/90 rounded-xl border border-primary/40 space-y-1.5 animate-in fade-in duration-150">
                  <label className="block text-xs font-bold text-primary-fixed">
                    Vincular à Liderança Principal Responsável <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <select
                    value={parentLiderId}
                    onChange={(e) => setParentLiderId(e.target.value)}
                    className="w-full h-10 bg-slate-950 border border-primary/40 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-secondary font-medium cursor-pointer"
                  >
                    <option value="">Nenhuma ou selecione depois...</option>
                    {principaisLiderancas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome} {l.bairro ? `(${l.bairro})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400">
                    A sub-liderança responderá diretamente a esta liderança principal na hierarquia da campanha.
                  </p>
                </div>
              )}

              {/* Nome Completo da Liderança */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  Nome Completo da Liderança <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <input
                  ref={nomeLiderInputRef}
                  type="text"
                  placeholder="Nome completo do líder ou sub-líder (opcional)..."
                  value={nomeLider}
                  onChange={(e) => setNomeLider(e.target.value)}
                  className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-secondary transition-all font-medium"
                />
              </div>

              {/* Documentos & Dados Eleitorais da Liderança (CPF e Título) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    CPF <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="000.000.000-00 (opcional)"
                    value={cpfLider}
                    onChange={(e) => setCpfLider(formatCPF(e.target.value))}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-secondary transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Título de Eleitor <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="0000 0000 0000 (opcional)"
                    value={tituloLider}
                    onChange={(e) => setTituloLider(e.target.value)}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-secondary transition-all"
                  />
                </div>
              </div>

              {/* Zona e Seção da Liderança */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Zona Eleitoral <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 001 (opcional)"
                    value={zonaLider}
                    onChange={(e) => setZonaLider(e.target.value)}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-secondary transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Seção Eleitoral <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 0042 (opcional)"
                    value={secaoLider}
                    onChange={(e) => setSecaoLider(e.target.value)}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-secondary transition-all"
                  />
                </div>
              </div>

              {/* Telefone / WhatsApp */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  WhatsApp / Telefone de Contato <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="(00) 00000-0000 (opcional)"
                  value={telefoneLider}
                  onChange={(e) => setTelefoneLider(formatPhone(e.target.value))}
                  className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-secondary transition-all"
                />
              </div>

              {/* Bairro e Meta de Votos */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Bairro / Região de Atuação
                  </label>
                  <BairroSelector
                    value={bairroLider}
                    onChange={setBairroLider}
                    bairrosList={registeredBairros}
                    placeholder="Bairro de atuação da liderança..."
                    size="lg"
                    className="bg-slate-900 border-2 border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:border-secondary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Meta de Votos
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="100"
                    value={metaVotosLider}
                    onChange={(e) => setMetaVotosLider(e.target.value)}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              {/* Estado e Cidade */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Estado (UF)
                  </label>
                  <select
                    value={estadoLider}
                    onChange={(e) => setEstadoLider(e.target.value)}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-secondary cursor-pointer font-medium"
                  >
                    {ESTADOS_BRASIL.map((est) => (
                      <option key={est.uf} value={est.uf}>
                        {est.uf} - {est.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Cidade / Município
                  </label>
                  <input
                    type="text"
                    placeholder="Cidade..."
                    value={cidadeLider}
                    onChange={(e) => setCidadeLider(e.target.value)}
                    className="w-full h-11 bg-slate-900 border-2 border-slate-700 rounded-xl px-3.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  Observações / Histórico de Articulação <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Apoio forte na zona leste, lidera associação de moradores..."
                  value={observacoesLider}
                  onChange={(e) => setObservacoesLider(e.target.value)}
                  className="w-full h-9 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-secondary"
                />
              </div>

              {/* ======================================================== */}
              {/* CAMPO OBRIGATÓRIO: SENHA DE AUTORIZAÇÃO EM CAMPO        */}
              {/* ======================================================== */}
              <div className="pt-2 border-t border-slate-700/60">
                <div className="p-4 bg-amber-950/40 border-2 border-amber-500/50 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-amber-200 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-amber-400" />
                      Senha de Autorização de Campo <span className="text-rose-400 font-bold">* (Obrigatória)</span>
                    </label>
                    <span className="text-[10px] text-amber-300 font-semibold bg-amber-500/20 px-2 py-0.5 rounded-full">
                      Exigida pelo Sistema
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      ref={senhaInputRef}
                      type={mostrarSenhaAutorizacao ? 'text' : 'password'}
                      placeholder="Digite a senha de autorização obrigatória..."
                      required
                      value={senhaAutorizacao}
                      onChange={(e) => setSenhaAutorizacao(e.target.value)}
                      className="w-full h-11 bg-slate-950 border-2 border-amber-500/60 rounded-xl pl-3.5 pr-11 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-all font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenhaAutorizacao(!mostrarSenhaAutorizacao)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                      title={mostrarSenhaAutorizacao ? 'Ocultar Senha' : 'Ver Senha'}
                    >
                      {mostrarSenhaAutorizacao ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    Esta senha de segurança é definida pela coordenação em <strong>Configurações &gt; Segurança</strong>. O cadastro da liderança só será concluído mediante a senha válida.
                  </p>
                </div>
              </div>

              {/* Botão de Concluir Cadastro de Liderança */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingLider}
                  className="w-full py-4 px-6 bg-gradient-to-r from-primary to-secondary hover:brightness-110 active:scale-[0.99] text-white rounded-xl text-base font-extrabold flex items-center justify-center gap-2.5 transition-all shadow-xl shadow-primary/30 cursor-pointer disabled:opacity-60"
                >
                  {isSubmittingLider ? (
                    <RotateCcw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  <span>{isSubmittingLider ? 'Validando Senha e Salvando...' : `Concluir Cadastro da ${tipoLideranca}`}</span>
                </button>
              </div>
            </form>

            {/* Lista das Lideranças Atuais da Campanha para Consulta Rápida */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-secondary" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Lideranças já Cadastradas na Campanha ({liderancas.length})
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">
                  Total da base
                </span>
              </div>

              {liderancas.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs border border-dashed border-slate-700 rounded-xl">
                  Nenhuma liderança cadastrada ainda.
                </div>
              ) : (
                <div className="divide-y divide-slate-700/60 max-h-56 overflow-y-auto custom-scrollbar">
                  {liderancas.map((item) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between text-xs gap-3">
                      <div className="flex items-center gap-2 truncate">
                        <span className={`w-2 h-2 rounded-full ${item.tipo === 'Sub-liderança' ? 'bg-primary-fixed' : 'bg-secondary'}`} />
                        <span className="font-semibold text-white truncate">{item.nome}</span>
                        <span className="text-slate-400 text-[11px] truncate">
                          ({item.tipo === 'Sub-liderança' ? `Sub de ${item.liderancaPaiNome || 'Coordenação'}` : 'Principal'})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 shrink-0 font-medium">
                        {item.bairro || 'Sem bairro'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE COMPARTILHAMENTO / QR CODE */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl text-left space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-secondary" />
                <h3 className="text-base font-bold text-white">Link para Equipe de Campo</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Envie este link para voluntários, cabos eleitorais e lideranças cadastrarem eleitores na rua sem precisar de login. Para cadastrar novas lideranças, informe a senha configurada no sistema.
            </p>

            {/* Pré-visualização do QR Code */}
            <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl shadow-inner my-2">
              <QRCodeSVG
                value={currentPublicUrl}
                size={180}
                level="M"
                includeMargin={true}
              />
              <p className="text-[11px] text-slate-800 font-semibold mt-2 text-center">
                Aponte a câmera do celular para abrir
              </p>
            </div>

            {/* Input com Link e Botão de Copiar */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Endereço de Acesso Direto:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={currentPublicUrl}
                  className="w-full h-9 bg-slate-950 border border-slate-700 rounded-lg px-2.5 text-xs text-slate-200 font-mono select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-2 bg-secondary text-white rounded-lg text-xs font-bold hover:brightness-110 flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Enviar no WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
