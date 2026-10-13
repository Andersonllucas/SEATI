'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MessageCircle,
  X,
  Play,
  Pause,
  SkipForward,
  CheckCircle2,
  Clock,
  Sparkles,
  User,
  ShieldCheck,
  Send,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Users,
  Copy,
  Check,
  Settings2,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import { Eleitor, useCampaignData } from '@/context/CampaignContext';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';

export interface WhatsAppBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEleitores: Eleitor[];
  onBatchCompleted?: () => void;
}

interface TemplateMensagem {
  id: string;
  nome: string;
  texto: string;
}

const TEMPLATES_PADRAO: TemplateMensagem[] = [
  {
    id: 'confirmacao_voto',
    nome: 'Confirmação de Voto e Apoio',
    texto:
      'Olá, {primeiro_nome}! Tudo bem? Aqui é da equipe do {campanha}.\n\nNosso líder {lideranca} nos pediu para entrar em contato com você para saber como estão as coisas e confirmar seu apoio na eleição.\n\nPodemos contar com você e sua família no dia da votação? Se precisar de santinhos ou materiais, é só avisar por aqui!'
  },
  {
    id: 'entrega_materiais',
    nome: 'Entrega de Adesivos e Santinhos',
    texto:
      'Olá, {primeiro_nome}! Aqui é da campanha do {campanha}.\n\nEstamos organizando as entregas de adesivos e materiais de campanha aqui no bairro {bairro}. Gostaria de receber um adesivo de carro ou material para apoiar nosso líder {lideranca}?'
  },
  {
    id: 'atualizacao_dados',
    nome: 'Verificação de Dados e Apoio',
    texto:
      'Olá, {primeiro_nome}! Tudo bem? Aqui é da coordenação do {campanha}.\n\nEstamos atualizando nossa lista de apoiadores vinculados ao nosso líder {lideranca}. Seu apoio continua firme conosco para a eleição? Um abraço!'
  },
  {
    id: 'lembrete_final',
    nome: 'Lembrete da Votação',
    texto:
      'Olá, {primeiro_nome}! A votação está se aproximando!\n\nO candidato {campanha} e o líder {lideranca} contam com o seu voto e sua confiança. Vamos juntos rumo à vitória! Qualquer dúvida sobre o seu local de votação, responda a esta mensagem.'
  }
];

function playSuccessChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12); // G5
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {}
}

function cleanPhone(val?: string): string {
  if (!val) return '';
  return val.replace(/\D/g, '');
}

function formatPhone(val?: string): string {
  if (!val) return '-';
  const digits = cleanPhone(val).slice(0, 11);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return val;
}

