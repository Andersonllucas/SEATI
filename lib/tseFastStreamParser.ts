/**
 * Utilitários de Parsing Otimizados para Arquivos de Boletim de Urna (BU) do TSE
 * Suporta streaming por chunks para arquivos gigantes (50MB - 1GB+) sem estourar a memória do navegador.
 */

import { cleanNumber, BuTseCsvRow } from './tseBuParser';

export interface FastTseParseSummary {
  rows: BuTseCsvRow[];
  totalSecoes: number;
  totalVotosCandidato: number;
  candidatoNome?: string;
  candidatoCargo?: string;
  detectedOtherCandidates: Array<{ numero: string; nome: string; cargo: string; totalVotos: number }>;
}

export interface ParseProgressCallback {
  (progress: { bytesRead: number; totalBytes: number; percent: number; statusText: string }): void;
}

/**
 * Lê e processa um arquivo File em blocos (chunk streaming com FileReader ou ReadableStream)
 * filtrando diretamente pelo targetCandidateNumber durante a leitura linha por linha.
 * Isso evita manter o arquivo de centenas de MB em memória e evita múltiplas passadas.
 */
export async function parseTseCsvFileStreaming(
  file: File,
  targetCandidateNumber: string,
  targetMunicipio: string = '',
  onProgress?: ParseProgressCallback
): Promise<FastTseParseSummary> {
  const targetCleanNum = cleanNumber(targetCandidateNumber);
  const targetCleanMun = targetMunicipio.trim().toLowerCase();

  const rows: BuTseCsvRow[] = [];
  const secoesUnicasSet = new Set<string>();
  const topCandidatesMap = new Map<string, { numero: string; nome: string; cargo: string; totalVotos: number }>();
  
  let totalVotosCandidato = 0;
  let candidatoNome = '';
  let candidatoCargo = '';

  const totalBytes = file.size;
  const CHUNK_SIZE = 1024 * 1024 * 2; // 2MB por chunk
  let offset = 0;
  let leftoverLine = '';
  let isFirstChunk = true;
  let separator = ';';

  // Índices mapeados no cabeçalho
  let colIndex = {
    zona: -1,
    secao: -1,
    numero: -1,
    nome: -1,
    votos: -1,
    municipio: -1,
    cargo: -1
  };

  const cleanCell = (c: string) => c.replace(/^["']|["']$/g, '').trim();

  // Helper para decodificar Blob para texto (ISO-8859-1 padrão do TSE ou UTF-8)
  const readSlice = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = (e) => reject(e);
      reader.readAsText(blob, 'ISO-8859-1');
    });
  };

  while (offset < totalBytes) {
    const end = Math.min(offset + CHUNK_SIZE, totalBytes);
    const slice = file.slice(offset, end);
    const chunkText = await readSlice(slice);
    offset = end;

    const combinedText = leftoverLine + chunkText;
    const lines = combinedText.split(/\r?\n/);

    // A última linha pode estar cortada pelo final do chunk, preservamos para o próximo
    leftoverLine = lines.pop() || '';

    let startIndex = 0;

    // Se for o primeiro chunk, interpreta o cabeçalho
    if (isFirstChunk) {
      if (lines.length > 0) {
        const headerLine = lines[0];
        separator = headerLine.includes(';') ? ';' : ',';
        const headers = headerLine.split(separator).map((h) => cleanCell(h).toUpperCase());

        colIndex = {
          zona: headers.findIndex((h) => ['NR_ZONA', 'ZONA', 'NUMERO_ZONA', 'NUM_ZONA'].includes(h)),
          secao: headers.findIndex((h) => ['NR_SECAO', 'SECAO', 'SEÇÃO', 'NUMERO_SECAO'].includes(h)),
          numero: headers.findIndex((h) => ['NR_VOTAVEL', 'NUMERO_CANDIDATO', 'NUM_CANDIDATO', 'VOTAVEL', 'NUMERO'].includes(h)),
          nome: headers.findIndex((h) => ['NM_VOTAVEL', 'NOME_CANDIDATO', 'NM_CANDIDATO', 'NOME'].includes(h)),
          votos: headers.findIndex((h) => ['QT_VOTOS', 'QTD_VOTOS', 'VOTOS', 'TOTAL_VOTOS'].includes(h)),
          municipio: headers.findIndex((h) => ['NM_MUNICIPIO', 'MUNICIPIO', 'CIDADE'].includes(h)),
          cargo: headers.findIndex((h) => ['DS_CARGO_PERGUNTA', 'CARGO', 'DS_CARGO'].includes(h))
        };
        startIndex = 1;
      }
      isFirstChunk = false;
    }

    // Processa cada linha do chunk
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cells = line.split(separator).map(cleanCell);

      const zonaRaw = colIndex.zona !== -1 ? cells[colIndex.zona] : '';
      const secaoRaw = colIndex.secao !== -1 ? cells[colIndex.secao] : '';
      const numRaw = colIndex.numero !== -1 ? cells[colIndex.numero] : '';
      const nomeRaw = colIndex.nome !== -1 ? cells[colIndex.nome] : '';
      const votosRaw = colIndex.votos !== -1 ? cells[colIndex.votos] : '0';
      const munRaw = colIndex.municipio !== -1 ? cells[colIndex.municipio] : '';
      const cargoRaw = colIndex.cargo !== -1 ? cells[colIndex.cargo] : '';

      if (!zonaRaw || !secaoRaw || !numRaw) continue;

      const numClean = cleanNumber(numRaw);
      const votosInt = parseInt(votosRaw, 10) || 0;
      const secaoKey = `${cleanNumber(zonaRaw)}_${cleanNumber(secaoRaw)}`;
      secoesUnicasSet.add(secaoKey);

      // Filtro de Município se preenchido
      if (targetCleanMun && munRaw && !munRaw.toLowerCase().includes(targetCleanMun)) {
        continue;
      }

      // Se temos o número do candidato especificado
      if (targetCleanNum) {
        if (numClean === targetCleanNum) {
          totalVotosCandidato += votosInt;
          if (nomeRaw && !candidatoNome) candidatoNome = nomeRaw;
          if (cargoRaw && !candidatoCargo) candidatoCargo = cargoRaw;

          rows.push({
            zona: zonaRaw,
            secao: secaoRaw,
            numeroCandidato: numRaw,
            nomeCandidato: nomeRaw,
            cargo: cargoRaw,
            municipio: munRaw,
            votos: votosInt
          });
        }
      } else {
        // Amostragem/agrupamento de candidatos principais para caso não informe de início
        if (numClean && !['95', '96'].includes(numClean)) {
          if (!topCandidatesMap.has(numClean)) {
            topCandidatesMap.set(numClean, {
              numero: numRaw,
              nome: nomeRaw || `Candidato ${numRaw}`,
              cargo: cargoRaw || 'Cargo',
              totalVotos: 0
            });
          }
          const cand = topCandidatesMap.get(numClean)!;
          cand.totalVotos += votosInt;
          if (nomeRaw && (!cand.nome || cand.nome.startsWith('Candidato '))) {
            cand.nome = nomeRaw;
          }
        }
      }
    }

    if (onProgress) {
      const percent = Math.min(100, Math.round((offset / totalBytes) * 100));
      onProgress({
        bytesRead: offset,
        totalBytes,
        percent,
        statusText: `Lendo e filtrando arquivo TSE (${percent}%)...`
      });
    }

    // Libera a thread com um micro-tick para manter a UI responsiva
    await new Promise((r) => setTimeout(r, 0));
  }

  // Processa a última linha residual se houver
  if (leftoverLine && leftoverLine.trim()) {
    const line = leftoverLine.trim();
    const cells = line.split(separator).map(cleanCell);
    const zonaRaw = colIndex.zona !== -1 ? cells[colIndex.zona] : '';
    const secaoRaw = colIndex.secao !== -1 ? cells[colIndex.secao] : '';
    const numRaw = colIndex.numero !== -1 ? cells[colIndex.numero] : '';
    const nomeRaw = colIndex.nome !== -1 ? cells[colIndex.nome] : '';
    const votosRaw = colIndex.votos !== -1 ? cells[colIndex.votos] : '0';
    const munRaw = colIndex.municipio !== -1 ? cells[colIndex.municipio] : '';
    const cargoRaw = colIndex.cargo !== -1 ? cells[colIndex.cargo] : '';

    if (zonaRaw && secaoRaw && numRaw) {
      const numClean = cleanNumber(numRaw);
      const votosInt = parseInt(votosRaw, 10) || 0;
      const secaoKey = `${cleanNumber(zonaRaw)}_${cleanNumber(secaoRaw)}`;
      secoesUnicasSet.add(secaoKey);

      if (!targetCleanMun || !munRaw || munRaw.toLowerCase().includes(targetCleanMun)) {
        if (targetCleanNum && numClean === targetCleanNum) {
          totalVotosCandidato += votosInt;
          if (nomeRaw && !candidatoNome) candidatoNome = nomeRaw;
          if (cargoRaw && !candidatoCargo) candidatoCargo = cargoRaw;

          rows.push({
            zona: zonaRaw,
            secao: secaoRaw,
            numeroCandidato: numRaw,
            nomeCandidato: nomeRaw,
            cargo: cargoRaw,
            municipio: munRaw,
            votos: votosInt
          });
        }
      }
    }
  }

  const detectedOtherCandidates = Array.from(topCandidatesMap.values())
    .sort((a, b) => b.totalVotos - a.totalVotos)
    .slice(0, 15);

  return {
    rows,
    totalSecoes: secoesUnicasSet.size,
    totalVotosCandidato,
    candidatoNome,
    candidatoCargo,
    detectedOtherCandidates
  };
}
