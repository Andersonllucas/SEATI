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
  Layers,
  ExternalLink,
  Eye,
  X,
  ShieldAlert,
  History,
  Clock,
  UserPlus,
  Sparkles
} from 'lucide-react';
import { useCampaignData, formatTituloUtil, Eleitor } from '@/context/CampaignContext';
import { getActiveDb } from '@/lib/firebase';
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
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

interface HistoricoImportacao {
  id: string;
  nomeArquivo: string;
  dataHora: string;
  timestamp: string;
  tipo: 'eleitores' | 'liderancas' | 'locais';
  totalImportados: number;
  totalDescartados?: number;
  semLiderancaCount?: number;
  comLiderancaCount?: number;
  tamanhoArquivo?: string;
  status: string;
}

// Normaliza o nome da liderança para comparação insensível a maiúsculas/minúsculas e acentuação
function normalizeLeaderName(name?: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

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
    cleanTitulo,
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
  const [tituloDuplicateStrategy, setTituloDuplicateStrategy] = useState<'include' | 'skip'>('include');
  const [showTituloConflictsModal, setShowTituloConflictsModal] = useState(false);

  // Estados para Lideranças Não Cadastradas detectadas na planilha
  const [isRegisteringLeader, setIsRegisteringLeader] = useState(false);
  const [leaderRegisterSuccess, setLeaderRegisterSuccess] = useState<string | null>(null);
  const [quickLeaderModal, setQuickLeaderModal] = useState<{
    nome: string;
    tipo: 'Liderança Principal' | 'Sub-liderança';
    metaVotos: number | '';
    telefone: string;
    bairro: string;
    voterCount: number;
  } | null>(null);

  // Histórico de Importações
  const [historico, setHistorico] = useState<HistoricoImportacao[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('historico_importacoes_cache');
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return [];
  });

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

  // Existing Titles in database for pre-checking (keyed by clean numbers)
  const existingTitlesMap = useMemo(() => {
    const map = new Map<string, Eleitor[]>();
    eleitores.forEach((e) => {
      const clean = cleanTitulo(e.tituloEleitor);
      if (clean && clean.length >= 5) {
        const list = map.get(clean) || [];
        list.push(e);
        map.set(clean, list);
      }
    });
    return map;
  }, [eleitores, cleanTitulo]);

  // List of parsed voter rows whose title is already registered in database
  const tituloConflicts = useMemo(() => {
    if (!parsedData || importTarget !== 'eleitores') return [];
    const voterRows = parsedData.rows as ParsedVoterRow[];
    const list: {
      rowIndex: number;
      titulo: string;
      cleanTitulo: string;
      rowNome: string;
      rowLideranca: string;
      rowCpf: string;
      rowTelefone: string;
      existingVoters: Eleitor[];
    }[] = [];

    voterRows.forEach((r) => {
      if (r.tituloEleitor) {
        const clean = cleanTitulo(r.tituloEleitor);
        if (clean && clean.length >= 5 && existingTitlesMap.has(clean)) {
          list.push({
            rowIndex: r.originalIndex,
            titulo: r.tituloEleitor,
            cleanTitulo: clean,
            rowNome: r.nome,
            rowLideranca: r.lideranca || 'Não informada',
            rowCpf: r.cpf,
            rowTelefone: r.telefone,
            existingVoters: existingTitlesMap.get(clean) || []
          });
        }
      }
    });

    return list;
  }, [parsedData, importTarget, existingTitlesMap, cleanTitulo]);

  // Lista em tempo real de eleitores elegíveis de acordo com os filtros de descarte ativos
  const finalEligibleVoters = useMemo(() => {
    if (!parsedData || importTarget !== 'eleitores') return [];
    const voterRows = (parsedData.rows as ParsedVoterRow[]).filter((r) => r.isValid);
    let list = voterRows;
    if (duplicateStrategy === 'skip') {
      list = list.filter((r) => !r.cleanCpf || !existingCpfsSet.has(r.cleanCpf));
    }
    if (tituloDuplicateStrategy === 'skip') {
      list = list.filter((r) => {
        const cleanT = cleanTitulo(r.tituloEleitor);
        return !cleanT || cleanT.length < 5 || !existingTitlesMap.has(cleanT);
      });
    }
    return list;
  }, [
    parsedData,
    importTarget,
    duplicateStrategy,
    tituloDuplicateStrategy,
    existingCpfsSet,
    existingTitlesMap,
    cleanTitulo
  ]);

  // Mapa de lideranças cadastradas no sistema (chave normalizada para comparar desconsiderando maiúsculas/minúsculas e acentuação)
  const registeredLeadersMap = useMemo(() => {
    const map = new Map<string, (typeof liderancas)[0]>();
    liderancas.forEach((l) => {
      const key = normalizeLeaderName(l.nome);
      if (key) {
        map.set(key, l);
      }
    });
    return map;
  }, [liderancas]);

  // Lideranças não cadastradas encontradas na planilha de eleitores
  const unregisteredLeadersSummary = useMemo(() => {
    if (!parsedData || importTarget !== 'eleitores') return [];
    const voterRows = parsedData.rows as ParsedVoterRow[];
    const map = new Map<
      string,
      { rawName: string; normKey: string; count: number; sampleRows: ParsedVoterRow[] }
    >();

    voterRows.forEach((r) => {
      const raw = (r.lideranca || '').trim();
      const norm = normalizeLeaderName(raw);

      // Ignora vazios ou explicitamente sem liderança
      if (
        !norm ||
        norm === 'sem lideranca' ||
        norm === 'sem lideranca definida' ||
        norm === 'nao informada' ||
        norm === 'nenhuma' ||
        norm === '-'
      ) {
        return;
      }

      // Se já está cadastrada no sistema (desconsiderando diferenças de maiúsculas/minúsculas, ex: LUCAS e Lucas), considera identificada
      if (registeredLeadersMap.has(norm)) {
        return;
      }

      // Liderança que ainda não está cadastrada no sistema
      if (!map.has(norm)) {
        map.set(norm, {
          rawName: raw,
          normKey: norm,
          count: 1,
          sampleRows: [r]
        });
      } else {
        const item = map.get(norm)!;
        item.count++;
        if (item.sampleRows.length < 3) {
          item.sampleRows.push(r);
        }
      }
    });

    return Array.from(map.values());
  }, [parsedData, importTarget, registeredLeadersMap]);

  const totalVotersWithUnregisteredLeader = useMemo(() => {
    return unregisteredLeadersSummary.reduce((acc, curr) => acc + curr.count, 0);
  }, [unregisteredLeadersSummary]);

  // Listener em tempo real para o Histórico de Importações
  useEffect(() => {
    try {
      const q = query(
        collection(getActiveDb(), 'historico_importacoes'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: HistoricoImportacao[] = [];
          snapshot.forEach((d) => {
            list.push({ id: d.id, ...(d.data() as any) });
          });
          if (list.length > 0) {
            setHistorico(list);
            try {
              localStorage.setItem('historico_importacoes_cache', JSON.stringify(list));
            } catch {}
          }
        },
        (err) => {
          console.warn('Consulta do histórico Firestore:', err);
        }
      );
      return () => unsubscribe();
    } catch (e) {
      console.warn('Erro ao inicializar listener de histórico:', e);
    }
  }, []);

  const handleClearHistorico = async () => {
    if (!confirm('Deseja realmente limpar o histórico de importações registradas?')) return;
    try {
      localStorage.removeItem('historico_importacoes_cache');
      setHistorico([]);
      const snap = await getDocs(collection(getActiveDb(), 'historico_importacoes'));
      const promises = snap.docs.map((d) => deleteDoc(doc(getActiveDb(), 'historico_importacoes', d.id)));
      await Promise.all(promises);
    } catch (err) {
      console.warn('Erro ao limpar histórico no Firestore:', err);
    }
  };

  const registrarHistoricoImportacao = async (dados: {
    nomeArquivo: string;
    tipo: 'eleitores' | 'liderancas' | 'locais';
    totalImportados: number;
    totalDescartados?: number;
    semLiderancaCount?: number;
    comLiderancaCount?: number;
    tamanhoArquivo?: string;
  }) => {
    const dataHoraStr = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const novoItem: HistoricoImportacao = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      nomeArquivo: dados.nomeArquivo,
      dataHora: dataHoraStr,
      timestamp: new Date().toISOString(),
      tipo: dados.tipo,
      totalImportados: dados.totalImportados,
      totalDescartados: dados.totalDescartados || 0,
      semLiderancaCount: dados.semLiderancaCount || 0,
      comLiderancaCount: dados.comLiderancaCount || 0,
      tamanhoArquivo: dados.tamanhoArquivo || 'Planilha',
      status: 'Concluído'
    };

    setHistorico((prev) => {
      const updated = [novoItem, ...prev];
      try {
        localStorage.setItem('historico_importacoes_cache', JSON.stringify(updated.slice(0, 100)));
      } catch {}
      return updated;
    });

    try {
      await addDoc(collection(getActiveDb(), 'historico_importacoes'), {
        ...novoItem,
        criadoEm: serverTimestamp()
      });
    } catch (err) {
      console.warn('Erro ao salvar no Firestore historico_importacoes:', err);
    }
  };

  const handleQuickRegisterLeader = async (
    leaderRawName: string,
    tipo: 'Liderança Principal' | 'Sub-liderança' = 'Liderança Principal',
    customMeta?: number,
    customTel?: string,
    customBairro?: string
  ) => {
    try {
      setIsRegisteringLeader(true);
      await batchImportLiderancas([
        {
          nome: leaderRawName.trim(),
          tipo,
          status: 'Ativa',
          metaVotos: typeof customMeta === 'number' ? customMeta : 100,
          telefone: customTel || '',
          bairro: customBairro || '',
          regiao: 'Geral',
          cidade: 'Teresina',
          estado: 'PI',
          observacoes: 'Cadastrada no ato da importação de eleitores'
        }
      ]);
      setLeaderRegisterSuccess(
        `Liderança "${leaderRawName.trim()}" cadastrada com sucesso! Os eleitores correspondentes agora serão vinculados a ela.`
      );
      setQuickLeaderModal(null);
      setTimeout(() => setLeaderRegisterSuccess(null), 5000);
    } catch (err: any) {
      console.error('Erro ao cadastrar liderança no ato da importação:', err);
      alert('Erro ao cadastrar liderança: ' + (err.message || 'Tente novamente'));
    } finally {
      setIsRegisteringLeader(false);
    }
  };

  const handleRegisterAllUnregisteredLeaders = async () => {
    if (unregisteredLeadersSummary.length === 0) return;
    try {
      setIsRegisteringLeader(true);
      const toCreate = unregisteredLeadersSummary.map((item) => ({
        nome: item.rawName.trim(),
        tipo: 'Liderança Principal' as const,
        status: 'Ativa' as const,
        metaVotos: 100,
        regiao: 'Geral',
        bairro: item.sampleRows[0]?.bairro || '',
        cidade: item.sampleRows[0]?.cidade || 'Teresina',
        estado: item.sampleRows[0]?.estado || 'PI',
        observacoes: 'Cadastrada no ato da importação de eleitores'
      }));
      await batchImportLiderancas(toCreate);
      setLeaderRegisterSuccess(
        `Todas as ${toCreate.length} lideranças foram cadastradas com sucesso no sistema!`
      );
      setTimeout(() => setLeaderRegisterSuccess(null), 6000);
    } catch (err: any) {
      console.error('Erro ao cadastrar todas as lideranças:', err);
      alert('Erro ao cadastrar lideranças: ' + (err.message || 'Tente novamente'));
    } finally {
      setIsRegisteringLeader(false);
    }
  };

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
          finalRows = finalRows.filter((r) => !r.cleanCpf || !existingCpfsSet.has(r.cleanCpf));
        }
        if (tituloDuplicateStrategy === 'skip') {
          finalRows = finalRows.filter((r) => {
            const cleanT = cleanTitulo(r.tituloEleitor);
            return !cleanT || cleanT.length < 5 || !existingTitlesMap.has(cleanT);
          });
        }

        if (finalRows.length === 0) {
          setIsImporting(false);
          setParseError(
            `Atenção: Nenhum eleitor novo restou para salvar, pois todos os ${validRows.length} registros válidos foram descartados pelas regras de duplicidade (CPF ou Título já cadastrados). Para cadastrá-los e registrá-los na Auditoria, altere a opção para "Cadastrar e sinalizar conflito" ou "Importar mesmo assim".`
          );
          return;
        }

        setImportProgress({ done: 0, total: finalRows.length });

        const toInsert = finalRows.map((r) => {
          const normLider = normalizeLeaderName(r.lideranca);
          const matchedLeader = normLider ? registeredLeadersMap.get(normLider) : null;

          let finalLideranca = 'Sem Liderança';
          let finalLiderancaId = '';

          if (matchedLeader) {
            // Liderança encontrada no sistema (mesmo que com maiúsculas/minúsculas diferentes, ex: LUCAS e Lucas)
            finalLideranca = matchedLeader.nome;
            finalLiderancaId = matchedLeader.id;
          } else {
            // Caso seja feita a importação sem a liderança cadastrada, marca como "Sem Liderança"
            finalLideranca = 'Sem Liderança';
            finalLiderancaId = '';
          }

          return {
            nome: r.nome,
            cpf: r.cpf,
            telefone: r.telefone,
            tituloEleitor: r.tituloEleitor || '',
            zona: r.zona,
            secao: r.secao,
            bairro: r.bairro,
            cidade: r.cidade || 'Teresina',
            estado: r.estado || 'PI',
            lideranca: finalLideranca,
            liderancaId: finalLiderancaId,
            status: 'Pendente'
          };
        });

        await batchImportEleitores(toInsert, (done, total) => {
          setImportProgress({ done, total });
        });

        const semLidCount = toInsert.filter((v) => v.lideranca === 'Sem Liderança').length;
        const comLidCount = toInsert.length - semLidCount;

        // Registrar no Histórico de Importações
        await registrarHistoricoImportacao({
          nomeArquivo: selectedFile?.name || 'lista_eleitores.xlsx',
          tipo: 'eleitores',
          totalImportados: toInsert.length,
          totalDescartados: validRows.length - finalRows.length,
          semLiderancaCount: semLidCount,
          comLiderancaCount: comLidCount,
          tamanhoArquivo: selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : undefined
        });

        setImportSuccessMessage(
          `${finalRows.length} eleitores foram gravados com sucesso na base oficial do Firestore! ${
            semLidCount > 0
              ? `(${semLidCount} eleitor(es) foram marcados como "Sem Liderança" para fácil identificação e filtragem)`
              : `(Todos os ${comLidCount} eleitores vinculados às lideranças oficiais)`
          }`
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
          cidade: r.cidade || 'Teresina',
          estado: r.estado || 'PI',
          metaVotos: r.metaVotos,
          status: r.status,
          observacoes: r.observacoes
        }));

        await batchImportLiderancas(toInsert, (done, total) => {
          setImportProgress({ done, total });
        });

        // Registrar no Histórico de Importações
        await registrarHistoricoImportacao({
          nomeArquivo: selectedFile?.name || 'lista_liderancas.xlsx',
          tipo: 'liderancas',
          totalImportados: leaderRows.length,
          tamanhoArquivo: selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : undefined
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

        // Registrar no Histórico de Importações
        await registrarHistoricoImportacao({
          nomeArquivo: selectedFile?.name || 'lista_locais.xlsx',
          tipo: 'locais',
          totalImportados: localRows.length,
          tamanhoArquivo: selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : undefined
        });

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

    let tituloAlreadyInDb = 0;
    let tituloSpreadsheetDuplicates = 0;
    const seenTitulosInSpreadsheet = new Set<string>();

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
      if (r.tituloEleitor) {
        const cleanT = cleanTitulo(r.tituloEleitor);
        if (cleanT && cleanT.length >= 5) {
          if (existingTitlesMap.has(cleanT)) {
            tituloAlreadyInDb++;
          }
          if (seenTitulosInSpreadsheet.has(cleanT)) {
            tituloSpreadsheetDuplicates++;
          } else {
            seenTitulosInSpreadsheet.add(cleanT);
          }
        }
      }
    });

    return {
      alreadyInDb,
      spreadsheetDuplicates,
      tituloAlreadyInDb,
      tituloSpreadsheetDuplicates
    };
  }, [parsedData, importTarget, existingCpfsSet, existingTitlesMap, cleanTitulo]);

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
        {/* LEFT COLUMN: REAL IMPORT MODULE & HISTORICO (7 Cols)      */}
        {/* ========================================================= */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Card 1: Importador de Dados Oficiais */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/70 shadow-sm flex flex-col overflow-hidden">
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

              <div className="flex flex-wrap items-center gap-2 shrink-0 pl-9 sm:pl-0">
                <a
                  href="https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/"
                  target="_blank"
                  rel="noreferrer"
                  title="Acessar o Autoatendimento Eleitoral e Serviços do TSE"
                  className="px-3 py-1.5 border border-primary/30 bg-primary/10 rounded text-xs font-semibold text-primary hover:bg-primary/20 flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-primary" /> Portal TSE
                </a>
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

                {/* Alerta de Títulos de Eleitor Duplicados com a Base */}
                {importTarget === 'eleitores' && tituloConflicts.length > 0 && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-700 shrink-0 mt-0.5">
                          <AlertTriangle className="w-5 h-5 text-amber-700" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-on-surface">
                              Alerta de Títulos Duplicados ({tituloConflicts.length})
                            </h4>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300 font-extrabold uppercase">
                              Atenção antes de importar
                            </span>
                          </div>
                          <p className="text-xs text-on-surface-variant mt-0.5">
                            Detectamos que {tituloConflicts.length} eleitor(es) na planilha possuem número de título já cadastrado no sistema.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowTituloConflictsModal(true)}
                        className="px-3 py-1.5 bg-surface text-on-surface hover:bg-surface-container border border-outline-variant/60 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs shrink-0 self-start sm:self-auto"
                      >
                        <Eye className="w-3.5 h-3.5 text-amber-700" />
                        Ver Detalhes dos {tituloConflicts.length} Conflitos
                      </button>
                    </div>

                    {/* Amostra rápida dos primeiros conflitos */}
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {tituloConflicts.slice(0, 4).map((c, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-surface border border-outline-variant/60 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs shadow-2xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-on-surface bg-surface-container px-2 py-0.5 rounded text-[11px] border border-outline-variant/50">
                                {formatTituloUtil(c.titulo)}
                              </span>
                              <span className="text-[10px] text-on-surface-variant">
                                Linha #{c.rowIndex} na Planilha
                              </span>
                            </div>
                            <p className="text-on-surface text-xs">
                              <strong className="text-primary font-semibold">Na Planilha:</strong> {c.rowNome} • Liderança indicada: <span className="font-medium text-on-surface">{c.rowLideranca}</span>
                            </p>
                          </div>

                          <div className="md:text-right border-t md:border-t-0 pt-1.5 md:pt-0 border-outline-variant/30 text-xs">
                            <span className="text-[11px] text-on-surface-variant font-medium block">
                              Já Cadastrado no Banco:
                            </span>
                            {c.existingVoters.map((ev) => (
                              <div key={ev.id} className="font-semibold text-on-surface">
                                {ev.nome}{' '}
                                <span className="text-amber-800 font-bold bg-amber-100 px-1.5 py-0.5 rounded text-[11px] border border-amber-300">
                                  Liderança: {ev.lideranca || 'Sem Liderança'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {tituloConflicts.length > 4 && (
                        <p className="text-[11px] text-center text-on-surface-variant italic pt-1">
                          + {tituloConflicts.length - 4} outros títulos duplicados. Clique em &quot;Ver Detalhes&quot; para auditar a lista completa.
                        </p>
                      )}
                    </div>

                    {/* Ação para Títulos Duplicados */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-outline-variant/30 text-xs">
                      <span className="text-on-surface-variant font-medium">Ação para Títulos já existentes:</span>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="dupTituloStrategy"
                            checked={tituloDuplicateStrategy === 'skip'}
                            onChange={() => setTituloDuplicateStrategy('skip')}
                            className="text-secondary focus:ring-secondary"
                          />
                          <span className="text-on-surface font-semibold text-emerald-700">
                            Descartar duplicados de título ({tituloConflicts.length}) [Recomendado]
                          </span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="dupTituloStrategy"
                            checked={tituloDuplicateStrategy === 'include'}
                            onChange={() => setTituloDuplicateStrategy('include')}
                            className="text-secondary focus:ring-secondary"
                          />
                          <span className="text-on-surface font-medium">
                            Importar mesmo assim e sinalizar na Auditoria
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notificação e Opção de Cadastro de Lideranças Não Cadastradas */}
                {importTarget === 'eleitores' && unregisteredLeadersSummary.length > 0 && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 space-y-3.5 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 shrink-0 mt-0.5">
                          <Users className="w-5 h-5 text-amber-700" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-on-surface">
                              Lideranças Não Cadastradas Encontradas ({unregisteredLeadersSummary.length})
                            </h4>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300 font-extrabold uppercase">
                              Ação no Ato da Importação
                            </span>
                          </div>
                          <p className="text-xs text-on-surface-variant mt-1">
                            Detectamos que <strong>{totalVotersWithUnregisteredLeader} eleitor(es)</strong> na planilha estão vinculados a nomes de lideranças que ainda não constam no sistema. Você pode cadastrá-las agora no ato da importação. Caso prossiga sem cadastrar, todos esses eleitores serão gravados automaticamente como <strong>&quot;Sem Liderança&quot;</strong> para que você possa visualizá-los e filtrá-los facilmente no sistema.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleRegisterAllUnregisteredLeaders}
                        disabled={isRegisteringLeader}
                        className="px-3.5 py-2 bg-secondary text-on-secondary hover:bg-secondary/90 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0 self-start sm:self-auto disabled:opacity-50"
                        title="Cadastrar todas as lideranças não cadastradas com 1 clique"
                      >
                        {isRegisteringLeader ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        Cadastrar Todas ({unregisteredLeadersSummary.length})
                      </button>
                    </div>

                    {leaderRegisterSuccess && (
                      <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{leaderRegisterSuccess}</span>
                      </div>
                    )}

                    {/* Lista das lideranças com opção de cadastro imediato */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                      {unregisteredLeadersSummary.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg bg-surface border border-outline-variant/60 flex flex-col justify-between gap-2 text-xs shadow-2xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p className="font-bold text-on-surface truncate text-sm" title={item.rawName}>
                                {item.rawName}
                              </p>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold shrink-0">
                                {item.count} eleitor{item.count > 1 ? 'es' : ''}
                              </span>
                            </div>
                            <p className="text-[11px] text-on-surface-variant mt-0.5">
                              {item.sampleRows[0]?.bairro ? `Bairro: ${item.sampleRows[0].bairro}` : 'Sem bairro informado'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pt-1.5 border-t border-outline-variant/30">
                            <button
                              type="button"
                              onClick={() => handleQuickRegisterLeader(item.rawName)}
                              disabled={isRegisteringLeader}
                              className="flex-1 px-2.5 py-1.5 bg-primary text-on-primary hover:bg-secondary rounded text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                              title={`Cadastrar "${item.rawName}" no sistema`}
                            >
                              <UserPlus className="w-3.5 h-3.5" /> Cadastrar Liderança
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setQuickLeaderModal({
                                  nome: item.rawName,
                                  tipo: 'Liderança Principal',
                                  metaVotos: 100,
                                  telefone: '',
                                  bairro: item.sampleRows[0]?.bairro || '',
                                  voterCount: item.count
                                })
                              }
                              className="px-2 py-1.5 border border-outline-variant/60 rounded text-xs text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                              title="Personalizar dados antes de cadastrar"
                            >
                              Editar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-[11px] text-on-surface-variant flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                      <span>
                        <strong>Unificação inteligente:</strong> Diferenças de maiúsculas e minúsculas (ex: <code>LUCAS</code> no arquivo e <code>Lucas</code> no sistema) são consideradas a mesma liderança automaticamente.
                      </span>
                    </div>
                  </div>
                )}

                {/* Alerta quando todos os registros foram descartados por regras de duplicidade */}
                {importTarget === 'eleitores' && parsedData.validCount > 0 && finalEligibleVoters.length === 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-500/15 border-2 border-amber-500/40 text-on-surface text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-300 text-sm">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      Todos os {parsedData.validCount} eleitores desta planilha já constam no banco de dados!
                    </div>
                    <p className="text-on-surface-variant">
                      Com os filtros de descarte atuais (CPF e/ou Título), nenhum registro novo será importado. Caso queira cadastrá-los mesmo assim e registrar a duplicidade na Auditoria de Conflitos, clique no botão abaixo:
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setDuplicateStrategy('include');
                        setTituloDuplicateStrategy('include');
                        setParseError(null);
                      }}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Alterar para &quot;Importar e sinalizar conflitos&quot; ({parsedData.validCount} eleitores)
                    </button>
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
                              <th className="px-3 py-2">Título de Eleitor</th>
                              <th className="px-3 py-2">Telefone</th>
                              <th className="px-3 py-2">Cidade/UF</th>
                              <th className="px-3 py-2">Zona / Seção</th>
                              <th className="px-3 py-2">Liderança</th>
                            </>
                          )}
                          {importTarget === 'liderancas' && (
                            <>
                              <th className="px-3 py-2">Tipo</th>
                              <th className="px-3 py-2">Região</th>
                              <th className="px-3 py-2">Cidade/UF</th>
                              <th className="px-3 py-2">Meta Votos</th>
                            </>
                          )}
                          {importTarget === 'locais' && (
                            <>
                              <th className="px-3 py-2">Tipo</th>
                              <th className="px-3 py-2">Cidade/UF</th>
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
                                    {row.cleanCpf ? (
                                      formatCpf(row.cpf)
                                    ) : (
                                      <span className="text-on-surface-variant/50 italic font-sans">Não informado</span>
                                    )}
                                    {isCpfInDb && (
                                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-error-container/20 text-error font-bold">
                                        Existe no Banco
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-on-surface-variant">
                                    {row.tituloEleitor ? (
                                      <div>
                                        <span>{formatTituloUtil(row.tituloEleitor)}</span>
                                        {(() => {
                                          const cleanT = cleanTitulo(row.tituloEleitor);
                                          const ev = cleanT && cleanT.length >= 5 ? existingTitlesMap.get(cleanT)?.[0] : null;
                                          if (!ev) return null;
                                          return (
                                            <span
                                              className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold block sm:inline-block w-max mt-0.5"
                                              title={`Já cadastrado no banco: ${ev.nome} (Liderança: ${ev.lideranca || 'Sem Liderança'})`}
                                            >
                                              Já no banco: {ev.nome} ({ev.lideranca || 'Sem Liderança'})
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    ) : (
                                      <span className="text-on-surface-variant/50 italic font-sans">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-on-surface-variant">{row.telefone || '-'}</td>
                                  <td className="px-3 py-2 text-on-surface-variant">
                                    {row.cidade || 'Teresina'} - {row.estado || 'PI'}
                                  </td>
                                  <td className="px-3 py-2 text-on-surface-variant">
                                    ZE {row.zona} / Sec {row.secao || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-on-surface-variant">
                                    {(() => {
                                      const norm = normalizeLeaderName(row.lideranca);
                                      if (!norm || norm === 'sem lideranca' || norm === 'nao informada' || norm === '-') {
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40">
                                            Sem Liderança
                                          </span>
                                        );
                                      }
                                      const matched = registeredLeadersMap.get(norm);
                                      if (matched) {
                                        return (
                                          <div className="flex flex-col">
                                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400" title={`Identificada: ${matched.nome} (${matched.tipo})`}>
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                              {matched.nome}
                                            </span>
                                            {matched.nome.toLowerCase() !== row.lideranca.toLowerCase() && (
                                              <span className="text-[10px] text-on-surface-variant">
                                                (Na planilha: &quot;{row.lideranca}&quot;)
                                              </span>
                                            )}
                                          </div>
                                        );
                                      }
                                      return (
                                        <div className="flex flex-col gap-0.5">
                                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400" title="Liderança ainda não cadastrada no sistema">
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                            {row.lideranca}
                                          </span>
                                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1 py-0.2 rounded w-max">
                                            Não Cadastrada
                                          </span>
                                        </div>
                                      );
                                    })()}
                                  </td>
                                </>
                              )}
                              {importTarget === 'liderancas' && (
                                <>
                                  <td className="px-3 py-2 text-on-surface-variant">{row.tipo}</td>
                                  <td className="px-3 py-2 text-on-surface-variant">{row.regiao}</td>
                                  <td className="px-3 py-2 text-on-surface-variant">
                                    {row.cidade || 'Teresina'} - {row.estado || 'PI'}
                                  </td>
                                  <td className="px-3 py-2 font-bold text-on-surface">{row.metaVotos}</td>
                                </>
                              )}
                              {importTarget === 'locais' && (
                                <>
                                  <td className="px-3 py-2 text-on-surface-variant">{row.tipo}</td>
                                  <td className="px-3 py-2 text-on-surface-variant">
                                    {row.municipio || 'Teresina'} - {row.uf || 'PI'}
                                  </td>
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
                    ? importTarget === 'eleitores'
                      ? `${finalEligibleVoters.length} eleitor(es) a salvar (${parsedData.validCount - finalEligibleVoters.length} descartados por duplicidade)`
                      : `${parsedData.validCount} registros prontos para gravação direta`
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
                disabled={
                  !parsedData ||
                  parsedData.validCount === 0 ||
                  isImporting ||
                  (importTarget === 'eleitores' && finalEligibleVoters.length === 0)
                }
                onClick={handleStartImport}
                title={
                  importTarget === 'eleitores' && finalEligibleVoters.length === 0
                    ? 'Nenhum registro a importar com os filtros de descarte ativos. Altere para "Importar mesmo assim" para salvar.'
                    : undefined
                }
                className="w-full sm:w-auto px-6 py-2.5 bg-primary text-on-primary rounded font-semibold flex items-center justify-center gap-2 shadow-xs hover:bg-secondary transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Importando...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" /> Iniciar Importação
                    {importTarget === 'eleitores' && parsedData ? ` (${finalEligibleVoters.length})` : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* Card 2: Histórico das Importações (Logo abaixo do Card 1)  */}
        {/* ========================================================= */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/70 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-outline-variant/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-lowest">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-secondary">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                  Histórico de Importações
                  {historico.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-semibold">
                      {historico.length}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Registro de arquivos anexados com data e hora de importação.
                </p>
              </div>
            </div>

            {historico.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistorico}
                className="text-xs text-on-surface-variant hover:text-error transition-colors flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                title="Limpar histórico de importações"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpar Histórico
              </button>
            )}
          </div>

          <div className="p-0">
            {historico.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center text-on-surface-variant">
                <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center mb-2.5">
                  <History className="w-6 h-6 text-on-surface-variant/60" />
                </div>
                <p className="text-sm font-semibold text-on-surface">Nenhuma importação registrada ainda</p>
                <p className="text-xs text-on-surface-variant mt-1 max-w-sm">
                  Quando você anexar e confirmar uma planilha acima, o nome do arquivo com a data e hora ficará registrado aqui.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-container-low text-on-surface-variant uppercase font-semibold border-b border-outline-variant/40">
                    <tr>
                      <th className="px-4 py-2.5">Arquivo Anexado</th>
                      <th className="px-3 py-2.5">Tipo</th>
                      <th className="px-3 py-2.5">Data e Hora</th>
                      <th className="px-3 py-2.5">Registros</th>
                      <th className="px-3 py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {historico.slice(0, 30).map((h) => (
                      <tr key={h.id} className="hover:bg-surface-container-low/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-secondary shrink-0" />
                            <div className="min-w-0">
                              <p className="font-bold text-on-surface truncate max-w-[200px]" title={h.nomeArquivo}>
                                {h.nomeArquivo}
                              </p>
                              {h.tamanhoArquivo && (
                                <span className="text-[10px] text-on-surface-variant">
                                  {h.tamanhoArquivo}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              h.tipo === 'eleitores'
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : h.tipo === 'liderancas'
                                ? 'bg-secondary/15 text-secondary border border-secondary/30'
                                : 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30'
                            }`}
                          >
                            {h.tipo === 'eleitores' ? 'Eleitores' : h.tipo === 'liderancas' ? 'Lideranças' : 'Locais'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-on-surface font-medium whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
                            <span>{h.dataHora}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-on-surface">
                              {h.totalImportados} registros
                            </span>
                            {h.tipo === 'eleitores' && typeof h.semLiderancaCount === 'number' && h.semLiderancaCount > 0 && (
                              <Link
                                href="/eleitores?lideranca=sem_lideranca"
                                className="text-[10px] font-bold text-amber-700 hover:underline flex items-center gap-1"
                                title="Filtrar eleitores sem liderança na aba de Eleitores"
                              >
                                <span>{h.semLiderancaCount} sem liderança</span>
                                <ArrowRight className="w-2.5 h-2.5" />
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> {h.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                title="Locais e Seções de Votação (Padrão TSE)"
                description="Planilha oficial do TSE com Zona Eleitoral, Município, Seção Efetiva, Seções Agregadas, Local de Votação (LV), Endereço e Bairro."
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

      {/* ========================================================= */}
      {/* MODAL: DETALHES DE TÍTULOS DUPLICADOS                    */}
      {/* ========================================================= */}
      {showTituloConflictsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-outline-variant shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-outline-variant/60 flex items-center justify-between bg-amber-500/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                    Conflitos de Título de Eleitor ({tituloConflicts.length})
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Eleitores da planilha com título já cadastrado e suas respectivas lideranças
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTituloConflictsModal(false)}
                className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content / Conflict Cards */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
              <div className="p-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/40 text-xs text-on-surface-variant">
                💡 <strong>Por que este alerta é importante?</strong> Pela legislação eleitoral e regras da campanha, o número do título é um identificador individual único. Cadastrar o mesmo título para eleitores diferentes pode indicar duplicidade de pessoa ou disputa de voto entre lideranças.
              </div>

              {tituloConflicts.map((c, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-2xs space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/30 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm bg-surface-container px-2.5 py-0.5 rounded border border-outline-variant text-on-surface">
                        {formatTituloUtil(c.titulo)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        Linha #{c.rowIndex} na Planilha
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* Dado na Planilha */}
                    <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/40 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-primary tracking-wider block">
                        Na Planilha Sendo Importada:
                      </span>
                      <p className="font-bold text-on-surface text-sm">{c.rowNome}</p>
                      <p className="text-on-surface-variant">
                        Liderança Indicada: <strong className="text-on-surface">{c.rowLideranca}</strong>
                      </p>
                      {c.rowCpf && <p className="text-on-surface-variant font-mono">CPF: {c.rowCpf}</p>}
                      {c.rowTelefone && <p className="text-on-surface-variant">Telefone: {c.rowTelefone}</p>}
                    </div>

                    {/* Dado já no Banco */}
                    <div className="p-2.5 rounded-lg bg-error-container/10 border border-error/30 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-error tracking-wider block">
                        Já Cadastrado Oficialmente no Banco:
                      </span>
                      {c.existingVoters.map((ev) => (
                        <div key={ev.id} className="space-y-1">
                          <p className="font-bold text-on-surface text-sm">{ev.nome}</p>
                          <p className="text-on-surface-variant">
                            Liderança Associada:{' '}
                            <span className="font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                              {ev.lideranca || 'Sem Liderança'}
                            </span>
                          </p>
                          {ev.cpf && <p className="text-on-surface-variant font-mono">CPF: {ev.cpf}</p>}
                          {ev.telefone && <p className="text-on-surface-variant">Telefone: {ev.telefone}</p>}
                          <p className="text-on-surface-variant text-[11px]">
                            Zona {ev.zona} / Seção {ev.secao || '-'} • Bairro: {ev.bairro || '-'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-outline-variant/60 bg-surface-container-low/40 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-on-surface-variant">
                Ação selecionada:{' '}
                <strong className={tituloDuplicateStrategy === 'skip' ? 'text-emerald-700' : 'text-amber-700'}>
                  {tituloDuplicateStrategy === 'skip' ? 'Descartar Duplicados' : 'Importar e Enviar para Auditoria'}
                </strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTituloDuplicateStrategy('skip');
                    setShowTituloConflictsModal(false);
                  }}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  ✓ Descartar Duplicados
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTituloDuplicateStrategy('include');
                    setShowTituloConflictsModal(false);
                  }}
                  className="px-3.5 py-2 border border-outline-variant bg-surface hover:bg-surface-container text-on-surface rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Importar e Auditar
                </button>
                <button
                  type="button"
                  onClick={() => setShowTituloConflictsModal(false)}
                  className="px-3.5 py-2 bg-surface text-on-surface-variant hover:text-on-surface rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CADASTRO RÁPIDO DE LIDERANÇA NO ATO DA IMPORTAÇÃO */}
      {/* ========================================================= */}
      {quickLeaderModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-outline-variant shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-outline-variant/60 flex items-center justify-between bg-primary-container/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface">
                    Cadastrar Liderança no Sistema
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    {quickLeaderModal.voterCount} eleitor(es) na planilha serão vinculados
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickLeaderModal(null)}
                className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">
                  Nome da Liderança <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={quickLeaderModal.nome}
                  onChange={(e) =>
                    setQuickLeaderModal((prev) => (prev ? { ...prev, nome: e.target.value } : null))
                  }
                  className="w-full h-10 border border-outline-variant rounded-lg px-3 text-sm focus:border-secondary outline-none bg-surface text-on-surface"
                  placeholder="Nome completo da liderança"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-on-surface">Tipo</label>
                  <select
                    value={quickLeaderModal.tipo}
                    onChange={(e) =>
                      setQuickLeaderModal((prev) =>
                        prev ? { ...prev, tipo: e.target.value as any } : null
                      )
                    }
                    className="w-full h-10 border border-outline-variant rounded-lg px-3 text-sm focus:border-secondary outline-none bg-surface text-on-surface"
                  >
                    <option value="Liderança Principal">Liderança Principal</option>
                    <option value="Sub-liderança">Sub-liderança</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-on-surface">
                    Meta de Votos / Eleitores
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={quickLeaderModal.metaVotos}
                    onChange={(e) =>
                      setQuickLeaderModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              metaVotos: e.target.value === '' ? '' : Number(e.target.value)
                            }
                          : null
                      )
                    }
                    placeholder="100"
                    className="w-full h-10 border border-outline-variant rounded-lg px-3 text-sm focus:border-secondary outline-none font-mono bg-surface text-on-surface"
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
                    value={quickLeaderModal.telefone}
                    onChange={(e) =>
                      setQuickLeaderModal((prev) => (prev ? { ...prev, telefone: e.target.value } : null))
                    }
                    placeholder="(86) 99999-0000"
                    className="w-full h-10 border border-outline-variant rounded-lg px-3 text-sm focus:border-secondary outline-none bg-surface text-on-surface"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-on-surface">
                    Bairro de Atuação <span className="text-on-surface-variant font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={quickLeaderModal.bairro}
                    onChange={(e) =>
                      setQuickLeaderModal((prev) => (prev ? { ...prev, bairro: e.target.value } : null))
                    }
                    placeholder="Ex: Centro"
                    className="w-full h-10 border border-outline-variant rounded-lg px-3 text-sm focus:border-secondary outline-none bg-surface text-on-surface"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-outline-variant/60 bg-surface-container-low/40 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setQuickLeaderModal(null)}
                className="px-4 py-2 border border-outline-variant/70 rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!quickLeaderModal.nome.trim() || isRegisteringLeader}
                onClick={() =>
                  handleQuickRegisterLeader(
                    quickLeaderModal.nome,
                    quickLeaderModal.tipo,
                    Number(quickLeaderModal.metaVotos) || 0,
                    quickLeaderModal.telefone,
                    quickLeaderModal.bairro
                  )
                }
                className="px-5 py-2 bg-primary text-on-primary hover:bg-secondary rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isRegisteringLeader ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Salvar e Vincular
              </button>
            </div>
          </div>
        </div>
      )}
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
