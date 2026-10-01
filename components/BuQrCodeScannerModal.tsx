'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'manual'>('camera');
  const [candidateNumber, setCandidateNumber] = useState(defaultCandidateNumber);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // Resultado decodificado
  const [parsedResult, setParsedResult] = useState<BuParsedSecao | null>(null);
  const [selectedVotes, setSelectedVotes] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const html5QrCodeRef = useRef<any>(null);
  const scannerContainerId = 'bu-qr-reader-container';

  // Processa texto decodificado
  const handleDecodedText = (decodedText: string) => {
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

    // Para a câmera temporariamente para mostrar o resultado
    stopCamera();
  };

  // Iniciar Leitor de Câmera
  const startCamera = async () => {
    try {
      setScannerError(null);
      setIsScanning(true);

      const { Html5Qrcode } = await import('html5-qrcode');

      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(scannerContainerId);
      }

      const config = {
        fps: 10,
        qrbox: { width: 260, height: 260 }
      };

      await html5QrCodeRef.current.start(
        { facingMode: 'environment' }, // câmera traseira por padrão
        config,
        (decodedText: string) => {
          handleDecodedText(decodedText);
        },
        () => {
          // Frame sem QR code - ignora
        }
      );
    } catch (err: any) {
      console.warn('Erro ao inicializar câmera:', err);
      setScannerError(
        'Não foi possível acessar a câmera. Verifique as permissões do navegador ou utilize o envio de foto/imagem.'
      );
      setIsScanning(false);
    }
  };

  // Parar Leitor de Câmera
  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
      } catch (e) {
        console.warn('Erro ao parar câmera:', e);
      }
    }
    setIsScanning(false);
  };

  // Leitura de Imagem/Foto
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setScannerError(null);
      const { Html5Qrcode } = await import('html5-qrcode');
      const tempScanner = new Html5Qrcode('bu-qr-image-temp');
      const text = await tempScanner.scanFile(file, true);
      handleDecodedText(text);
      tempScanner.clear();
    } catch (err) {
      console.error(err);
      setScannerError('Não foi possível ler um QR Code válido nesta imagem. Tente uma foto mais nítida ou aproximada.');
    }
  };

  // Ciclo de vida da câmera ao abrir/fechar modal
  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !parsedResult) {
      const timer = setTimeout(() => {
        startCamera();
      }, 300);
      return () => {
        clearTimeout(timer);
        stopCamera();
      };
    } else {
      stopCamera();
    }
  }, [isOpen, activeTab, parsedResult]);

  // Limpeza ao desmontar
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

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
        // Reseta para ler o próximo
        setParsedResult(null);
        setRawText('');
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
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-xl text-primary">
              <Camera className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface">Leitor de QR Code do Boletim de Urna</h3>
              <p className="text-xs text-on-surface-variant font-medium">
                Aponte a câmera para o QR Code impresso na fita do BU da seção eleitoral
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Campo do Número do Candidato Alvo */}
        <div className="px-5 py-2.5 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-on-surface">
            <Vote className="w-4 h-4 text-secondary shrink-0" />
            <span className="font-bold">Candidato Alvo:</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Ex: 12345"
              value={candidateNumber}
              onChange={(e) => setCandidateNumber(e.target.value)}
              className="w-24 h-7 text-center font-bold text-xs font-mono rounded border border-outline-variant bg-surface text-on-surface focus:outline-none focus:border-secondary"
            />
            <span className="text-[11px] text-on-surface-variant hidden sm:inline">
              (filtra os votos no BU)
            </span>
          </div>
        </div>

        {/* Abas: Câmera vs Foto */}
        {!parsedResult && (
          <div className="flex border-b border-outline-variant/40 bg-surface">
            <button
              type="button"
              onClick={() => {
                setActiveTab('camera');
                setScannerError(null);
              }}
              className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'camera'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Câmera ao Vivo</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('upload');
                stopCamera();
                setScannerError(null);
              }}
              className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
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
              {activeTab === 'camera' ? (
                <div className="relative">
                  <div
                    id={scannerContainerId}
                    className="w-full h-64 bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center border border-outline-variant shadow-inner relative"
                  >
                    {!isScanning && (
                      <div className="text-center text-white/70 p-4">
                        <Camera className="w-8 h-8 mx-auto mb-2 opacity-60 animate-pulse" />
                        <p className="text-xs">Iniciando leitor de câmera...</p>
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
                    Enquadre o QR Code impresso no final da fita de votação da seção eleitoral.
                  </p>
                </div>
              ) : (
                <div className="border-2 border-dashed border-outline-variant rounded-2xl p-6 text-center bg-surface-container-low/40">
                  <div id="bu-qr-image-temp" className="hidden" />
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
              )}
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
                        setRawText('');
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
            className="px-3.5 py-1.5 border border-outline-variant rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container"
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
