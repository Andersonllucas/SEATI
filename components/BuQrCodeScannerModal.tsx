'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  Vote,
  Save,
  Sparkles,
  FileImage
} from 'lucide-react';
import jsQR from 'jsqr';
import { parseTseQrCodeText, BuParsedSecao } from '@/lib/tseBuParser';

interface BuQrCodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSecaoVotos: (
    zona: string,
    secao: string,
    votos: number,
    extras?: { boletimUrna?: string; observacoes?: string }
  ) => Promise<void>;
  defaultCandidateNumber?: string;
}

export function BuQrCodeScannerModal({
  isOpen,
  onClose,
  onSaveSecaoVotos,
  defaultCandidateNumber = ''
}: BuQrCodeScannerModalProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [candidateNumber, setCandidateNumber] = useState(defaultCandidateNumber);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // Resultado decodificado
  const [parsedResult, setParsedResult] = useState<BuParsedSecao | null>(null);
  const [selectedVotes, setSelectedVotes] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Referências HTML5 Video e Stream puro (100% livre de conflitos de estado de terceiros)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isComponentActiveRef = useRef<boolean>(false);

  // Parar Leitor de Câmera (Síncrono e Seguro)
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  // Processa texto decodificado
  const handleDecodedText = useCallback((decodedText: string) => {
    if (!decodedText || !decodedText.trim()) return;

    try {
      const parsed = parseTseQrCodeText(decodedText, candidateNumber);
      setParsedResult(parsed);

      // Se encontrou votos do candidato alvo, seleciona
      if (candidateNumber.trim()) {
        const matchCand = parsed.candidatos.find(
          (c) => c.numero.replace(/\D/g, '') === candidateNumber.replace(/\D/g, '')
        );
        if (matchCand) {
          setSelectedVotes(matchCand.votos);
        } else if (parsed.candidatos.length > 0) {
          setSelectedVotes(parsed.candidatos[0].votos);
        }
      } else if (parsed.candidatos.length > 0) {
        setSelectedVotes(parsed.candidatos[0].votos);
      }

      // Desativa câmera para exibir o resultado
      stopCamera();
    } catch (err) {
      console.warn('Erro ao decodificar QR Code TSE:', err);
    }
  }, [candidateNumber, stopCamera]);

  // Loop de amostragem de frames por Canvas + jsQR
  const startScanLoop = useCallback(() => {
    const scan = () => {
      if (!isComponentActiveRef.current) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        if (!canvasRef.current && typeof document !== 'undefined') {
          canvasRef.current = document.createElement('canvas');
        }
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            // Limita a resolução máxima de processamento para altíssima performance
            const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
            const w = Math.floor(video.videoWidth * scale);
            const h = Math.floor(video.videoHeight * scale);

            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w;
              canvas.height = h;
            }

            ctx.drawImage(video, 0, 0, w, h);
            const imageData = ctx.getImageData(0, 0, w, h);
            const code = jsQR(imageData.data, w, h, {
              inversionAttempts: 'dontInvert'
            });

            if (code && code.data && code.data.trim()) {
              handleDecodedText(code.data);
              return;
            }
          }
        }
      }

      if (isComponentActiveRef.current) {
        animFrameRef.current = requestAnimationFrame(scan);
      }
    };

    animFrameRef.current = requestAnimationFrame(scan);
  }, [handleDecodedText]);

  // Iniciar Leitor de Câmera Nativo
  const startCamera = useCallback(async () => {
    try {
      setScannerError(null);
      stopCamera();

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setScannerError('Seu navegador não possui suporte a acesso de câmera. Utilize a aba "Foto do Boletim".');
        return;
      }

      setIsScanning(true);
      isComponentActiveRef.current = true;

      let stream: MediaStream;
      try {
        // Tenta câmera traseira preferencialmente
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch {
        // Fallback genérico para qualquer câmera disponível
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      if (!isComponentActiveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play().catch(() => {});
        startScanLoop();
      }
    } catch (err: any) {
      console.warn('Erro ao inicializar câmera do dispositivo:', err);
      setScannerError(
        'Não foi possível acessar a câmera. Verifique as permissões do navegador ou utilize a aba "Foto do Boletim".'
      );
      stopCamera();
    }
  }, [stopCamera, startScanLoop]);

  // Leitura de Imagem / Foto do Boletim enviada
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScannerError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Limita a 1600px para garantir processamento veloz de fotos de alta resolução
        let w = img.width;
        let h = img.height;
        const MAX_DIM = 1600;
        if (w > MAX_DIM || h > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        // 1. Tenta decodificação nativa por hardware (BarcodeDetector do Chromium) se disponível
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          try {
            const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
            const barcodes = await detector.detect(canvas);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              handleDecodedText(barcodes[0].rawValue);
              return;
            }
          } catch {}
        }

        // 2. Fallback resiliente com jsQR
        const imageData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, w, h, {
          inversionAttempts: 'attemptBoth'
        });

        if (code && code.data && code.data.trim()) {
          handleDecodedText(code.data);
        } else {
          setScannerError(
            'Não foi possível identificar um QR Code nítido nesta imagem. Tire uma foto mais aproximada e focada no QR Code do final da fita.'
          );
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Gerenciamento de ciclo de vida seguro ao trocar de abas ou abrir modal
  useEffect(() => {
    isComponentActiveRef.current = isOpen && activeTab === 'camera' && !parsedResult;

    if (isOpen && activeTab === 'camera' && !parsedResult) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      isComponentActiveRef.current = false;
      stopCamera();
    };
  }, [isOpen, activeTab, parsedResult, startCamera, stopCamera]);

  // Salvar resultado do BU no banco
  const handleSaveResult = async () => {
    if (!parsedResult || !parsedResult.zona || !parsedResult.secao) {
      alert('Zona e Seção são obrigatórias');
      return;
    }

    setIsSaving(true);
    try {
      await onSaveSecaoVotos(parsedResult.zona, parsedResult.secao, selectedVotes, {
        boletimUrna: 'Leitura QR Code TSE',
        observacoes: `Urna apurada via QR Code (Comparecimento: ${parsedResult.totalComparecimento || '-'})`
      });

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setParsedResult(null);
        if (activeTab === 'camera') {
          startCamera();
        }
      }, 1500);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar os votos da seção.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-surface border-b border-outline-variant/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Vote className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-on-surface">Leitor de QR Code do Boletim de Urna</h3>
              <p className="text-[11px] text-on-surface-variant">
                Boletim de Urna Oficial do TSE • Câmera e Imagem
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Candidato Alvo Configurável */}
        <div className="px-5 py-2.5 bg-surface-container-low/60 border-b border-outline-variant/40 flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-on-surface-variant text-[11px]">
            Número do seu candidato para captura automática:
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Ex: 22123"
              value={candidateNumber}
              onChange={(e) => setCandidateNumber(e.target.value.replace(/\D/g, ''))}
              className="w-24 h-7 text-center font-mono font-bold text-xs rounded-md border border-outline-variant bg-surface px-2"
            />
          </div>
        </div>

        {/* Abas: Câmera x Upload de Imagem */}
        {!parsedResult && (
          <div className="px-5 pt-3 flex border-b border-outline-variant/50 gap-2 bg-surface">
            <button
              type="button"
              onClick={() => setActiveTab('camera')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'camera'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Câmera ao vivo</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'upload'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <FileImage className="w-3.5 h-3.5" />
              <span>Foto do Boletim</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* Se ainda não decodificou um QR Code */}
          {!parsedResult ? (
            <div className="space-y-3">
              {/* Tab Câmera ao vivo */}
              <div className={activeTab === 'camera' ? 'block relative' : 'hidden'}>
                <div className="w-full h-64 bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center border border-outline-variant shadow-inner relative">
                  <video
                    ref={videoRef}
                    playsInline
                    autoPlay
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Retículo do Scanner e Mira */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-52 h-52 border-2 border-emerald-400/80 rounded-2xl relative shadow-lg">
                      {/* Cantoneiras */}
                      <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-md" />
                      <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-md" />
                      <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-md" />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-md" />
                      {/* Linha de laser */}
                      <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] absolute top-1/2 -translate-y-1/2 animate-pulse" />
                    </div>
                  </div>

                  {!isScanning && (
                    <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white/70 p-4">
                      <Camera className="w-8 h-8 mb-2 opacity-60 animate-pulse text-emerald-400" />
                      <p className="text-xs font-medium">Iniciando leitor de câmera...</p>
                    </div>
                  )}
                </div>

                {scannerError && (
                  <div className="mt-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold">Aviso da Câmera</p>
                      <p className="text-[11px] mt-0.5">{scannerError}</p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('upload')}
                        className="mt-1.5 text-xs font-bold text-secondary hover:underline cursor-pointer"
                      >
                        Usar envio de foto/imagem em vez da câmera →
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-center text-on-surface-variant mt-2">
                  Enquadre o QR Code impresso no final da fita de votação da urna eletrônica.
                </p>
              </div>

              {/* Tab Foto do Boletim */}
              <div className={activeTab === 'upload' ? 'block' : 'hidden'}>
                <div className="border-2 border-dashed border-outline-variant rounded-2xl p-6 text-center bg-surface-container-low/40">
                  <FileImage className="w-10 h-10 text-secondary mx-auto mb-2 opacity-80" />
                  <p className="text-sm font-bold text-on-surface">Selecione ou Tire uma Foto do QR Code</p>
                  <p className="text-xs text-on-surface-variant mt-1 max-w-xs mx-auto">
                    Tire uma foto bem focada da fita do Boletim de Urna contendo o código QR.
                  </p>
                  <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary hover:bg-secondary rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm">
                    <Upload className="w-4 h-4" />
                    <span>Escolher Foto ou Tirar Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>

                  {scannerError && (
                    <p className="mt-3 text-xs text-rose-600 font-semibold bg-rose-50 p-2 rounded-lg border border-rose-200">
                      {scannerError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Resultado Decodificado do QR Code */
            <div className="space-y-3.5 animate-fadeIn">
              {saveSuccess ? (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-center text-emerald-900 space-y-1">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="text-sm font-bold">Votos da Seção Gravados com Sucesso!</p>
                  <p className="text-xs text-emerald-800">
                    Seção {parsedResult.secao} atualizada com {selectedVotes} votos.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 bg-secondary/10 border border-secondary/20 rounded-xl text-xs">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-secondary" />
                      <span className="font-bold text-on-surface">Boletim de Urna Decodificado!</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setParsedResult(null);
                        if (activeTab === 'camera') startCamera();
                      }}
                      className="text-xs font-semibold text-secondary hover:underline cursor-pointer"
                    >
                      Escanear outro
                    </button>
                  </div>

                  {/* Informações da Urna Extraídas */}
                  <div className="grid grid-cols-2 gap-2 p-3 bg-surface-container rounded-xl text-xs">
                    <div>
                      <p className="text-[10px] text-on-surface-variant uppercase font-bold">Zona Eleitoral</p>
                      <input
                        type="text"
                        value={parsedResult.zona}
                        onChange={(e) =>
                          setParsedResult((prev) => (prev ? { ...prev, zona: e.target.value } : null))
                        }
                        className="mt-0.5 w-full h-8 px-2 font-bold text-xs rounded border border-outline-variant bg-surface"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-on-surface-variant uppercase font-bold">Seção Eleitoral</p>
                      <input
                        type="text"
                        value={parsedResult.secao}
                        onChange={(e) =>
                          setParsedResult((prev) => (prev ? { ...prev, secao: e.target.value } : null))
                        }
                        className="mt-0.5 w-full h-8 px-2 font-mono font-bold text-xs rounded border border-outline-variant bg-surface"
                      />
                    </div>
                  </div>

                  {/* Votos do Candidato */}
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-950">
                        Votos do Seu Candidato Nesta Urna:
                      </span>
                      <span className="text-[11px] font-mono text-emerald-700">
                        {candidateNumber ? `Cand: ${candidateNumber}` : 'Total na Urna'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        value={selectedVotes}
                        onChange={(e) => setSelectedVotes(parseInt(e.target.value, 10) || 0)}
                        className="w-28 h-10 text-center font-black text-xl text-emerald-950 font-mono rounded-lg border-2 border-emerald-500 bg-surface shadow-xs"
                      />
                      <span className="text-xs text-emerald-900 font-semibold leading-tight">
                        votos apurados para salvar nesta seção
                      </span>
                    </div>
                  </div>

                  {/* Outros Candidatos Detectados para Conferência */}
                  {parsedResult.candidatos.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                        Candidatos encontrados na fita (Clique para selecionar outro se necessário):
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                        {parsedResult.candidatos.map((c) => (
                          <button
                            key={c.numero}
                            type="button"
                            onClick={() => {
                              setSelectedVotes(c.votos);
                              setCandidateNumber(c.numero);
                            }}
                            className={`px-2 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                              selectedVotes === c.votos && candidateNumber === c.numero
                                ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                                : 'bg-surface hover:bg-surface-container border-outline-variant text-on-surface'
                            }`}
                          >
                            <span className="font-mono font-bold">{c.numero}:</span>
                            <span className="font-black">{c.votos} votos</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-surface border-t border-outline-variant/60 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-3.5 py-1.5 border border-outline-variant rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container cursor-pointer"
          >
            Fechar
          </button>

          {parsedResult && !saveSuccess && (
            <button
              type="button"
              onClick={handleSaveResult}
              disabled={isSaving}
              className="px-4 py-2 bg-primary text-on-primary hover:bg-secondary rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Salvando...' : 'Confirmar e Gravar Seção'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
