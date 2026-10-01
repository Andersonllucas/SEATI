/**
 * Utilitários de Parsing para Boletim de Urna (BU) do TSE
 * Suporta:
 * 1. Arquivos CSV/TXT de Boletins de Urna oficiais do TSE (Resultados / Dados Abertos)
 * 2. Texto decodificado de QR Codes de Boletins de Urna físicos das urnas eletrônicas
 */

export interface CandidateVoteResult {
  numero: string;
  nome?: string;
  partido?: string;
  cargo?: string;
  votos: number;
}

export interface BuParsedSecao {
  zona: string;
  secao: string;
  municipio?: string;
  local?: string;
  totalAptos?: number;
  totalComparecimento?: number;
  candidatos: CandidateVoteResult[];
}

export interface BuTseCsvRow {
  zona: string;
  secao: string;
  numeroCandidato: string;
  nomeCandidato?: string;
  cargo?: string;
  municipio?: string;
  votos: number;
}

/**
 * Normaliza número para comparação (remove zeros à esquerda e caracteres não numéricos)
 */
export function cleanNumber(val?: string | number): string {
  if (val === undefined || val === null) return '';
  const digits = String(val).replace(/\D/g, '');
  if (!digits) return '';
  return String(parseInt(digits, 10));
}

/**
 * Parser de texto de QR Code impresso no Boletim de Urna do TSE
 * O QR Code do TSE contém campos separados por quebras de linha ou espaços:
 * Ex: VRQR:02.00.00 ZON:0001 SEC:0014 ... VOT:12345:48
 */
export function parseTseQrCodeText(rawText: string, targetCandidateNumber?: string): BuParsedSecao {
  const text = rawText.trim();

  let zona = '';
  let secao = '';
  let municipio = '';
  let local = '';
  let totalAptos: number | undefined;
  let totalComparecimento: number | undefined;
  const candidatosMap = new Map<string, CandidateVoteResult>();

  // 1. Extração de Zona
  const zonMatch = text.match(/(?:ZON|ZONA)[:= ]+(\d+)/i);
  if (zonMatch) {
    zona = zonMatch[1];
  }

  // 2. Extração de Seção
  const secMatch = text.match(/(?:SEC|SECAO|SEÇÃO)[:= ]+(\d+)/i);
  if (secMatch) {
    secao = secMatch[1];
  }

  // 3. Extração de Município
  const munMatch = text.match(/(?:MUN|MUNICIPIO)[:= ]+([^\s\n,]+)/i);
  if (munMatch) {
    municipio = munMatch[1];
  }

  // 4. Extração de Local
  const locMatch = text.match(/(?:LOC|LOCAL)[:= ]+(\d+)/i);
  if (locMatch) {
    local = locMatch[1];
  }

  // 4. Extração de Aptos e Comparecimento
  const aptMatch = text.match(/(?:APT|APTOS)[:= ]+(\d+)/i);
  if (aptMatch) totalAptos = parseInt(aptMatch[1], 10);

  const comMatch = text.match(/(?:COM|COMPARECIMENTO)[:= ]+(\d+)/i);
  if (comMatch) totalComparecimento = parseInt(comMatch[1], 10);

  // 5. Padrões de Votos nominais no QR Code do TSE
  // Padrão A: VOT:12345:48 ou VOT:12345=48
  const votPatternA = /(?:VOT|VOTOS)[:= ]+(\d+)[:= ]+(\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = votPatternA.exec(text)) !== null) {
    const num = match[1];
    const qtd = parseInt(match[2], 10);
    candidatosMap.set(num, { numero: num, votos: qtd });
  }

  // Padrão B: 12345: 48 votos ou 12345 - 48
  const votPatternB = /(?:^|[\n\r;])\s*(\d{2,5})\s*[:\-=]\s*(\d+)\s*(?:votos)?/gi;
  while ((match = votPatternB.exec(text)) !== null) {
    const num = match[1];
    const qtd = parseInt(match[2], 10);
    // Ignora se parecer ano eleitoral ou código de pleito
    if (!['2024', '2026', '2022', '2020'].includes(num) || text.includes('VOT')) {
      if (!candidatosMap.has(num)) {
        candidatosMap.set(num, { numero: num, votos: qtd });
      }
    }
  }

  // Padrão C: Formato compacto TSE de bloco de votação (ex: "CAR:... 12345 48 12346 12")
  const tokens = text.split(/[\s\n\r,;]+/);
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];

    if (/^\d{2,5}$/.test(token) && /^\d{1,4}$/.test(nextToken)) {
      const numCandidate = token;
      const qtdVotes = parseInt(nextToken, 10);

      // Não sobrescreve se já encontrou por formato mais estrito
      if (!candidatosMap.has(numCandidate) && !['2024', '2026', '2022', '2020'].includes(numCandidate)) {
        candidatosMap.set(numCandidate, { numero: numCandidate, votos: qtdVotes });
      }
    }
  }

  const candidatos = Array.from(candidatosMap.values());

  // Se o usuário procurou um candidato específico, garante ordenação prioritária dele
  if (targetCandidateNumber) {
    const targetClean = cleanNumber(targetCandidateNumber);
    candidatos.sort((a, b) => {
      const aIsTarget = cleanNumber(a.numero) === targetClean ? -1 : 1;
      const bIsTarget = cleanNumber(b.numero) === targetClean ? -1 : 1;
      return aIsTarget - bIsTarget;
    });
  }

  return {
    zona: zona || '1ª Zona',
    secao: secao || '',
    municipio,
    local,
    totalAptos,
    totalComparecimento,
    candidatos
  };
}