export default function WhatsAppBatchModal({
  isOpen,
  onClose,
  selectedEleitores,
  onBatchCompleted
}: WhatsAppBatchModalProps) {
  const { registrarValidacao } = useCampaignData();
  const { currentUser } = useAuth();
  const { currentTenant } = useTenant();

  // Etapa atual: 'config' (parametrização) | 'queue' (fila guiada) | 'finished' (concluído)
  const [step, setStep] = useState<'config' | 'queue' | 'finished'>('config');

  // Templates
  const [templates, setTemplates] = useState<TemplateMensagem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('seati_whatsapp_templates');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return TEMPLATES_PADRAO;
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('confirmacao_voto');
  const [mensagemText, setMensagemText] = useState<string>(TEMPLATES_PADRAO[0].texto);

  // Configurações Anti-Bloqueio
  const [delaySeconds, setDelaySeconds] = useState<number>(5);
  const [randomJitter, setRandomJitter] = useState<boolean>(true);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);

  // Filtra eleitores com número de celular/WhatsApp válido (ao menos 10 dígitos com DDD)
  const eleitoresValidos = useMemo(() => {
    return selectedEleitores.filter((e) => {
      const p = cleanPhone(e.whatsapp || e.telefone);
      return p.length >= 10;
    });
  }, [selectedEleitores]);

  const eleitoresSemTelefone = useMemo(() => {
    return selectedEleitores.filter((e) => {
      const p = cleanPhone(e.whatsapp || e.telefone);
      return p.length < 10;
    });
  }, [selectedEleitores]);

  // Estado da Fila Guiada
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [totalEnviados, setTotalEnviados] = useState<number>(0);
  const [totalPulados, setTotalPulados] = useState<number>(0);
  const [historicoFila, setHistoricoFila] = useState<
    { id: string; nome: string; status: 'enviado' | 'pulado'; horario: string }[]
  >([]);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [showInterruptConfirm, setShowInterruptConfirm] = useState<boolean>(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState<boolean>(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState<string>('');

  // Referência para o timer
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Nome da campanha para variáveis
  const nomeCampanha = currentTenant?.nome || 'nossa campanha';

  // Fechar modal limpando temporizadores e resetando etapas
  const handleClose = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setStep('config');
    setCurrentIndex(0);
    setIsPaused(false);
    setCountdown(0);
    setShowInterruptConfirm(false);
    setIsCreatingTemplate(false);
    onClose();
  };

  // Resetar fila sempre que o modal for reaberto
  useEffect(() => {
    if (isOpen) {
      setStep('config');
      setCurrentIndex(0);
      setIsPaused(false);
      setCountdown(0);
      setShowInterruptConfirm(false);
      setIsCreatingTemplate(false);
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    }
  }, [isOpen]);

  // Salva templates no localStorage quando editados
  const handleSelectTemplate = (tpl: TemplateMensagem) => {
    setSelectedTemplateId(tpl.id);
    setMensagemText(tpl.texto);
  };

  const handleConfirmSaveTemplate = () => {
    if (!newTemplateTitle || !newTemplateTitle.trim()) return;

    const novoTemplate: TemplateMensagem = {
      id: `custom_${Date.now()}`,
      nome: newTemplateTitle.trim(),
      texto: mensagemText
    };

    const atualizados = [...templates, novoTemplate];
    setTemplates(atualizados);
    setSelectedTemplateId(novoTemplate.id);
    setIsCreatingTemplate(false);
    setNewTemplateTitle('');
    try {
      localStorage.setItem('seati_whatsapp_templates', JSON.stringify(atualizados));
    } catch {}
  };

  // Interpolação de variáveis
  const interpolateMessage = (templateStr: string, eleitor?: Eleitor): string => {
    if (!eleitor) return templateStr;
    const nomeCompleto = eleitor.nome || 'Eleitor(a)';
    const primeiroNome = nomeCompleto.split(' ')[0] || nomeCompleto;
    const lideranca = eleitor.lideranca || 'nossa liderança';
    const bairro = eleitor.bairro || 'seu bairro';
    const cidade = eleitor.cidade || currentTenant?.cidade || 'nossa cidade';

    return templateStr
      .replace(/\{primeiro_nome\}/gi, primeiroNome)
      .replace(/\{nome\}/gi, nomeCompleto)
      .replace(/\{lideranca\}/gi, lideranca)
      .replace(/\{bairro\}/gi, bairro)
      .replace(/\{cidade\}/gi, cidade)
      .replace(/\{campanha\}/gi, nomeCampanha);
  };

  // Inserir tag dinâmica na posição atual
  const insertTag = (tag: string) => {
    setMensagemText((prev) => `${prev} ${tag} `);
  };

  // Eleitor atual na fila
  const currentEleitor = eleitoresValidos[currentIndex];

  // Iniciar Fila
  const handleStartQueue = () => {
    if (eleitoresValidos.length === 0) return;
    setStep('queue');
    setCurrentIndex(0);
    setTotalEnviados(0);
    setTotalPulados(0);
    setHistoricoFila([]);
    setIsPaused(false);
    setCountdown(0); // Primeiro eleitor pronto para envio imediato
  };

  // Calcular delay com variação humana aleatória
  const getNextDelay = () => {
    if (!randomJitter) return delaySeconds;
    // Adiciona jitter de -1 a +2 segundos sem ficar menor que 2s
    const jitter = Math.floor(Math.random() * 4) - 1; // -1, 0, 1, 2
    return Math.max(2, delaySeconds + jitter);
  };

  // Disparar WhatsApp para o eleitor atual
  const handleSendCurrent = async () => {
    if (!currentEleitor) return;

    const phone = cleanPhone(currentEleitor.whatsapp || currentEleitor.telefone);
    const msg = interpolateMessage(mensagemText, currentEleitor);
    const encoded = encodeURIComponent(msg);
    const waUrl = `https://wa.me/55${phone}?text=${encoded}`;

    // Abre a conversa no WhatsApp
    window.open(waUrl, '_blank');

    // Registra validação automaticamente com status "Contatado aguardando retorno"
    const nowIso = new Date().toISOString();
    try {
      await registrarValidacao(currentEleitor.id, {
        tipo: 'Mensagem',
        status: 'Contatado aguardando retorno',
        dataHora: nowIso,
        observacoes: `Disparo em lote WhatsApp via SEATI. Modelo: "${
          templates.find((t) => t.id === selectedTemplateId)?.nome || 'Personalizado'
        }"`,
        operadorNome: currentUser?.nome || currentUser?.email || 'Coordenação'
      });
    } catch (err) {
      console.error('Erro ao registrar validação de disparo:', err);
    }

    setTotalEnviados((prev) => prev + 1);
    setHistoricoFila((prev) => [
      ...prev,
      {
        id: currentEleitor.id,
        nome: currentEleitor.nome,
        status: 'enviado',
        horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }
    ]);

    advanceQueue();
  };

  // Pular o eleitor atual
  const handleSkipCurrent = () => {
    if (!currentEleitor) return;

    setTotalPulados((prev) => prev + 1);
    setHistoricoFila((prev) => [
      ...prev,
      {
        id: currentEleitor.id,
        nome: currentEleitor.nome,
        status: 'pulado',
        horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }
    ]);

    advanceQueue();
  };

  // Avançar na fila
  const advanceQueue = () => {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= eleitoresValidos.length) {
      // Fila concluída!
      playSuccessChime();
      setStep('finished');
      if (onBatchCompleted) {
        onBatchCompleted();
      }
      return;
    }

    setCurrentIndex(nextIdx);
    const nextWait = getNextDelay();
    setCountdown(nextWait);
  };

  // Temporizador anti-bloqueio entre envios
  useEffect(() => {
    if (step !== 'queue' || isPaused || countdown <= 0) return;

    timerRef.current = setTimeout(() => {
      setCountdown((prev) => {
        const next = prev - 1;
        if (next <= 0 && autoAdvance) {
          // Quando o delay zera e autoAdvance está ativo, dispara o próximo automaticamente
          // (comentado: abrir popup automático pode ser bloqueado pelo navegador se não for acionado por clique,
          // portanto mantemos a contagem zerada para habilitar o botão de disparo com 1-clique ou dispara se configurado)
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [step, isPaused, countdown, autoAdvance]);

  // Copiar mensagem para área de transferência
  const handleCopyMessage = () => {
    if (!currentEleitor) return;
    const msg = interpolateMessage(mensagemText, currentEleitor);
    navigator.clipboard.writeText(msg);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  if (!isOpen) return null;

  const previewEleitor = eleitoresValidos[0] || selectedEleitores[0];
  const previewText = interpolateMessage(mensagemText, previewEleitor);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-5 animate-fadeIn"
    >
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* HEADER MODAL */}
        <div className="px-5 py-3.5 bg-surface border-b border-outline-variant/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm md:text-base font-bold text-on-surface">
                  Disparador e Validador WhatsApp em Lote
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                  Fila Guiada Anti-Bloqueio
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Envio assistido com atualização automática para "Contatado aguardando retorno".
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
            title="Fechar janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO DO MODAL */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          {/* ETAPA 1: CONFIGURAÇÃO DO DISPARO */}
          {step === 'config' && (
            <div className="space-y-5">
              {/* Resumo da Seleção de Eleitores */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-surface border border-outline-variant/60 rounded-xl flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-on-surface-variant uppercase font-bold">
                      Selecionados
                    </span>
                    <p className="text-base font-black text-on-surface">{selectedEleitores.length} eleitores</p>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-100 rounded-lg text-emerald-800">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-800 uppercase font-bold">Com WhatsApp Válido</span>
                    <p className="text-base font-black text-emerald-950">
                      {eleitoresValidos.length} prontos para envio
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-3">
                  <div className="p-2.5 bg-amber-100 rounded-lg text-amber-800">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-800 uppercase font-bold">Sem Telefone</span>
                    <p className="text-base font-black text-amber-950">
                      {eleitoresSemTelefone.length} serão ignorados
                    </p>
                  </div>
                </div>
              </div>

              {/* Gerenciador de Templates */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-secondary" /> Modelos de Mensagem
                    </label>
                    {!isCreatingTemplate && (
                      <button
                        type="button"
                        onClick={() => setIsCreatingTemplate(true)}
                        className="text-[11px] text-secondary hover:underline font-bold cursor-pointer"
                      >
                        + Salvar como Novo Modelo
                      </button>
                    )}
                  </div>

                  {isCreatingTemplate && (
                    <div className="p-3 bg-secondary/10 border border-secondary/30 rounded-xl space-y-2 animate-fadeIn">
                      <p className="text-xs font-bold text-on-surface">Salvar mensagem atual como novo modelo:</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Nome do modelo (ex: Confirmação Comício)"
                          value={newTemplateTitle}
                          onChange={(e) => setNewTemplateTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleConfirmSaveTemplate();
                            }
                          }}
                          className="flex-1 h-8 px-2.5 text-xs bg-surface-container-lowest border border-outline-variant/60 rounded-lg text-on-surface focus:outline-none focus:border-secondary"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleConfirmSaveTemplate}
                          disabled={!newTemplateTitle.trim()}
                          className="px-3 py-1.5 bg-secondary text-on-primary hover:bg-primary rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingTemplate(false);
                            setNewTemplateTitle('');
                          }}
                          className="px-2.5 py-1.5 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Seletor rápido de templates */}
                  <div className="grid grid-cols-2 gap-2">
                    {templates.map((tpl) => {
                      const isSel = selectedTemplateId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => handleSelectTemplate(tpl)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSel
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-2xs ring-1 ring-emerald-500'
                              : 'border-outline-variant/60 hover:bg-surface-container text-on-surface'
                          }`}
                        >
                          <p className="text-xs font-bold truncate">{tpl.nome}</p>
                          <p className="text-[10px] text-on-surface-variant truncate mt-0.5">{tpl.texto}</p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Editor da Mensagem */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-on-surface">Texto da Mensagem</label>
                      <span className="text-[10px] text-on-surface-variant">
                        {mensagemText.length} caracteres
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={mensagemText}
                      onChange={(e) => setMensagemText(e.target.value)}
                      placeholder="Digite a mensagem que será enviada para os eleitores..."
                      className="w-full border border-outline-variant rounded-xl p-3 text-xs bg-surface text-on-surface focus:outline-none focus:border-secondary font-mono leading-relaxed resize-y custom-scrollbar"
                    />

                    {/* Botões Rápidos de Variáveis Dinâmicas */}
                    <div className="mt-2">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">
                        Inserir tags dinâmicas:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { tag: '{primeiro_nome}', desc: 'Primeiro Nome' },
                          { tag: '{nome}', desc: 'Nome Completo' },
                          { tag: '{lideranca}', desc: 'Liderança' },
                          { tag: '{bairro}', desc: 'Bairro' },
                          { tag: '{cidade}', desc: 'Cidade' },
                          { tag: '{campanha}', desc: 'Nome da Campanha' }
                        ].map((item) => (
                          <button
                            key={item.tag}
                            type="button"
                            onClick={() => insertTag(item.tag)}
                            className="px-2 py-1 bg-surface-container hover:bg-surface-container-high border border-outline-variant/60 rounded-md text-[11px] font-mono text-on-surface transition-colors cursor-pointer"
                            title={`Insere a variável ${item.tag}`}
                          >
                            <span className="font-bold text-secondary">{item.tag}</span>{' '}
                            <span className="text-on-surface-variant text-[10px]">({item.desc})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Configurações Anti-Bloqueio */}
                  <div className="p-3.5 bg-surface border border-outline-variant/60 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" /> Proteção Anti-Bloqueio do WhatsApp
                      </span>
                      <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                        Recomendado
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-bold text-on-surface-variant mb-1">
                          Intervalo entre Envios:
                        </label>
                        <select
                          value={delaySeconds}
                          onChange={(e) => setDelaySeconds(Number(e.target.value))}
                          className="w-full h-8 bg-surface-container-lowest border border-outline-variant rounded-lg px-2 text-xs text-on-surface font-medium focus:outline-none"
                        >
                          <option value={3}>3 segundos (Rápido)</option>
                          <option value={5}>5 segundos (Recomendado - Equilibrado)</option>
                          <option value={8}>8 segundos (Muito Seguro)</option>
                          <option value={12}>12 segundos (Alta Proteção)</option>
                          <option value={15}>15 segundos (Campanhas Grandes)</option>
                        </select>
                      </div>

                      <div className="flex flex-col justify-end space-y-1.5">
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-on-surface select-none">
                          <input
                            type="checkbox"
                            checked={randomJitter}
                            onChange={(e) => setRandomJitter(e.target.checked)}
                            className="rounded border-outline-variant text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                          />
                          <span>Variação humana aleatória (+/- 1-2s)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview em Tempo Real do Balão WhatsApp */}
                <div className="lg:col-span-5 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                      Prévia Real da Mensagem
                    </span>
                    <span className="text-[11px] text-on-surface-variant">Exemplo com 1º eleitor</span>
                  </div>

                  {/* Simulador de Tela do WhatsApp */}
                  <div className="flex-1 bg-[#efeae2] dark:bg-[#111b21] rounded-2xl border border-outline-variant/60 p-4 flex flex-col justify-between shadow-inner min-h-[300px]">
                    {/* Header do Chat WhatsApp */}
                    <div className="bg-[#00a884] text-white px-3 py-2 rounded-xl flex items-center justify-between shadow-xs mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs text-white">
                          {(previewEleitor?.nome || 'E')[0]}
                        </div>
                        <div>
                          <p className="text-xs font-bold leading-tight">{previewEleitor?.nome || 'Nome do Eleitor'}</p>
                          <p className="text-[10px] text-white/80 leading-tight">
                            {formatPhone(previewEleitor?.whatsapp || previewEleitor?.telefone)}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">SEATI</span>
                    </div>

                    {/* Balão de Mensagem */}
                    <div className="flex justify-end my-auto">
                      <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-900 dark:text-emerald-50 rounded-2xl rounded-tr-none px-3.5 py-2.5 max-w-[90%] shadow-sm text-xs leading-relaxed whitespace-pre-wrap font-sans relative">
                        {previewText}
                        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-500 dark:text-emerald-200/70">
                          <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓✓</span>
                        </div>
                      </div>
                    </div>

                    {/* Rodapé informativo */}
                    <div className="text-center pt-3 border-t border-black/5 dark:border-white/5 text-[10px] text-slate-600 dark:text-slate-400">
                      O WhatsApp Web será aberto oficialmente com a mensagem pronta para envio.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ETAPA 2: FILA GUIADA ATIVA (RUNNER) */}
          {step === 'queue' && (
            <div className="space-y-5">
              {/* Barra de Progresso e Métricas da Fila */}
              <div className="bg-surface p-4 rounded-2xl border border-outline-variant/60 shadow-xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-on-surface">
                      Eleitor {currentIndex + 1} de {eleitoresValidos.length}
                    </span>
                    <span className="text-[11px] font-mono text-on-surface-variant">
                      ({Math.round(((currentIndex + 1) / eleitoresValidos.length) * 100)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-semibold text-xs">
                    <span className="text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {totalEnviados} disparados
                    </span>
                    <span className="text-amber-700 flex items-center gap-1">
                      <SkipForward className="w-3.5 h-3.5" /> {totalPulados} pulados
                    </span>
                    <span className="text-on-surface-variant flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {eleitoresValidos.length - currentIndex} restantes
                    </span>
                  </div>
                </div>

                {/* Barra Visual de Progresso */}
                <div className="w-full bg-surface-container-high h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.round(((currentIndex + 1) / eleitoresValidos.length) * 100))}%`
                    }}
                  />
                </div>
              </div>

              {/* Card em Destaque do Eleitor Atual */}
              {currentEleitor && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                  {/* Dados do Eleitor */}
                  <div className="md:col-span-5 bg-surface-container-low p-4 rounded-2xl border border-outline-variant/60 space-y-3.5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                        <User className="w-4 h-4 text-primary" /> Eleitor em Foco
                      </div>

                      <h4 className="text-lg font-black text-on-surface">{currentEleitor.nome}</h4>
                      <p className="font-mono text-sm font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
                        <MessageCircle className="w-4 h-4" />
                        {formatPhone(currentEleitor.whatsapp || currentEleitor.telefone)}
                      </p>

                      <div className="mt-3.5 space-y-1.5 text-xs text-on-surface-variant">
                        <p>
                          <strong className="text-on-surface">Liderança:</strong>{' '}
                          {currentEleitor.lideranca || 'Não vinculada'}
                        </p>
                        {currentEleitor.subLideranca && (
                          <p>
                            <strong className="text-on-surface">Sub-liderança:</strong> {currentEleitor.subLideranca}
                          </p>
                        )}
                        <p>
                          <strong className="text-on-surface">Bairro:</strong> {currentEleitor.bairro || 'Não informado'}
                        </p>
                        <p>
                          <strong className="text-on-surface">Zona / Seção:</strong>{' '}
                          {currentEleitor.zona || '-'} / {currentEleitor.secao || '-'}
                        </p>
                        <p>
                          <strong className="text-on-surface">Status Atual:</strong>{' '}
                          <span className="font-semibold text-on-surface">
                            {currentEleitor.statusValidacao || 'Pendente'}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Aviso de Atualização Automática */}
                    <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-300 text-[11px] text-emerald-900 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      <span>
                        Ao clicar em Disparar, este eleitor será marcado automaticamente como{' '}
                        <strong>"Contatado aguardando retorno"</strong>.
                      </span>
                    </div>
                  </div>

                  {/* Prévia da Mensagem Personalizada & Ações de Disparo */}
                  <div className="md:col-span-7 flex flex-col justify-between space-y-4">
                    {/* Balão da Mensagem Formatada */}
                    <div className="bg-[#efeae2] dark:bg-[#111b21] rounded-2xl border border-outline-variant/60 p-4 flex flex-col justify-between shadow-inner flex-1 min-h-[220px]">
                      <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 mb-2">
                        <span className="font-bold">Mensagem Personalizada</span>
                        <button
                          type="button"
                          onClick={handleCopyMessage}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                        >
                          {copiedSuccess ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" /> Copiado!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" /> Copiar texto
                            </>
                          )}
                        </button>
                      </div>

                      <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-900 dark:text-emerald-50 rounded-2xl rounded-tr-none p-3.5 shadow-sm text-xs leading-relaxed whitespace-pre-wrap font-sans my-auto">
                        {interpolateMessage(mensagemText, currentEleitor)}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 pt-2 border-t border-black/5 dark:border-white/5">
                        <span>Canal: WhatsApp Web / App</span>
                        <span>Destinatário: {formatPhone(currentEleitor.whatsapp || currentEleitor.telefone)}</span>
                      </div>
                    </div>

                    {/* Painel de Disparo e Intervalo Anti-Bloqueio */}
                    <div className="bg-surface p-3.5 rounded-2xl border border-outline-variant/60 space-y-3">
                      {/* Indicador de Delay Anti-Bloqueio */}
                      <div className="flex items-center justify-between text-xs">
                        {countdown > 0 ? (
                          <div className="flex items-center gap-2 text-amber-800 font-bold">
                            <Clock className="w-4 h-4 animate-spin text-amber-600" />
                            <span>Intervalo de segurança anti-bloqueio: aguarde {countdown}s...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-emerald-800 font-bold">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            <span>Pronto para disparo seguro!</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => setIsPaused((prev) => !prev)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                            isPaused
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                          }`}
                        >
                          {isPaused ? (
                            <>
                              <Play className="w-3 h-3 fill-current" /> Retomar Fila
                            </>
                          ) : (
                            <>
                              <Pause className="w-3 h-3" /> Pausar Fila
                            </>
                          )}
                        </button>
                      </div>

                      {/* Botões de Ação Principal */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={handleSendCurrent}
                          className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs md:text-sm font-black flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer group"
                        >
                          <Send className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                          <span>Disparar WhatsApp e Marcar como Contatado</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSkipCurrent}
                          className="py-3 px-3 bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/60 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          title="Pula este eleitor sem enviar mensagem"
                        >
                          <SkipForward className="w-3.5 h-3.5" />
                          <span>Pular</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ETAPA 3: CONCLUSÃO & RELATÓRIO DO DISPARO */}
          {step === 'finished' && (
            <div className="py-8 text-center space-y-6 max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
              </div>

              <div>
                <h3 className="text-xl font-black text-on-surface">Fila de Disparo Concluída!</h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Todas as mensagens foram processadas e os eleitores atualizados com sucesso.
                </p>
              </div>

              {/* Estatísticas Finais da Sessão */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-surface border border-outline-variant/60 rounded-2xl">
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-bold">Disparados</span>
                  <p className="text-xl font-black text-emerald-700">{totalEnviados}</p>
                  <span className="text-[10px] text-emerald-800">Contatados</span>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-bold">Pulados</span>
                  <p className="text-xl font-black text-amber-700">{totalPulados}</p>
                  <span className="text-[10px] text-amber-800">Sem envio</span>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-bold">Total Fila</span>
                  <p className="text-xl font-black text-on-surface">{eleitoresValidos.length}</p>
                  <span className="text-[10px] text-on-surface-variant">Processados</span>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-950 font-medium text-left flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                <span>
                  Os {totalEnviados} eleitores disparados foram marcados com o status{' '}
                  <strong>"Contatado aguardando retorno"</strong> e já aparecem nos relatórios de validação da sua campanha.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* RODAPÉ DO MODAL */}
        <div className="px-5 py-3.5 bg-surface border-t border-outline-variant/60 flex items-center justify-between shrink-0">
          {step === 'config' && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 border border-outline-variant rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleStartQueue}
                disabled={eleitoresValidos.length === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>Iniciar Fila de Disparo ({eleitoresValidos.length} eleitores)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'queue' && (
            <div className="w-full flex flex-wrap items-center justify-between gap-3">
              {showInterruptConfirm ? (
                <div className="flex flex-wrap items-center gap-2.5 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl animate-fadeIn">
                  <span className="text-xs text-rose-800 font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    Interromper fila de envio agora?
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (timerRef.current) clearTimeout(timerRef.current);
                        setShowInterruptConfirm(false);
                        setStep('finished');
                      }}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      Sim, Interromper
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowInterruptConfirm(false);
                        setIsPaused(false);
                      }}
                      className="px-2.5 py-1 border border-outline-variant bg-surface hover:bg-surface-container rounded-lg text-xs font-semibold text-on-surface transition-colors cursor-pointer"
                    >
                      Continuar Fila
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPaused(true);
                      setShowInterruptConfirm(true);
                    }}
                    className="px-3.5 py-1.5 border border-rose-300 bg-rose-50/70 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Interromper a fila de envios mantendo eleitores já disparados salvos"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Interromper Disparo</span>
                  </button>
                  <span className="text-xs text-on-surface-variant font-medium">
                    Disparando {currentIndex + 1} de {eleitoresValidos.length} eleitores
                  </span>
                </>
              )}
            </div>
          )}

          {step === 'finished' && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 bg-primary text-on-primary hover:bg-secondary rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                Concluir e Ver Lista Atualizada
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
