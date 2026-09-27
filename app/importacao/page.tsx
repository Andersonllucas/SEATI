'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  UploadCloud,
  Download,
  Play,
  FileText,
  Users,
  MapPin,
  Receipt,
  TableProperties,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  RefreshCw,
  ArrowRight,
  Database,
  Trash2,
  Layers
} from 'lucide-react';
import { useCampaignData } from '@/context/CampaignContext';
import {
  downloadTemplate,
  parseSpreadsheetFile,
  exportVotersReal,
  exportLiderancasReal,
  exportLocaisReal,
  exportConflitosReal,
  ParsedVoterRow,
  ParsedLeaderRow,
  ParsedLocalRow,
  formatCpf
} from '@/lib/importExportUtils';

type ImportTarget = 'eleitores' | 'liderancas' | 'locais';

export default function Importacao() {
  const {
    eleitores,
    liderancas,
    locais,
    cpfConflictGroups,
    conflictingVoterIds,
    totalEleitores,
    totalLiderancasAtivas,
    totalConflitos,
    cleanCpf,
    batchImportEleitores,
    batchImportLiderancas,
    batchSaveLocais
  } = useCampaignData();

  // Selected Target for Template & Import
  const [importTarget, setImportTarget] = useState<ImportTarget>('eleitores');

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<{
    rows: any[];
    totalRawRows: number;
    validCount: number;
    invalidCount: number;
    sheetName: string;
  } | null>(null);

  // Strategy for duplicates (only applicable for eleitores)
  const [duplicateStrategy, setDuplicateStrategy] = useState<'include' | 'skip'>('include');

  // Import Execution State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  // Export Feedback state
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  // Drag & drop highlight
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Existing CPFs in database for pre-checking
  const existingCpfsSet = useMemo(() => {
    const set = new Set<string>();
    eleitores.forEach((e) => {
      const clean = cleanCpf(e.cpf);
      if (clean) set.add(clean);
    });
    return set;
  }, [eleitores, cleanCpf]);

  // Tecla ESC para fechar pré-visualização de arquivo importado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedFile && !isImporting) {
          setSelectedFile(null);
          setParsedData(null);
          setParseError(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, isImporting]);

  // Handle file selection
  const handleFile = async (file: File) => {
    setParseError(null);
    setImportSuccessMessage(null);
    setSelectedFile(file);
    setIsParsing(true);

    try {
      const result = await parseSpreadsheetFile(file, importTarget);
      setParsedData(result);
    } catch (err: any) {
      console.error('Erro ao processar planilha:', err);
      setParseError(err.message || 'Falha ao processar o arquivo. Verifique se o formato é válido (.xlsx, .xls ou .csv).');
      setParsedData(null);
    } finally {
      setIsParsing(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFile(file);
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const handleResetImport = () => {
    setSelectedFile(null);
    setParsedData(null);
    setParseError(null);
    setImportProgress(null);
    setImportSuccessMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Start Real Batch Import
  const handleStartImport = async () => {
    if (!parsedData || parsedData.rows.length === 0 || isImporting) return;
    setIsImporting(true);
    setParseError(null);
    setImportSuccessMessage(null);

    try {
      if (importTarget === 'eleitores') {
        const voterRows = parsedData.rows as ParsedVoterRow[];
        const validRows = voterRows.filter((r) => r.isValid);

        let finalRows = validRows;
        if (duplicateStrategy === 'skip') {
          finalRows = validRows.filter((r) => !existingCpfsSet.has(r.cleanCpf));
        }

        if (finalRows.length === 0) {
          throw new Error('Nenhum registro válido para importar após a aplicação dos filtros.');
        }

        setImportProgress({ done: 0, total: finalRows.length });

        const toInsert = finalRows.map((r) => ({
          nome: r.nome,
          cpf: r.cpf,
          telefone: r.telefone,
          tituloEleitor: r.tituloEleitor || '',
          zona: r.zona,
          secao: r.secao,
          bairro: r.bairro,
          lideranca: r.lideranca,
          status: 'Pendente de confirmação'
        }));

        await batchImportEleitores(toInsert, (done, total) => {
          setImportProgress({ done, total });
        });

        setImportSuccessMessage(
          `${finalRows.length} eleitores foram gravados com sucesso na base oficial do Firestore!`
        );
      } else if (importTarget === 'liderancas') {
        const leaderRows = (parsedData.rows as ParsedLeaderRow[]).filter((r) => r.isValid);
        if (leaderRows.length === 0) {
          throw new Error('Nenhuma liderança válida encontrada para importação.');
        }

        setImportProgress({ done: 0, total: leaderRows.length });

        const toInsert = leaderRows.map((r) => ({
          nome: r.nome,
          tipo: r.tipo,
          liderancaPaiNome: r.liderancaPaiNome,
          telefone: r.telefone,
          email: r.email,
          regiao: r.regiao,
          bairro: r.bairro,
          metaVotos: r.metaVotos,
          status: r.status,
          observacoes: r.observacoes
        }));

        await batchImportLiderancas(toInsert, (done, total) => {
          setImportProgress({ done, total });
        });

        setImportSuccessMessage(
          `${leaderRows.length} lideranças foram registradas com sucesso no banco de dados!`
        );
      } else {
        // Locais
        const localRows = (parsedData.rows as ParsedLocalRow[]).filter((r) => r.isValid);
        if (localRows.length === 0) {
          throw new Error('Nenhum local de votação válido encontrado para importação.');
        }

        setImportProgress({ done: 0, total: localRows.length });

        const toCreate = localRows.map((r) => ({
          nome: r.nome,
          tipo: r.tipo,
          zona: r.zona,
          secoes: r.secoes,
          bairro: r.bairro,
          endereco: r.endereco,
          capacidadeAprox: r.capacidadeAprox,
          municipio: r.municipio,
          uf: r.uf
        }));

        await batchSaveLocais(toCreate, []);

        setImportSuccessMessage(
          `${localRows.length} locais de votação foram salvos com sucesso na campanha!`
        );
      }

      // Reset file selection after success
      setSelectedFile(null);
      setParsedData(null);
    } catch (err: any) {
      console.error('Erro na importação em lote:', err);
      setParseError(err.message || 'Erro inesperado ao salvar registros no banco de dados.');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  // Trigger real exports
  const handleExport = (type: 'eleitores' | 'liderancas' | 'locais' | 'conflitos', format: 'xlsx' | 'csv' | 'pdf') => {
    try {
      if (type === 'eleitores') {
        exportVotersReal(eleitores, conflictingVoterIds, format);
        setExportFeedback(`Exportação de ${eleitores.length} eleitores iniciada (${format.toUpperCase()})`);
      } else if (type === 'liderancas') {
        exportLiderancasReal(liderancas, eleitores, format);
        setExportFeedback(`Exportação de ${liderancas.length} lideranças iniciada (${format.toUpperCase()})`);
      } else if (type === 'locais') {
        exportLocaisReal(locais, eleitores, format);
        setExportFeedback(`Exportação de ${locais.length} locais de votação iniciada (${format.toUpperCase()})`);
      } else if (type === 'conflitos') {
        exportConflitosReal(cpfConflictGroups, format);
        setExportFeedback(`Exportação de ${totalConflitos} conflitos iniciada (${format.toUpperCase()})`);
      }
      setTimeout(() => setExportFeedback(null), 4000);
    } catch (err) {
      console.error('Erro ao exportar:', err);
      setExportFeedback('Erro ao gerar arquivo de exportação.');
    }
  };

  // Calculate stats of parsed voters against database
  const previewVotersStats = useMemo(() => {
    if (!parsedData || importTarget !== 'eleitores') return null;
    const voterRows = parsedData.rows as ParsedVoterRow[];
    let alreadyInDb = 0;
    let spreadsheetDuplicates = 0;
    const seenInSpreadsheet = new Set<string>();

    voterRows.forEach((r) => {
      if (r.cleanCpf) {
        if (existingCpfsSet.has(r.cleanCpf)) {
          alreadyInDb++;
        }
        if (seenInSpreadsheet.has(r.cleanCpf)) {
          spreadsheetDuplicates++;
        } else {
          seenInSpreadsheet.add(r.cleanCpf);
        }
      }
    });

    return { alreadyInDb, spreadsheetDuplicates };
  }, [parsedData, importTarget, existingCpfsSet]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto flex-1 flex flex-col">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-surface-container text-secondary tracking-wider">
              Módulo de Integração de Dados
            </span>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded">
              <Database className="w-3 h-3 text-secondary" /> Firestore Conectado
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-on-surface mt-2 tracking-tight">
            Central de Importação e Exportação
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Importe listas de modelos oficiais (.xlsx e .csv) para o banco de dados e exporte relatórios consolidados em tempo real.
          </p>
        </div>

        {/* Live Database Snapshot Counters */}
        <div className="flex items-center gap-3 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/50 self-start md:self-auto shadow-xs">
          <div className="px-3 py-1 text-center border-r border-outline-variant/40">
            <span className="block text-xs font-semibold text-on-surface-variant">Eleitores</span>
            <span className="text-sm font-bold text-on-surface">{totalEleitores.toLocaleString('pt-BR')}</span>
          </div>
          <div className="px-3 py-1 text-center border-r border-outline-variant/40">
            <span className="block text-xs font-semibold text-on-surface-variant">Lideranças</span>
            <span className="text-sm font-bold text-on-surface">{totalLiderancasAtivas}</span>
          </div>
          <div className="px-3 py-1 text-center border-r border-outline-variant/40">
            <span className="block text-xs font-semibold text-on-surface-variant">Locais</span>
            <span className="text-sm font-bold text-on-surface">{locais.length}</span>
          </div>
          <div className="px-3 py-1 text-center">
            <span className="block text-xs font-semibold text-on-surface-variant">Conflitos</span>
            <span className={`text-sm font-bold ${totalConflitos > 0 ? 'text-error' : 'text-on-surface'}`}>
              {totalConflitos}
            </span>
          </div>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {exportFeedback && (
        <div className="p-3.5 rounded-lg bg-secondary-container/20 border border-secondary/40 text-on-surface flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <CheckCircle2 className="w-5 h-5 text-secondary shrink-0" />
            <span>{exportFeedback}</span>
          </div>
          <button
            onClick={() => setExportFeedback(null)}
            className="text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {importSuccessMessage && (
        <div className="p-4 rounded-xl bg-primary-container/10 border border-secondary/30 text-on-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-secondary/15 flex items-center justify-center text-secondary shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-on-surface">Importação Concluída com Sucesso!</h4>
              <p className="text-xs text-on-surface-variant mt-0.5">{importSuccessMessage}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={importTarget === 'eleitores' ? '/eleitores' : importTarget === 'liderancas' ? '/liderancas' : '/locais'}
              prefetch={true}
              className="px-3 py-1.5 bg-primary text-on-primary rounded text-xs font-bold hover:bg-secondary transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              Ver Registros <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={handleResetImport}
              className="px-3 py-1.5 border border-outline-variant/60 rounded text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Import (Left) and Export (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================= */}
        {/* LEFT COLUMN: REAL IMPORT MODULE (7 Cols)                  */}
        {/* ========================================================= */}
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl border border-outline-variant/70 shadow-sm flex flex-col overflow-hidden">
          {/* Header & Target Selector */}
          <div className="p-4 sm:p-5 border-b border-outline-variant/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-lowest">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 text-on-surface">
                <UploadCloud className="w-5 h-5 text-secondary" /> Importador de Dados Oficiais
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Envie listas de eleitores, lideranças ou locais com gravação direta no banco.
              </p>
            </div>

            {/* Target Entity Switcher */}
            <div className="flex items-center p-1 bg-surface-container-low rounded-lg border border-outline-variant/40 self-start sm:self-auto">
              <button
                onClick={() => {
                  setImportTarget('eleitores');
                  handleResetImport();
                }}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  importTarget === 'eleitores'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Eleitores
              </button>
              <button
                onClick={() => {
                  setImportTarget('liderancas');
                  handleResetImport();
                }}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  importTarget === 'liderancas'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Lideranças
              </button>
              <button
                onClick={() => {
                  setImportTarget('locais');
                  handleResetImport();
                }}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  importTarget === 'locais'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Locais
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-6">
            {/* ETAPA 1: Download do Modelo Padronizado */}
            <div className="p-4 rounded-lg bg-surface-container-low/40 border border-outline-variant/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <h3 className="font-semibold text-sm text-on-surface">
                    Baixar Modelo Padronizado de {importTarget === 'eleitores' ? 'Eleitores' : importTarget === 'liderancas' ? 'Lideranças' : 'Locais'}
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Utilize a planilha com colunas pré-formatadas para garantir compatibilidade perfeita.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 pl-9 sm:pl-0">
                <button
                  type="button"
                  onClick={() => downloadTemplate(importTarget, 'xlsx')}
                  className="px-3 py-1.5 border border-outline-variant/70 bg-surface-container-lowest rounded text-xs font-semibold text-on-surface hover:bg-surface-container flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Baixar planilha modelo em formato Excel (.xlsx)"
                >
                  <TableProperties className="w-3.5 h-3.5 text-secondary" /> Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => downloadTemplate(importTarget, 'csv')}
                  className="px-3 py-1.5 border border-outline-variant/70 bg-surface-container-lowest rounded text-xs font-semibold text-on-surface hover:bg-surface-container flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Baixar modelo em formato CSV (.csv)"
                >
                  <Receipt className="w-3.5 h-3.5 text-secondary" /> CSV (.csv)
                </button>
              </div>
            </div>

            {/* ETAPA 2: Área de Upload (Drag and Drop & File Input) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs flex items-center justify-center font-bold">
                    2
                  </span>
                  <h3 className="font-semibold text-sm text-on-surface">Upload da Planilha Preenchida</h3>
                </div>
                {selectedFile && (
                  <button
                    onClick={handleResetImport}
                    className="text-xs font-semibold text-error hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remover Arquivo
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFile(e.target.files[0]);
                  }
                }}
                className="hidden"
                id="spreadsheet-upload-input"
              />

              {!selectedFile ? (
                <div
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                    isDragOver
                      ? 'border-secondary bg-secondary-container/20 scale-[0.99]'
                      : 'border-outline-variant/70 bg-surface-container-low/20 hover:border-secondary hover:bg-surface-container-low/50'
                  }`}
                >
                  <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center mb-3">
                    <UploadCloud className="w-7 h-7 text-secondary" />
                  </div>
                  <p className="text-sm font-semibold text-on-surface">
                    Arraste sua planilha aqui ou <span className="text-secondary underline">clique para selecionar</span>
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1.5">
                    Formatos suportados: .xlsx, .xls, .csv (até 50MB)
                  </p>
                  <div className="flex items-center gap-2 mt-4 text-[11px] text-on-surface-variant bg-surface-container-lowest px-3 py-1 rounded-full border border-outline-variant/40">
                    <Layers className="w-3 h-3 text-secondary" />
                    <span>Mapeamento inteligente de colunas (Nome, CPF, Telefone, Zona, Seção)</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-secondary/40 bg-secondary-container/10 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-secondary shrink-0">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{selectedFile.name}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {(selectedFile.size / 1024).toFixed(1)} KB • {parsedData ? `${parsedData.totalRawRows} linhas detectadas` : 'Processando...'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-surface-container-lowest border border-outline-variant/60 rounded text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors shrink-0 cursor-pointer"
                  >
                    Trocar Arquivo
                  </button>
                </div>
              )}
            </div>

            {/* Parsing Spinner */}
            {isParsing && (
              <div className="p-4 rounded-lg bg-surface-container-low/40 border border-outline-variant/40 flex items-center justify-center gap-3 text-sm text-on-surface-variant">
                <RefreshCw className="w-4 h-4 animate-spin text-secondary" />
                <span>Lendo dados e validando colunas da planilha...</span>
              </div>
            )}

            {/* Error Message */}
            {parseError && (
              <div className="p-4 rounded-lg bg-error-container/20 border border-error/40 text-on-surface flex items-start gap-3 text-xs">
                <XCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-error">Erro ao processar planilha</p>
                  <p className="text-on-surface-variant mt-1">{parseError}</p>
                </div>
              </div>
            )}

            {/* ETAPA 3: Validação e Pré-visualização da Planilha */}
            {parsedData && (
              <div className="space-y-4 pt-2 border-t border-outline-variant/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs flex items-center justify-center font-bold">
                      3
                    </span>
                    <h3 className="font-semibold text-sm text-on-surface">Validação e Pré-visualização</h3>
                  </div>

                  {/* Summary Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded bg-surface-container-low text-xs font-semibold text-on-surface border border-outline-variant/40">
                      Total: <strong className="text-on-surface">{parsedData.totalRawRows}</strong>
                    </span>
                    <span className="px-2.5 py-1 rounded bg-secondary-container/20 text-xs font-semibold text-secondary border border-secondary/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {parsedData.validCount} Válidos
                    </span>
                    {parsedData.invalidCount > 0 && (
                      <span className="px-2.5 py-1 rounded bg-error-container/20 text-xs font-semibold text-error border border-error/30 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> {parsedData.invalidCount} Inválidos
                      </span>
                    )}
                  </div>
                </div>

                {/* Duplication Alerts for Eleitores */}
                {importTarget === 'eleitores' && previewVotersStats && (
                  <div className="p-3.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/50 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-on-surface flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-secondary" /> Verificação de CPFs com a Base Atual:
                      </span>
                      <span className="text-on-surface-variant">
                        {previewVotersStats.alreadyInDb} já constam no banco
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1 border-t border-outline-variant/30 text-xs">
                      <span className="text-on-surface-variant font-medium">Ação para CPFs já existentes:</span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="dupStrategy"
                            checked={duplicateStrategy === 'include'}
                            onChange={() => setDuplicateStrategy('include')}
                            className="text-secondary focus:ring-secondary"
                          />
                          <span className="text-on-surface font-medium">
                            Cadastrar e sinalizar conflito
                          </span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="dupStrategy"
                            checked={duplicateStrategy === 'skip'}
                            onChange={() => setDuplicateStrategy('skip')}
                            className="text-secondary focus:ring-secondary"
                          />
                          <span className="text-on-surface font-medium">
                            Descartar duplicados ({previewVotersStats.alreadyInDb})
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview Table of parsed rows (first 5 rows) */}
                <div className="border border-outline-variant/60 rounded-lg overflow-hidden bg-surface-container-lowest">
                  <div className="p-2.5 bg-surface-container-low/30 border-b border-outline-variant/40 flex items-center justify-between text-xs font-semibold text-on-surface-variant">
                    <span>Amostra dos Dados Detectados (primeiros 5 registros)</span>
                    <span>Aba: &quot;{parsedData.sheetName}&quot;</span>
                  </div>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-surface-container-low text-on-surface-variant uppercase font-semibold border-b border-outline-variant/40">
                        <tr>
                          <th className="px-3 py-2 w-12">Linha</th>
                          <th className="px-3 py-2">Nome</th>
                          {importTarget === 'eleitores' && (
                            <>
                              <th className="px-3 py-2">CPF</th>
                              <th className="px-3 py-2">Telefone</th>
                              <th className="px-3 py-2">Título</th>
                              <th className="px-3 py-2">Zona / Seção</th>
                              <th className="px-3 py-2">Liderança</th>
                            </>
                          )}
                          {importTarget === 'liderancas' && (
                            <>
                              <th className="px-3 py-2">Tipo</th>
                              <th className="px-3 py-2">Região</th>
                              <th className="px-3 py-2">Meta Votos</th>
                            </>
                          )}
                          {importTarget === 'locais' && (
                            <>
                              <th className="px-3 py-2">Tipo</th>
                              <th className="px-3 py-2">Zona</th>
                              <th className="px-3 py-2">Seções</th>
                              <th className="px-3 py-2">Capacidade</th>
                            </>
                          )}
                          <th className="px-3 py-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/30">
                        {parsedData.rows.slice(0, 5).map((row: any, i: number) => {
                          const isCpfInDb =
                            importTarget === 'eleitores' &&
                            row.cleanCpf &&
                            existingCpfsSet.has(row.cleanCpf);

                          return (
                            <tr key={i} className="hover:bg-surface-container-low/30">
                              <td className="px-3 py-2 text-on-surface-variant font-mono">{row.originalIndex}</td>
                              <td className="px-3 py-2 font-semibold text-on-surface">{row.nome || '-'}</td>
                              {importTarget === 'eleitores' && (
                                <>
                                  <td className="px-3 py-2 font-mono">
                                    {formatCpf(row.cpf)}
                                    {isCpfInDb && (
                                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-error-container/20 text-error font-bold">
                                        Existe no Banco
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-on-surface-variant">{row.telefone || '-'}</td>
                                  <td className="px-3 py-2 font-mono text-on-surface-variant">{row.tituloEleitor || '-'}</td>
                                  <td className="px-3 py-2 text-on-surface-variant">
                                    ZE {row.zona} / Sec {row.secao || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-on-surface-variant">{row.lideranca}</td>
                                </>
                              )}
                              {importTarget === 'liderancas' && (
                                <>
                                  <td className="px-3 py-2 text-on-surface-variant">{row.tipo}</td>
                                  <td className="px-3 py-2 text-on-surface-variant">{row.regiao}</td>
                                  <td className="px-3 py-2 font-bold text-on-surface">{row.metaVotos}</td>
                                </>
                              )}
                              {importTarget === 'locais' && (
                                <>
                                  <td className="px-3 py-2 text-on-surface-variant">{row.tipo}</td>
                                  <td className="px-3 py-2 text-on-surface-variant">ZE {row.zona}</td>
                                  <td className="px-3 py-2 text-on-surface-variant font-mono">
                                    {row.secoes?.length || 0} seções
                                  </td>
                                  <td className="px-3 py-2 font-bold text-on-surface">
                                    {row.capacidadeAprox?.toLocaleString?.('pt-BR') || 0}
                                  </td>
                                </>
                              )}
                              <td className="px-3 py-2 text-right">
                                {row.isValid ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Apto
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-error"
                                    title={row.errors?.join(', ')}
                                  >
                                    <XCircle className="w-3.5 h-3.5" /> {row.errors?.[0] || 'Inválido'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Action Footer with Progress Bar */}
          <div className="p-4 sm:p-5 bg-surface-container-low/30 border-t border-outline-variant/60 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="w-full sm:w-auto">
              {isImporting && importProgress ? (
                <div className="space-y-1 w-full sm:w-64">
                  <div className="flex justify-between text-xs font-semibold text-on-surface">
                    <span>Gravando no Firestore...</span>
                    <span>
                      {importProgress.done} de {importProgress.total} ({Math.round((importProgress.done / (importProgress.total || 1)) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                    <div
                      className="h-full bg-secondary transition-all duration-200"
                      style={{
                        width: `${Math.round((importProgress.done / (importProgress.total || 1)) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              ) : (
                <span className="text-xs text-on-surface-variant flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-secondary" />
                  {parsedData
                    ? `${parsedData.validCount} registros prontos para gravação direta`
                    : 'Aguardando arquivo para iniciar importação'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              {selectedFile && !isImporting && (
                <button
                  type="button"
                  onClick={handleResetImport}
                  className="px-4 py-2 border border-outline-variant/70 rounded text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              )}

              <button
                type="button"
                disabled={!parsedData || parsedData.validCount === 0 || isImporting}
                onClick={handleStartImport}
                className="w-full sm:w-auto px-6 py-2.5 bg-primary text-on-primary rounded font-semibold flex items-center justify-center gap-2 shadow-xs hover:bg-secondary transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Importando...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" /> Iniciar Importação
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: REAL EXPORT MODULE (5 Cols)                 */}
        {/* ========================================================= */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/70 shadow-sm p-4 sm:p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4 border-b border-outline-variant/40 pb-4">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-on-surface">
                  <Download className="w-5 h-5 text-secondary" /> Exportação de Relatórios
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Dados consolidados e atualizados diretamente do Firestore.
                </p>
              </div>
            </div>

            {/* Real Export Cards */}
            <div className="space-y-3.5">
              {/* Card 1: Eleitores */}
              <ExportCardItem
                title="Completo de Eleitores Ativos"
                description="Listagem completa com CPF, telefone, zona, seção, liderança e status eleitoral."
                icon={FileText}
                meta={`${totalEleitores.toLocaleString('pt-BR')} Eleitores`}
                color="bg-primary-container text-on-primary"
                onExportPdf={() => handleExport('eleitores', 'pdf')}
                onExportExcel={() => handleExport('eleitores', 'xlsx')}
                onExportCsv={() => handleExport('eleitores', 'csv')}
              />

              {/* Card 2: Lideranças */}
              <ExportCardItem
                title="Lista por Liderança & Sub"
                description="Estrutura hierárquica, metas de votos estipuladas, captação real e percentual atingido."
                icon={Users}
                meta={`${liderancas.length} Lideranças`}
                color="bg-secondary-container text-on-secondary-container"
                onExportPdf={() => handleExport('liderancas', 'pdf')}
                onExportExcel={() => handleExport('liderancas', 'xlsx')}
                onExportCsv={() => handleExport('liderancas', 'csv')}
              />

              {/* Card 3: Locais de Votação */}
              <ExportCardItem
                title="Mapeamento de Locais & Fiscais"
                description="Colégios eleitorais, seções agregadas, capacidade aproximada e eleitores mapeados."
                icon={MapPin}
                meta={`${locais.length} Colégios`}
                color="bg-surface-container text-on-surface"
                onExportPdf={() => handleExport('locais', 'pdf')}
                onExportExcel={() => handleExport('locais', 'xlsx')}
                onExportCsv={() => handleExport('locais', 'csv')}
              />

              {/* Card 4: Conflitos de CPF */}
              <ExportCardItem
                title="Relatório de Conflitos de CPF"
                description="Eleitores disputados por duas ou mais lideranças para alinhamento e conciliação."
                icon={AlertTriangle}
                meta={`${totalConflitos} Conflitos`}
                color={totalConflitos > 0 ? 'bg-error-container text-error' : 'bg-surface-container text-on-surface-variant'}
                onExportPdf={() => handleExport('conflitos', 'pdf')}
                onExportExcel={() => handleExport('conflitos', 'xlsx')}
                onExportCsv={() => handleExport('conflitos', 'csv')}
              />
            </div>

            <div className="mt-5 p-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/30 text-xs text-on-surface-variant space-y-1">
              <p className="font-semibold text-on-surface flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-secondary" /> Padrão de Formatação Compatível:
              </p>
              <p>
                Arquivos <strong>PDF (.pdf)</strong> diagramados para impressão e distribuição oficial, <strong>Excel (.xlsx)</strong> com formatação nativa de colunas e <strong>CSV (.csv)</strong> codificados em UTF-8 com BOM para abertura sem erros de acentuação no Excel, Numbers e Google Planilhas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ExportCardItemProps {
  title: string;
  description: string;
  icon: any;
  meta: string;
  color?: string;
  onExportPdf: () => void;
  onExportExcel: () => void;
  onExportCsv: () => void;
}

function ExportCardItem({
  title,
  description,
  icon: Icon,
  meta,
  color,
  onExportPdf,
  onExportExcel,
  onExportCsv
}: ExportCardItemProps) {
  return (
    <div className="p-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest hover:border-secondary/70 hover:shadow-xs transition-all flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-lg bg-surface-container-low text-secondary shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <h4 className="font-semibold text-sm leading-tight text-on-surface">{title}</h4>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                color || 'bg-surface-container text-secondary'
              }`}
            >
              {meta}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-outline-variant/30 text-xs">
        <span className="text-[11px] font-medium text-on-surface-variant">Exportar Base:</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onExportPdf}
            className="px-3 py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-on-surface transition-colors flex items-center gap-1.5 cursor-pointer border border-outline-variant/40 hover:border-error/60"
            title="Download em PDF (.pdf)"
          >
            <FileText className="w-3.5 h-3.5 text-error" /> PDF (.pdf)
          </button>
          <button
            type="button"
            onClick={onExportExcel}
            className="px-3 py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-on-surface transition-colors flex items-center gap-1.5 cursor-pointer border border-outline-variant/40 hover:border-secondary"
            title="Download em Excel (.xlsx)"
          >
            <TableProperties className="w-3.5 h-3.5 text-secondary" /> Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="px-3 py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-on-surface transition-colors flex items-center gap-1.5 cursor-pointer border border-outline-variant/40 hover:border-secondary"
            title="Download em CSV (.csv)"
          >
            <Receipt className="w-3.5 h-3.5 text-secondary" /> CSV (.csv)
          </button>
        </div>
      </div>
    </div>
  );
}
