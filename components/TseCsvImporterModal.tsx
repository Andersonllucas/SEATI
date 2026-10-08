'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  X,
  Vote,
  Check,
  Building,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { parseTseCsvFileStreaming, FastTseParseSummary } from '@/lib/tseFastStreamParser';
import { BuTseCsvRow } from '@/lib/tseBuParser';

interface TseCsvImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportBatch: (
    items: Array<{ zona: string; secao: string; votosApurados: number; boletimUrna?: string }>
  ) => Promise<void>;
  registeredSectionsKeys?: Set<string>;
  registeredSectionsInfo?: Map<string, { totalCadastrados: number; localNome?: string }>;
}

export function TseCsvImporterModal({
  isOpen,
  onClose,
  onImportBatch,
  registeredSectionsKeys,
  registeredSectionsInfo
}: TseCsvImporterModalProps) {
  // Número do candidato preenchido ANTES do arquivo
  const [targetNumber, setTargetNumber] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tse_import_target_candidate') || '';
    }
    return '';
  });
  const [municipioFilter, setMunicipioFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tse_import_municipio_filter') || '';
    }
    return '';
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSizeFormatted, setFileSizeFormatted] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>('');

  const [parseSummary, setParseSummary] = useState<FastTseParseSummary | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Lembrar o número do candidato digitado
  useEffect(() => {
    if (targetNumber) {
      localStorage.setItem('tse_import_target_candidate', targetNumber);
    }
  }, [targetNumber]);

  useEffect(() => {
    if (municipioFilter) {
      localStorage.setItem('tse_import_municipio_filter', municipioFilter);
    }
  }, [municipioFilter]);

  // Função central de processamento rápido em streaming
  const processFile = async (file: File, candidateNum: string, munFilter: string) => {
    setIsProcessing(true);
    setProgressPercent(0);
    setProgressStatus('Iniciando leitura por blocos (streaming)...');

    try {
      const summary = await parseTseCsvFileStreaming(
        file,
        candidateNum,
        munFilter,
        (p) => {
          setProgressPercent(p.percent);
          setProgressStatus(p.statusText);
        }
      );
      setParseSummary(summary);
    } catch (err) {
      console.error('Erro ao processar arquivo TSE:', err);
      alert('Erro ao processar o arquivo CSV do TSE. Verifique se o formato é válido.');
      setParseSummary(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Manipulador de upload de arquivo: já processa automaticamente com o número do candidato informado
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setFileName(file.name);
    
    // Formatação amigável do tamanho
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    setFileSizeFormatted(file.size > 1024 * 1024 ? `${sizeMb} MB` : `${Math.round(file.size / 1024)} KB`);

    // Inicia imediatamente o processamento de busca
    await processFile(file, targetNumber, municipioFilter);
  };

  // Se o usuário já tiver o arquivo carregado e quiser re-filtrar por outro número sem re-enviar
  const handleReapplyCandidate = async () => {
    if (!selectedFile) return;
    await processFile(selectedFile, targetNumber, municipioFilter);
  };

  // Linhas preparadas para envio
  const preparedRows: BuTseCsvRow[] = useMemo(() => {
    if (!parseSummary) return [];
    return parseSummary.rows;
  }, [parseSummary]);

  // Estatísticas de correspondência com a base cadastrada
  const stats = useMemo(() => {
    if (!preparedRows.length) return null;

    let totalVotos = 0;
    let matchingRegistered = 0;
    let votosEmSecoesCadastradas = 0;
    let eleitoresCadastradosCruzados = 0;

    preparedRows.forEach((r) => {
      totalVotos += r.votos;
      const keyZ = String(parseInt(r.zona.replace(/\D/g, '') || '0', 10));
      const keyS = String(parseInt(r.secao.replace(/\D/g, '') || '0', 10));
      const secKey = `z${keyZ}_s${keyS}`;
      
      const info = registeredSectionsInfo?.get(secKey);
      const isKeyMatch = registeredSectionsKeys?.has(secKey);

      if (info || isKeyMatch) {
        matchingRegistered++;
        votosEmSecoesCadastradas += r.votos;
        if (info) {
          eleitoresCadastradosCruzados += info.totalCadastrados;
        }
      }
    });

    const totalBasesCadastradas = registeredSectionsInfo?.size || registeredSectionsKeys?.size || 0;
    const taxaMatch = Math.round((matchingRegistered / Math.max(1, totalBasesCadastradas)) * 100);
    const taxaCumprimentoBase = eleitoresCadastradosCruzados > 0
      ? Math.round((votosEmSecoesCadastradas / eleitoresCadastradosCruzados) * 100)
      : 0;

    return {
      totalSecoes: preparedRows.length,
      totalVotos,
      matchingRegistered,
      totalBasesCadastradas,
      taxaMatch,
      votosEmSecoesCadastradas,
      eleitoresCadastradosCruzados,
      taxaCumprimentoBase
    };
  }, [preparedRows, registeredSectionsKeys, registeredSectionsInfo]);

  // Confirmar e Importar
  const handleConfirmImport = async () => {
    if (!preparedRows.length) return;
    setIsSaving(true);

    try {
      const items = preparedRows.map((r) => ({
        zona: r.zona,
        secao: r.secao,
        votosApurados: r.votos,
        boletimUrna: `TSE BU ${fileName} (Candidato: ${targetNumber}${parseSummary?.candidatoNome ? ` - ${parseSummary.candidatoNome}` : ''})`
      }));

      await onImportBatch(items);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar os votos no sistema.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetFile = () => {
    setSelectedFile(null);
    setFileName('');
    setFileSizeFormatted('');
    setParseSummary(null);
    setProgressPercent(0);
    setProgressStatus('');
  };

  if (!isOpen) return null;

  const hasCandidateNumber = Boolean(targetNumber.trim());

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-surface border-b border-outline-variant/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface">Importar Arquivo Oficial de BU do TSE</h3>
              <p className="text-xs text-on-surface-variant font-medium">
                Insira o número do candidato antes de carregar o arquivo para busca instantânea direta
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* PASSO 1: Configuração do Candidato ANTES da Importação */}
          <div className="p-4 rounded-xl border border-secondary/20 bg-secondary/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-secondary text-on-secondary text-[11px] font-black flex items-center justify-center">
                  1
                </span>
                <span className="text-xs font-bold text-on-surface">
                  Informe os dados para busca automática antes de importar
                </span>
              </div>
              <span className="text-[10px] bg-secondary/15 text-secondary px-2 py-0.5 rounded-full font-bold">
                Leitura em lote otimizada
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1 flex items-center gap-1.5">
                  <span>Número do Candidato na Urna</span>
                  <span className="text-error font-bold">*</span>
                </label>
                <div className="relative">
                  <Vote className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                  <input
                    type="text"
                    placeholder="Ex: 12345, 15, 22..."
                    value={targetNumber}
                    onChange={(e) => setTargetNumber(e.target.value.replace(/\D/g, ''))}
                    disabled={isProcessing}
                    className="w-full h-10 border border-secondary/40 focus:border-secondary rounded-xl pl-9 pr-3 text-xs bg-surface text-on-surface font-mono font-bold focus:outline-none focus:ring-1 focus:ring-secondary/30 transition-all placeholder:font-sans placeholder:font-normal"
                  />
                </div>
                <p className="text-[11px] text-on-surface-variant mt-1 leading-tight">
                  {hasCandidateNumber ? (
                    <span className="text-emerald-700 font-medium">
                      ✓ O leitor buscará direto apenas os votos do número <strong>{targetNumber}</strong> durante o upload.
                    </span>
                  ) : (
                    <span className="text-amber-800 font-medium">
                      Preencha o número para que o sistema não precise ler e processar o arquivo gigante mais de uma vez.
                    </span>
                  )}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">
                  Filtrar por Município (Opcional)
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <input
                    type="text"
                    placeholder="Ex: Teresina, São Paulo..."
                    value={municipioFilter}
                    onChange={(e) => setMunicipioFilter(e.target.value)}
                    disabled={isProcessing}
                    className="w-full h-10 border border-outline-variant focus:border-secondary rounded-xl pl-9 pr-3 text-xs bg-surface text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary/30 transition-all"
                  />
                </div>
                <p className="text-[11px] text-on-surface-variant mt-1 leading-tight">
                  Recomendado caso seu arquivo contenha os boletins de múltiplos municípios do estado.
                </p>
              </div>
            </div>

            {/* Botão de re-busca se o arquivo já estiver na memória e o usuário alterar o número */}
            {selectedFile && !isProcessing && (
              <div className="pt-1 flex items-center justify-between border-t border-outline-variant/30">
                <span className="text-[11px] text-on-surface-variant">
                  Arquivo já carregado: <strong>{fileName}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleReapplyCandidate}
                  disabled={!hasCandidateNumber}
                  className="px-2.5 py-1 text-xs font-bold bg-secondary text-on-secondary rounded-lg hover:bg-secondary/90 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Recalcular com este número
                </button>
              </div>
            )}
          </div>

          {/* PASSO 2: Área de Upload do Arquivo do TSE */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-surface-container-high text-on-surface text-[11px] font-black flex items-center justify-center">
                2
              </span>
              <span className="text-xs font-bold text-on-surface">
                Selecione o arquivo CSV oficial do TSE
              </span>
            </div>

            {!selectedFile ? (
              <div
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
                  hasCandidateNumber
                    ? 'border-emerald-500/50 hover:border-emerald-600 bg-emerald-500/5'
                    : 'border-outline-variant hover:border-secondary bg-surface-container-low/40'
                }`}
              >
                <Upload className={`w-9 h-9 mx-auto mb-2 ${hasCandidateNumber ? 'text-emerald-600' : 'text-secondary'} opacity-85`} />
                <p className="text-sm font-bold text-on-surface">
                  {hasCandidateNumber ? 'Tudo pronto! Carregue o arquivo CSV de Boletim de Urna' : 'Carregar arquivo CSV de Boletim de Urna'}
                </p>
                <p className="text-xs text-on-surface-variant mt-1 max-w-md mx-auto">
                  Arquivo oficial do TSE (<code className="bg-surface-container px-1 py-0.5 rounded font-mono text-[11px]">bweb_1t_...csv</code>). Os arquivos grandes são processados em streaming ultra-rápido.
                </p>

                <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Escolher Arquivo CSV do TSE</span>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-surface border border-outline-variant rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-600">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-on-surface">{fileName}</span>
                      <p className="text-[11px] text-on-surface-variant font-mono">
                        Tamanho: {fileSizeFormatted} • {parseSummary?.totalSecoes || 0} seções catalogadas
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetFile}
                    disabled={isProcessing}
                    className="text-xs font-semibold text-error hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Trocar arquivo
                  </button>
                </div>

                {/* Barra de Progresso / Streaming */}
                {isProcessing && (
                  <div className="space-y-1.5 pt-1 border-t border-outline-variant/40">
                    <div className="flex items-center justify-between text-[11px] text-secondary font-bold">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {progressStatus || 'Processando arquivo em tempo real...'}
                      </span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-secondary h-full transition-all duration-150"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PASSO 3: Resultados e Prévia da Extração */}
          {parseSummary && !isProcessing && (
            <div className="space-y-3 pt-1">
              {/* Alerta se o candidato não foi informado ou não teve votos */}
              {!hasCandidateNumber ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-start gap-2.5 text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Nenhum número de candidato foi informado no Passo 1.</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Para filtrar os votos, digite o número do candidato acima ou selecione um dos candidatos mais votados detectados no arquivo:
                    </p>
                    {parseSummary.detectedOtherCandidates.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {parseSummary.detectedOtherCandidates.slice(0, 8).map((cand) => (
                          <button
                            key={cand.numero}
                            type="button"
                            onClick={async () => {
                              setTargetNumber(cand.numero);
                              if (selectedFile) {
                                await processFile(selectedFile, cand.numero, municipioFilter);
                              }
                            }}
                            className="px-2 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <span className="font-mono font-bold text-secondary">{cand.numero}</span>
                            <span className="truncate max-w-[120px] font-semibold">{cand.nome}</span>
                            <span className="text-[10px] text-on-surface-variant">({cand.totalVotos} v.)</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : preparedRows.length === 0 ? (
                <div className="p-4 bg-surface-container rounded-xl text-center space-y-1">
                  <p className="text-xs font-bold text-on-surface">
                    Nenhum voto localizado para o número &quot;{targetNumber}&quot;
                  </p>
                  <p className="text-[11px] text-on-surface-variant">
                    Verifique se o número foi digitado corretamente ou se o filtro de município ({municipioFilter || 'nenhum'}) está correto.
                  </p>
                </div>
              ) : (
                <>
                  {/* Resumo do Candidato Encontrado */}
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                          {targetNumber}
                        </span>
                        <span className="font-bold text-xs text-emerald-950">
                          {parseSummary.candidatoNome || 'Candidato'}
                        </span>
                        {parseSummary.candidatoCargo && (
                          <span className="text-[10px] bg-white text-emerald-900 border border-emerald-300 px-1.5 py-0.5 rounded font-medium">
                            {parseSummary.candidatoCargo}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-emerald-800 mt-1">
                        ✓ Extração direta realizada com sucesso em uma única passagem pelo arquivo.
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-emerald-800 uppercase font-bold block">Total de Votos</span>
                      <span className="text-lg font-black text-emerald-950 font-mono">
                        {parseSummary.totalVotosCandidato.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Cards de Métricas Cruzadas */}
                  {stats && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2 p-3 bg-surface-container rounded-xl text-xs">
                        <div>
                          <p className="text-[10px] text-on-surface-variant uppercase font-bold">Seções no Arquivo</p>
                          <p className="text-sm sm:text-base font-black text-on-surface mt-0.5">{stats.totalSecoes} seções</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-secondary uppercase font-bold">Total Votos Arquivo</p>
                          <p className="text-sm sm:text-base font-black text-secondary mt-0.5">{stats.totalVotos.toLocaleString('pt-BR')} votos</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-700 uppercase font-bold">Cruzamento com a Base</p>
                          <p className="text-sm sm:text-base font-black text-emerald-700 mt-0.5">
                            {stats.matchingRegistered} seções ({stats.taxaMatch}%)
                          </p>
                        </div>
                      </div>

                      {stats.eleitoresCadastradosCruzados > 0 && (
                        <div className="grid grid-cols-3 gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs">
                          <div>
                            <p className="text-[10px] text-emerald-900 uppercase font-bold">Eleitores na Sua Base</p>
                            <p className="text-sm sm:text-base font-black text-emerald-950 mt-0.5">
                              {stats.eleitoresCadastradosCruzados.toLocaleString('pt-BR')} eleitores
                            </p>
                            <p className="text-[10px] text-emerald-800">nas seções encontradas</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-emerald-900 uppercase font-bold">Votos Reais nas Seções</p>
                            <p className="text-sm sm:text-base font-black text-emerald-950 mt-0.5">
                              {stats.votosEmSecoesCadastradas.toLocaleString('pt-BR')} votos
                            </p>
                            <p className="text-[10px] text-emerald-800">apurados nessas seções</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-emerald-900 uppercase font-bold">Cumprimento da Base</p>
                            <p className={`text-sm sm:text-base font-black mt-0.5 ${
                              stats.taxaCumprimentoBase >= 100 ? 'text-emerald-700' : 'text-amber-700'
                            }`}>
                              {stats.taxaCumprimentoBase}%
                            </p>
                            <p className="text-[10px] text-emerald-800">
                              {stats.votosEmSecoesCadastradas >= stats.eleitoresCadastradosCruzados
                                ? `+${stats.votosEmSecoesCadastradas - stats.eleitoresCadastradosCruzados} votos saldo`
                                : `${stats.votosEmSecoesCadastradas - stats.eleitoresCadastradosCruzados} votos saldo`}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prévia das Primeiras Seções Extraídas */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold text-on-surface">
                        Prévia dos Votos por Seção (Primeiras 6):
                      </p>
                      <span className="text-[10px] text-on-surface-variant font-mono">
                        {preparedRows.length} seções no total
                      </span>
                    </div>
                    <div className="border border-outline-variant/50 rounded-xl overflow-hidden max-h-40 overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-surface-container-low text-on-surface-variant text-[11px] font-semibold sticky top-0">
                          <tr>
                            <th className="py-1.5 px-3">Zona</th>
                            <th className="py-1.5 px-3">Seção</th>
                            <th className="py-1.5 px-3">Município</th>
                            <th className="py-1.5 px-3 text-right">Votos Apurados</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/30">
                          {preparedRows.slice(0, 6).map((r, i) => (
                            <tr key={i} className="hover:bg-surface-container-low">
                              <td className="py-1.5 px-3 font-medium">{r.zona}</td>
                              <td className="py-1.5 px-3 font-mono font-bold">{r.secao}</td>
                              <td className="py-1.5 px-3 text-on-surface-variant">{r.municipio || '-'}</td>
                              <td className="py-1.5 px-3 text-right font-black text-secondary">{r.votos}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-surface border-t border-outline-variant/60 flex items-center justify-between">
          <div className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Processamento local no navegador</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isProcessing}
              className="px-3.5 py-1.5 border border-outline-variant rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isSaving || isProcessing || !preparedRows.length}
              className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Gravando no Banco...' : `Confirmar e Importar ${preparedRows.length} Seções`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