/**
 * Parser de Arquivo CSV Oficial do TSE (Boletim de Urna / Votação por Seção)
 */
export function parseTseCsvFile(
  content: string,
  targetCandidateNumber?: string,
  targetMunicipio?: string
): {
  rows: BuTseCsvRow[];
  detectedCandidates: Array<{ numero: string; nome: string; cargo: string; totalVotos: number; totalSecoes: number }>;
  totalSecoes: number;
} {
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) {
    return { rows: [], detectedCandidates: [], totalSecoes: 0 };
  }

  // 1. Identifica separador (, ou ;)
  const headerLine = lines[0];
  const separator = headerLine.includes(';') ? ';' : ',';

  // Limpa aspas e quebras
  const cleanCell = (c: string) => c.replace(/^["']|["']$/g, '').trim();
  const headers = headerLine.split(separator).map((h) => cleanCell(h).toUpperCase());

  // 2. Mapeia índices de colunas
  const colIndex = {
    zona: headers.findIndex((h) => ['NR_ZONA', 'ZONA', 'NUMERO_ZONA', 'NUM_ZONA'].includes(h)),
    secao: headers.findIndex((h) => ['NR_SECAO', 'SECAO', 'SEÇÃO', 'NUMERO_SECAO'].includes(h)),
    numero: headers.findIndex((h) => ['NR_VOTAVEL', 'NUMERO_CANDIDATO', 'NUM_CANDIDATO', 'VOTAVEL', 'NUMERO'].includes(h)),
    nome: headers.findIndex((h) => ['NM_VOTAVEL', 'NOME_CANDIDATO', 'NM_CANDIDATO', 'NOME'].includes(h)),
    votos: headers.findIndex((h) => ['QT_VOTOS', 'QTD_VOTOS', 'VOTOS', 'TOTAL_VOTOS'].includes(h)),
    municipio: headers.findIndex((h) => ['NM_MUNICIPIO', 'MUNICIPIO', 'CIDADE'].includes(h)),
    cargo: headers.findIndex((h) => ['DS_CARGO_PERGUNTA', 'CARGO', 'DS_CARGO'].includes(h))
  };

  const rows: BuTseCsvRow[] = [];
  const candidatesAgg = new Map<string, { numero: string; nome: string; cargo: string; totalVotos: number; secoesSet: Set<string> }>();
  const secoesUnicasSet = new Set<string>();

  const targetCleanNum = targetCandidateNumber ? cleanNumber(targetCandidateNumber) : '';
  const targetCleanMun = targetMunicipio ? targetMunicipio.trim().toLowerCase() : '';

  for (let i = 1; i < lines.length; i++) {
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

    const votosInt = parseInt(votosRaw, 10) || 0;
    const numClean = cleanNumber(numRaw);
    const secaoKey = `${cleanNumber(zonaRaw)}_${cleanNumber(secaoRaw)}`;
    secoesUnicasSet.add(secaoKey);

    // Filtro de Município (se especificado)
    if (targetCleanMun && munRaw && !munRaw.toLowerCase().includes(targetCleanMun)) {
      continue;
    }

    // Agrega estatísticas do candidato
    if (numClean && !['95', '96'].includes(numClean)) { // ignora nulo e branco padrão TSE se quiser focar em nomes
      if (!candidatesAgg.has(numClean)) {
        candidatesAgg.set(numClean, {
          numero: numRaw,
          nome: nomeRaw || `Candidato ${numRaw}`,
          cargo: cargoRaw || 'Cargo',
          totalVotos: 0,
          secoesSet: new Set()
        });
      }
      const agg = candidatesAgg.get(numClean)!;
      agg.totalVotos += votosInt;
      agg.secoesSet.add(secaoKey);
      if (nomeRaw && (!agg.nome || agg.nome.startsWith('Candidato '))) {
        agg.nome = nomeRaw;
      }
    }

    // Se usuário especificou número alvo, guarda apenas as linhas dele
    if (targetCleanNum) {
      if (numClean === targetCleanNum) {
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
      // Se não especificou alvo, guarda todas as linhas
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

  const detectedCandidates = Array.from(candidatesAgg.values()).map((c) => ({
    numero: c.numero,
    nome: c.nome,
    cargo: c.cargo,
    totalVotos: c.totalVotos,
    totalSecoes: c.secoesSet.size
  }));

  // Ordena os candidatos mais votados no arquivo
  detectedCandidates.sort((a, b) => b.totalVotos - a.totalVotos);

  return {
    rows,
    detectedCandidates,
    totalSecoes: secoesUnicasSet.size
  };
}
