'use client';

import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  X,
  Vote,
  Check,
  Building
} from 'lucide-react';
import { parseTseCsvFile } from '@/lib/tseBuParser';

interface TseCsvImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportBatch: (
    items: Array<{ zona: string; secao: string; votosApurados: number; boletimUrna?: string }>
  ) => Promise<void>;
  registeredSectionsKeys: Set<string>;
}

export function TseCsvImporterModal({
  isOpen,
  onClose,
  onImportBatch,
  registeredSectionsKeys
}: TseCsvImporterModalProps) {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [targetNumber, setTargetNumber] = useState<string>('');
  const [municipioFilter, setMunicipioFilter] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Parse do arquivo carregado
  const parseResult = useMemo(() => {
    if (!fileContent) return null;
    return parseTseCsvFile(fileContent, targetNumber, municipioFilter);
  }, [fileContent, targetNumber, municipioFilter]);

  // Seções filtradas prontas para importação
  const preparedRows = useMemo(() => {
    if (!parseResult) return [];
    if (!targetNumber.trim()) return [];
    return parseResult.rows;
  }, [parseResult, targetNumber]);

  // Estatísticas de correspondência com a base cadastrada
  const stats = useMemo(() => {
    if (!preparedRows.length) return null;

    let totalVotos = 0;
    let matchingRegistered = 0;

    preparedRows.forEach((r) => {
      totalVotos += r.votos;
      const keyZ = String(parseInt(r.zona.replace(/\D/g, '') || '0', 10));
      const keyS = String(parseInt(r.secao.replace(/\D/g, '') || '0', 10));
      const secKey = `z${keyZ}_s${keyS}`;
      if (registeredSectionsKeys.has(secKey)) {
        matchingRegistered++;
      }
    });

    return {
      totalSecoes: preparedRows.length,
      totalVotos,
      matchingRegistered,
      taxaMatch: Math.round((matchingRegistered / Math.max(1, registeredSectionsKeys.size)) * 100)
    };
  }, [preparedRows, registeredSectionsKeys]);

  // Manipulador de upload de arquivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setFileContent(text);
    };
    reader.onerror = () => {
      alert('Erro ao ler o arquivo CSV');
    };
    reader.readAsText(file, 'ISO-8859-1'); // TSE costuma exportar em ISO-8859-1 (Latin1) ou UTF-8
  };

  // Confirmar e Importar
  const handleConfirmImport = async () => {
    if (!preparedRows.length) return;
    setIsSaving(true);

    try {
      const items = preparedRows.map((r) => ({
        zona: r.zona,
        secao: r.secao,
        votosApurados: r.votos,
        boletimUrna: `TSE CSV ${fileName} (Cand: ${targetNumber})`
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

  if (!isOpen) return null;

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
                Carregue o arquivo CSV de Boletins de Urna baixado do TSE e extraia os votos em segundos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* 1. Área de Upload do Arquivo */}
          {!fileContent ? (
            <div className="border-2 border-dashed border-outline-variant hover:border-secondary rounded-2xl p-6 text-center bg-surface-container-low/40 transition-colors">
              <Upload className="w-10 h-10 text-secondary mx-auto mb-2 opacity-80" />
              <p className="text-sm font-bold text-on-surface">
                Selecione o arquivo CSV de Boletim de Urna
              </p>
              <p className="text-xs text-on-surface-variant mt-1 max-w-md mx-auto">
                Arquivo padrão do TSE (<code className="bg-surface-container px-1 py-0.5 rounded">bweb_1t_...csv</code> ou similar baixado do Portal de Resultados).
              </p>
              <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary hover:bg-secondary rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Escolher Arquivo do Computador</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold text-emerald-950">{fileName}</span>
                  <p className="text-[11px] text-emerald-800">
                    Arquivo carregado com sucesso • {parseResult?.totalSecoes || 0} seções detectadas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFileContent(null);
                  setFileName('');
                  setTargetNumber('');
                }}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
              >
                Trocar arquivo
              </button>
            </div>
          )}

          {/* 2. Seleção / Filtro do Candidato */}
          {fileContent && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1">
                    Número do Seu Candidato na Urna
                  </label>
                  <div className="relative">
                    <Vote className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      type="text"
                      placeholder="Ex: 12345 ou 15..."
                      value={targetNumber}
                      onChange={(e) => setTargetNumber(e.target.value)}
                      className="w-full h-10 border border-outline-variant rounded-xl pl-9 pr-3 text-xs bg-surface text-on-surface font-mono font-bold focus:outline-none focus:border-secondary"
                    />
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    O sistema extrairá apenas os votos deste número em cada seção.
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
                      placeholder="Ex: Teresina..."
                      value={municipioFilter}
                      onChange={(e) => setMunicipioFilter(e.target.value)}
                      className="w-full h-10 border border-outline-variant rounded-xl pl-9 pr-3 text-xs bg-surface text-on-surface focus:outline-none focus:border-secondary"
                    />
                  </div>
                </div>
              </div>

              {/* Candidatos Sugeridos Detectados no Arquivo */}
              {parseResult && parseResult.detectedCandidates.length > 0 && !targetNumber && (
                <div>
                  <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                    Candidatos mais votados encontrados no arquivo (Clique para selecionar):
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-1">
                    {parseResult.detectedCandidates.slice(0, 10).map((cand) => (
                      <button
                        key={cand.numero}
                        type="button"
                        onClick={() => setTargetNumber(cand.numero)}
                        className="px-2.5 py-1.5 rounded-lg border border-outline-variant/60 bg-surface hover:bg-secondary/10 hover:border-secondary text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span className="font-mono font-black text-secondary">{cand.numero}</span>
                        <span className="font-semibold text-on-surface truncate max-w-[130px]">{cand.nome}</span>
                        <span className="text-[10px] text-on-surface-variant font-mono">({cand.totalVotos.toLocaleString()} v.)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Estatísticas e Prévia da Importação */}
              {stats && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-3 gap-2 p-3 bg-surface-container rounded-xl text-xs">
                    <div>
                      <p className="text-[10px] text-on-surface-variant uppercase font-bold">Seções Encontradas</p>
                      <p className="text-base font-black text-on-surface mt-0.5">{stats.totalSecoes} seções</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-secondary uppercase font-bold">Total de Votos</p>
                      <p className="text-base font-black text-secondary mt-0.5">{stats.totalVotos.toLocaleString()} votos</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-emerald-700 uppercase font-bold">Batem com sua Base</p>
                      <p className="text-base font-black text-emerald-700 mt-0.5">
                        {stats.matchingRegistered} seções ({stats.taxaMatch}%)
                      </p>
                    </div>
                  </div>

                  {/* Prévia das Primeiras Linhas */}
                  <div>
                    <p className="text-xs font-bold text-on-surface mb-1">
                      Prévia dos Votos por Seção (Exibindo 6 primeiras):
                    </p>
                    <div className="border border-outline-variant/50 rounded-xl overflow-hidden max-h-36 overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-surface-container-low text-on-surface-variant text-[11px] font-semibold">
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
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-surface border-t border-outline-variant/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 border border-outline-variant rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={isSaving || !preparedRows.length}
            className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Gravando no Banco...' : `Confirmar e Importar ${preparedRows.length} Seções`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
