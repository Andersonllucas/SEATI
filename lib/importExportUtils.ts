import type * as XLSXTypes from 'xlsx';
import { Eleitor, Lideranca, LocalVotacao, CpfConflictGroup, cleanCpfUtil } from '@/context/CampaignContext';

// Dynamic lazy loaders for heavy spreadsheet & PDF libraries (reduces initial bundle size and compilation overhead)
export async function getXLSX(): Promise<typeof import('xlsx')> {
  return await import('xlsx');
}

export async function getPDFModules(): Promise<{
  jsPDF: typeof import('jspdf').default;
  autoTable: typeof import('jspdf-autotable').default;
}> {
  const [jspdfMod, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  return {
    jsPDF: jspdfMod.default,
    autoTable: autoTableMod.default,
  };
}

export interface ParsedVoterRow {
  originalIndex: number;
  nome: string;
  cpf: string;
  cleanCpf: string;
  telefone: string;
  tituloEleitor?: string;
  zona: string;
  secao: string;
  bairro: string;
  cidade?: string;
  estado?: string;
  lideranca: string;
  status: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ParsedLeaderRow {
  originalIndex: number;
  nome: string;
  tipo: 'Liderança Principal' | 'Sub-liderança';
  liderancaPaiNome?: string;
  telefone: string;
  email: string;
  regiao: string;
  bairro: string;
  cidade?: string;
  estado?: string;
  metaVotos: number;
  status: 'Ativa' | 'Em Formação' | 'Inativa';
  observacoes: string;
  isValid: boolean;
  errors: string[];
}

export interface ParsedLocalRow {
  originalIndex: number;
  nome: string;
  tipo: string;
  zona: string;
  secoes: string[];
  secoesAgregadas?: string;
  bairro: string;
  endereco: string;
  capacidadeAprox: number;
  municipio: string;
  uf: string;
  isValid: boolean;
  errors: string[];
}

// Download Trigger Helper
function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportWorkbook(wb: XLSXTypes.WorkBook, baseName: string, format: 'xlsx' | 'csv') {
  const XLSX = await getXLSX();
  const timestamp = new Date().toISOString().slice(0, 10);
  const fileName = `${baseName}_${timestamp}`;

  if (format === 'xlsx') {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    triggerFileDownload(blob, `${fileName}.xlsx`);
  } else {
    // CSV with UTF-8 BOM
    const firstSheet = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheet];
    const csvData = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(['\uFEFF' + csvData], { type: 'text/csv;charset=utf-8;' });
    triggerFileDownload(blob, `${fileName}.csv`);
  }
}

// Normalize column header keys for flexible matching
function normalizeHeaderKey(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// FORMAT CPF FOR DISPLAY
export function formatCpf(cpf?: string): string {
  const clean = cleanCpfUtil(cpf);
  if (!clean || clean.length !== 11) return cpf || '';
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// ==========================================
// 1. TEMPLATES (MODELOS OFICIAIS DE IMPORTAÇÃO)
// ==========================================
export async function downloadTemplate(type: 'eleitores' | 'liderancas' | 'locais', format: 'xlsx' | 'csv') {
  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();

  if (type === 'eleitores') {
    const data = [
      {
        'Nome Completo': 'Maria da Silva Santos',
        'CPF': '123.456.789-00',
        'Telefone / WhatsApp': '(86) 99999-1111',
        'Numero do titulo': '012345670890',
        'Zona Eleitoral': '001',
        'Seção Eleitoral': '0012',
        'Bairro': 'Centro',
        'Cidade': 'Teresina',
        'Estado': 'PI',
        'Liderança Responsável': 'Vereador João'
      },
      {
        'Nome Completo': 'Pedro Henrique Lima',
        'CPF': '987.654.321-11',
        'Telefone / WhatsApp': '(86) 98888-2222',
        'Numero do titulo': '987654320891',
        'Zona Eleitoral': '001',
        'Seção Eleitoral': '0015',
        'Bairro': 'Ilhotas',
        'Cidade': 'Teresina',
        'Estado': 'PI',
        'Liderança Responsável': 'Prof. Marcos'
      },
      {
        'Nome Completo': 'Ana Cláudia Ferreira',
        'CPF': '456.789.123-22',
        'Telefone / WhatsApp': '(86) 97777-3333',
        'Numero do titulo': '456789120892',
        'Zona Eleitoral': '002',
        'Seção Eleitoral': '0045',
        'Bairro': 'Mocambinho',
        'Cidade': 'Teresina',
        'Estado': 'PI',
        'Liderança Responsável': 'Vereador João'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 30 }, // Nome Completo
      { wch: 18 }, // CPF
      { wch: 22 }, // Telefone / WhatsApp
      { wch: 20 }, // Numero do titulo
      { wch: 16 }, // Zona Eleitoral
      { wch: 16 }, // Seção Eleitoral
      { wch: 20 }, // Bairro
      { wch: 20 }, // Cidade
      { wch: 10 }, // Estado
      { wch: 26 }  // Liderança Responsável
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo_Eleitores');
    await exportWorkbook(wb, 'modelo_importacao_eleitores', format);
  } else if (type === 'liderancas') {
    const data = [
      {
        'Nome da Liderança': 'Marcos Vinícius Costa',
        'Tipo': 'Liderança Principal',
        'Liderança Pai': '',
        'Telefone / WhatsApp': '(86) 99444-5555',
        'Região de Atuação': 'Zona Leste',
        'Bairro Base': 'Jóquei',
        'Cidade': 'Teresina',
        'Estado': 'PI',
        'Meta de Votos': 500,
        'Status': 'Ativa'
      },
      {
        'Nome da Liderança': 'Carla Roberta Ramos',
        'Tipo': 'Sub-liderança',
        'Liderança Pai': 'Marcos Vinícius Costa',
        'Telefone / WhatsApp': '(86) 98111-2233',
        'Região de Atuação': 'Zona Leste',
        'Bairro Base': 'Ininga',
        'Cidade': 'Teresina',
        'Estado': 'PI',
        'Meta de Votos': 150,
        'Status': 'Ativa'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 28 }, // Nome
      { wch: 22 }, // Tipo
      { wch: 25 }, // Liderança Pai
      { wch: 22 }, // Telefone
      { wch: 20 }, // Região
      { wch: 20 }, // Bairro
      { wch: 20 }, // Cidade
      { wch: 10 }, // Estado
      { wch: 15 }, // Meta
      { wch: 15 }  // Status
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo_Liderancas');
    await exportWorkbook(wb, 'modelo_importacao_liderancas', format);
  } else {
    // locais - Modelo Oficial TSE (Tribunal Superior Eleitoral)
    const data = [
      {
        'ZONA ELEITORAL': 1,
        'MUNICÍPIO': 'TERESINA',
        'SEÇÃO EFETIVA': 246,
        'SEÇÕES AGREGADAS': '509/aptos: 121',
        'LOCAL DE VOTAÇÃO (LV)': 'COLÉGIO SÃO TOMAZ DE AQUINO',
        'ENDEREÇO': 'RUA COELHO DE RESENDE, 2119',
        'BAIRRO': 'Marquês'
      },
      {
        'ZONA ELEITORAL': 1,
        'MUNICÍPIO': 'TERESINA',
        'SEÇÃO EFETIVA': 58,
        'SEÇÕES AGREGADAS': '',
        'LOCAL DE VOTAÇÃO (LV)': 'CEMEI HELENA MARIA DE RODRIGUES CARVALHO',
        'ENDEREÇO': 'RUA JOSÉ MARQUES DA ROCHA 2361',
        'BAIRRO': 'AEROPORTO'
      },
      {
        'ZONA ELEITORAL': 1,
        'MUNICÍPIO': 'TERESINA',
        'SEÇÃO EFETIVA': 59,
        'SEÇÕES AGREGADAS': '',
        'LOCAL DE VOTAÇÃO (LV)': 'CEMEI HELENA MARIA DE RODRIGUES CARVALHO',
        'ENDEREÇO': 'RUA JOSÉ MARQUES DA ROCHA 2361',
        'BAIRRO': 'AEROPORTO'
      },
      {
        'ZONA ELEITORAL': 1,
        'MUNICÍPIO': 'TERESINA',
        'SEÇÃO EFETIVA': 60,
        'SEÇÕES AGREGADAS': '',
        'LOCAL DE VOTAÇÃO (LV)': 'COLÉGIO SÃO TOMAZ DE AQUINO',
        'ENDEREÇO': 'RUA COELHO DE RESENDE, 2119',
        'BAIRRO': 'Marquês'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 16 }, // ZONA ELEITORAL
      { wch: 18 }, // MUNICÍPIO
      { wch: 16 }, // SEÇÃO EFETIVA
      { wch: 22 }, // SEÇÕES AGREGADAS
      { wch: 45 }, // LOCAL DE VOTAÇÃO (LV)
      { wch: 45 }, // ENDEREÇO
      { wch: 25 }  // BAIRRO
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'TSE_Modelo_Locais');
    await exportWorkbook(wb, 'modelo_tse_locais_votacao', format);
  }
}

// ==========================================
// 2. PARSING DE ARQUIVOS (XLSX, XLS, CSV)
// ==========================================
export async function parseSpreadsheetFile(
  file: File,
  targetType: 'eleitores' | 'liderancas' | 'locais'
): Promise<{
  rows: any[];
  totalRawRows: number;
  validCount: number;
  invalidCount: number;
  sheetName: string;
}> {
  const [arrayBuffer, XLSX] = await Promise.all([
    file.arrayBuffer(),
    getXLSX()
  ]);
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const sheetName = workbook.SheetNames[0] || 'Planilha1';
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error('A planilha selecionada está vazia ou inacessível.');
  }

  const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: '',
    raw: false
  });

  if (!rawJson || rawJson.length === 0) {
    throw new Error('Nenhum dado encontrado na primeira aba da planilha.');
  }

  if (targetType === 'eleitores') {
    const parsed = parseVoterRows(rawJson);
    return {
      rows: parsed,
      totalRawRows: rawJson.length,
      validCount: parsed.filter((p) => p.isValid).length,
      invalidCount: parsed.filter((p) => !p.isValid).length,
      sheetName
    };
  } else if (targetType === 'liderancas') {
    const parsed = parseLeaderRows(rawJson);
    return {
      rows: parsed,
      totalRawRows: rawJson.length,
      validCount: parsed.filter((p) => p.isValid).length,
      invalidCount: parsed.filter((p) => !p.isValid).length,
      sheetName
    };
  } else {
    const parsed = parseLocalRows(rawJson);
    return {
      rows: parsed,
      totalRawRows: rawJson.length,
      validCount: parsed.filter((p) => p.isValid).length,
      invalidCount: parsed.filter((p) => !p.isValid).length,
      sheetName
    };
  }
}

function parseVoterRows(rawJson: Record<string, any>[]): ParsedVoterRow[] {
  return rawJson.map((row, index) => {
    // Map columns dynamically
    let nome = '';
    let cpf = '';
    let telefone = '';
    let tituloEleitor = '';
    let zona = '';
    let secao = '';
    let bairro = '';
    let cidade = '';
    let estado = '';
    let lideranca = '';
    const status = 'Pendente';

    for (const [key, value] of Object.entries(row)) {
      const valStr = String(value || '').trim();
      const normKey = normalizeHeaderKey(key);

      if (normKey.includes('nome') || normKey === 'eleitor' || normKey === 'nomecompleto') {
        nome = valStr;
      } else if (normKey.includes('cpf') || normKey === 'documento' || normKey === 'doc') {
        cpf = valStr;
      } else if (normKey.includes('tel') || normKey.includes('cel') || normKey.includes('whats') || normKey.includes('fone')) {
        telefone = valStr;
      } else if (
        normKey.includes('titulo') ||
        normKey.includes('titul') ||
        normKey === 'tituloeleitor' ||
        normKey === 'numerodotitulo' ||
        normKey === 'numtitulo' ||
        normKey === 'inscricao' ||
        normKey.includes('inscr')
      ) {
        tituloEleitor = valStr;
      } else if (normKey.includes('zona') || normKey === 'ze') {
        zona = valStr.replace(/\D/g, '').padStart(3, '0') || valStr;
      } else if (normKey.includes('seca') || normKey.includes('secao') || normKey === 'sec') {
        secao = valStr.replace(/\D/g, '').padStart(4, '0') || valStr;
      } else if (normKey.includes('bairro') || normKey.includes('comunidade')) {
        bairro = valStr;
      } else if (normKey.includes('cidad') || normKey.includes('municip') || normKey === 'mun') {
        cidade = valStr;
      } else if (normKey.includes('estado') || normKey === 'uf' || normKey === 'sguf' || normKey === 'siglauf') {
        estado = valStr.toUpperCase();
      } else if (normKey.includes('lider') || normKey.includes('responsavel') || normKey.includes('coordenador')) {
        lideranca = valStr;
      }
    }

    const cleanCpf = cleanCpfUtil(cpf);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!nome) {
      errors.push('Nome é obrigatório');
    }
    // CPF agora é opcional na importação
    if (cleanCpf && cleanCpf.length !== 11) {
      warnings.push('CPF com formato fora do padrão (11 dígitos)');
    }

    return {
      originalIndex: index + 1,
      nome,
      cpf,
      cleanCpf,
      telefone,
      tituloEleitor,
      zona: zona || '001',
      secao: secao || '',
      bairro: bairro || 'Centro',
      cidade: cidade || 'Teresina',
      estado: estado || 'PI',
      lideranca: lideranca || 'Geral',
      status,
      isValid: errors.length === 0,
      errors,
      warnings
    };
  });
}

function parseLeaderRows(rawJson: Record<string, any>[]): ParsedLeaderRow[] {
  return rawJson.map((row, index) => {
    let nome = '';
    let tipo: 'Liderança Principal' | 'Sub-liderança' = 'Liderança Principal';
    let liderancaPaiNome = '';
    let telefone = '';
    let email = '';
    let regiao = 'Centro';
    let bairro = 'Centro';
    let cidade = '';
    let estado = '';
    let metaVotos = 100;
    let status: 'Ativa' | 'Em Formação' | 'Inativa' = 'Ativa';
    let observacoes = '';

    for (const [key, value] of Object.entries(row)) {
      const valStr = String(value || '').trim();
      const normKey = normalizeHeaderKey(key);

      if (normKey.includes('nome') || normKey === 'lideranca') {
        nome = valStr;
      } else if (normKey.includes('tipo') || normKey.includes('cargo') || normKey.includes('nivel')) {
        if (valStr.toLowerCase().includes('sub')) {
          tipo = 'Sub-liderança';
        } else {
          tipo = 'Liderança Principal';
        }
      } else if (normKey.includes('pai') || normKey.includes('superior') || normKey.includes('coordenadorg') || normKey.includes('vinculad')) {
        liderancaPaiNome = valStr;
      } else if (normKey.includes('tel') || normKey.includes('cel') || normKey.includes('whats')) {
        telefone = valStr;
      } else if (normKey.includes('email') || normKey.includes('mail')) {
        email = valStr;
      } else if (normKey.includes('regiao') || normKey.includes('setor') || normKey.includes('zona')) {
        regiao = valStr;
      } else if (normKey.includes('bairro') || normKey.includes('base')) {
        bairro = valStr;
      } else if (normKey.includes('cidad') || normKey.includes('municip')) {
        cidade = valStr;
      } else if (normKey.includes('estado') || normKey === 'uf') {
        estado = valStr.toUpperCase();
      } else if (normKey.includes('meta') || normKey.includes('votos')) {
        metaVotos = Number(valStr.replace(/\D/g, '')) || 100;
      } else if (normKey.includes('status')) {
        if (valStr.toLowerCase().includes('inat')) status = 'Inativa';
        else if (valStr.toLowerCase().includes('form')) status = 'Em Formação';
        else status = 'Ativa';
      } else if (normKey.includes('obs') || normKey.includes('nota') || normKey.includes('detalhe')) {
        observacoes = valStr;
      }
    }

    const errors: string[] = [];
    if (!nome) errors.push('Nome da liderança é obrigatório');

    return {
      originalIndex: index + 1,
      nome,
      tipo,
      liderancaPaiNome: liderancaPaiNome || undefined,
      telefone,
      email,
      regiao: regiao || 'Centro',
      bairro: bairro || 'Centro',
      cidade: cidade || 'Teresina',
      estado: estado || 'PI',
      metaVotos: metaVotos > 0 ? metaVotos : 100,
      status,
      observacoes,
      isValid: errors.length === 0,
      errors
    };
  });
}

function parseLocalRows(rawJson: Record<string, any>[]): ParsedLocalRow[] {
  // Agrupa múltiplas linhas de seções pertencentes ao mesmo colégio/local de votação (Modelo Oficial TSE)
  const mapLocais = new Map<string, {
    originalIndex: number;
    nome: string;
    tipo: string;
    zona: string;
    secoesSet: Set<string>;
    secoesAgregadasList: string[];
    bairro: string;
    endereco: string;
    capacidadeAprox: number;
    aptosSum: number;
    municipio: string;
    uf: string;
    errors: string[];
  }>();

  rawJson.forEach((row, index) => {
    let nome = '';
    let tipo = '';
    let zona = '';
    let secoesRaw = '';
    let secoesAgregadas = '';
    let bairro = '';
    let endereco = '';
    let capacidadeAprox = 0;
    let aptos = 0;
    let municipio = '';
    let uf = '';

    for (const [key, value] of Object.entries(row)) {
      const valStr = String(value || '').trim();
      if (!valStr) continue;
      const normKey = normalizeHeaderKey(key);

      if (normKey.includes('agregad')) {
        secoesAgregadas = valStr;
      } else if (
        normKey === 'secaoefetiva' ||
        normKey === 'nrsecao' ||
        normKey.includes('efetiva') ||
        (!normKey.includes('agregad') && (normKey.includes('seco') || normKey.includes('secao') || normKey === 'sec'))
      ) {
        secoesRaw = valStr;
      } else if (
        normKey.includes('lv') ||
        normKey.includes('local') ||
        normKey.includes('colegio') ||
        normKey.includes('escola') ||
        normKey.includes('estabelecimento') ||
        normKey.includes('nome')
      ) {
        nome = valStr;
      } else if (normKey.includes('tipo') || normKey.includes('categoria')) {
        tipo = valStr;
      } else if (normKey.includes('zona') || normKey === 'ze' || normKey === 'nrzona') {
        zona = valStr.replace(/\D/g, '').padStart(3, '0');
      } else if (normKey.includes('bairro') || normKey === 'nmbairro') {
        bairro = valStr;
      } else if (normKey.includes('end') || normKey.includes('rua') || normKey.includes('logradouro') || normKey === 'dsendereco') {
        endereco = valStr;
      } else if (normKey.includes('apto') || normKey.includes('capacidad') || normKey.includes('lotacao') || normKey.includes('eleitores')) {
        const numVal = Number(valStr.replace(/\D/g, '')) || 0;
        capacidadeAprox = numVal;
        aptos = numVal;
      } else if (normKey.includes('municipio') || normKey.includes('cidade') || normKey === 'nmmunicipio') {
        municipio = valStr;
      } else if (normKey === 'uf' || normKey === 'sguf' || normKey.includes('estado')) {
        uf = valStr.toUpperCase();
      }
    }

    if (!zona) zona = '001';
    if (!municipio) municipio = 'Teresina';
    if (!uf) uf = 'PI';
    if (!tipo) tipo = 'Colégio Eleitoral';

    // Parse sections
    const secoesParsed = secoesRaw
      ? secoesRaw
          .split(/[,;\-\|\n\r/]+/)
          .map((s) => s.trim().replace(/\D/g, '').padStart(4, '0'))
          .filter((s) => s.length > 0 && s !== '0000')
      : [];

    const normNome = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const groupKey = `${municipio.toLowerCase()}_${zona}_${normNome || `sem_nome_${index}`}`;

    if (mapLocais.has(groupKey)) {
      const existing = mapLocais.get(groupKey)!;
      secoesParsed.forEach((s) => existing.secoesSet.add(s));
      if (secoesAgregadas && !existing.secoesAgregadasList.includes(secoesAgregadas)) {
        existing.secoesAgregadasList.push(secoesAgregadas);
      }
      if (!existing.endereco && endereco) existing.endereco = endereco;
      if (!existing.bairro && bairro) existing.bairro = bairro;
      if (aptos > 0) existing.aptosSum += aptos;
      if (capacidadeAprox > existing.capacidadeAprox) existing.capacidadeAprox = capacidadeAprox;
    } else {
      const errors: string[] = [];
      if (!nome) errors.push('Nome do colégio/local é obrigatório');

      const secoesSet = new Set<string>();
      secoesParsed.forEach((s) => secoesSet.add(s));

      mapLocais.set(groupKey, {
        originalIndex: index + 1,
        nome,
        tipo,
        zona,
        secoesSet,
        secoesAgregadasList: secoesAgregadas ? [secoesAgregadas] : [],
        bairro,
        endereco,
        capacidadeAprox: capacidadeAprox || 1000,
        aptosSum: aptos,
        municipio,
        uf,
        errors
      });
    }
  });

  return Array.from(mapLocais.values()).map((item, idx) => {
    const secoesArr = Array.from(item.secoesSet).sort((a, b) => Number(a) - Number(b));
    const capacidadeFinal = item.aptosSum > 0 ? item.aptosSum : (item.capacidadeAprox || (secoesArr.length > 0 ? secoesArr.length * 350 : 1000));

    return {
      originalIndex: idx + 1,
      nome: item.nome,
      tipo: item.tipo,
      zona: item.zona,
      secoes: secoesArr.length > 0 ? secoesArr : ['0001'],
      secoesAgregadas: item.secoesAgregadasList.join('; '),
      bairro: item.bairro,
      endereco: item.endereco,
      capacidadeAprox: capacidadeFinal,
      municipio: item.municipio,
      uf: item.uf,
      isValid: item.errors.length === 0,
      errors: item.errors
    };
  });
}

// ==========================================
// 3. EXPORTAÇÃO REAL DE DADOS
// ==========================================

// ==========================================
// 3. EXPORTADORES REAIS DE RELATÓRIOS (EXCEL, CSV E PDF)
// ==========================================

export type ExportReportFormat = 'xlsx' | 'csv' | 'pdf';

// 3.1 Relatório Completo de Eleitores
export async function exportVotersReal(
  voters: Eleitor[],
  conflictingIds: Set<string>,
  format: ExportReportFormat
) {
  if (format === 'pdf') {
    const { jsPDF, autoTable } = await getPDFModules();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const timestamp = new Date().toLocaleString('pt-BR');

    // Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Relatório Oficial de Eleitores Cadastrados', 40, 40);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Gerado em: ${timestamp}  |  Total de Registros: ${voters.length}  |  Auditoria de Conflitos: ${conflictingIds.size} duplicidades detectadas`,
      40,
      56
    );

    // Divider
    doc.setDrawColor(226, 232, 240);
    doc.line(40, 65, 802, 65);

    const tableRows = voters.map((v, i) => {
      const isConflict = conflictingIds.has(v.id);
      return [
        String(i + 1),
        v.nome || '',
        formatCpf(v.cpf),
        v.tituloEleitor || '-',
        v.telefone || '-',
        `${v.zona || ''} / ${v.secao || ''}`,
        v.bairro || '-',
        v.lideranca || 'Sem liderança',
        v.status || 'Pendente',
        isConflict ? 'CONFLITO' : 'Validado'
      ];
    });

    autoTable(doc, {
      startY: 75,
      head: [
        [
          '#',
          'Nome do Eleitor',
          'CPF',
          'Título',
          'Telefone',
          'Zona/Seção',
          'Bairro',
          'Liderança',
          'Status',
          'Auditoria'
        ]
      ],
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 4,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.5
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 140 },
        2: { cellWidth: 75 },
        3: { cellWidth: 70 },
        4: { cellWidth: 75 },
        5: { cellWidth: 60 },
        6: { cellWidth: 75 },
        7: { cellWidth: 100 },
        8: { cellWidth: 65 },
        9: { cellWidth: 60, halign: 'center' }
      },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.index === 9) {
          if (data.cell.raw === 'CONFLITO') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [16, 185, 129];
          }
        }
      },
      didDrawPage: function (data) {
        const str = `Página ${data.pageNumber} de ${doc.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(str, 802 - doc.getTextWidth(str) - 40, 575);
        doc.text('Sistema de Gestão Eleitoral & Campanha Política', 40, 575);
      },
      margin: { left: 40, right: 40, top: 40, bottom: 40 }
    });

    const fileTimestamp = new Date().toISOString().slice(0, 10);
    doc.save(`relatorio_eleitores_${fileTimestamp}.pdf`);
    return;
  }

  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();

  const data = voters.map((v) => {
    const isConflict = conflictingIds.has(v.id);
    let dateStr = '';
    if (v.dataCadastro) {
      if (typeof v.dataCadastro?.toDate === 'function') {
        dateStr = v.dataCadastro.toDate().toLocaleString('pt-BR');
      } else if (v.dataCadastro instanceof Date) {
        dateStr = v.dataCadastro.toLocaleString('pt-BR');
      }
    }

    return {
      'Nome Completo': v.nome || '',
      'CPF': formatCpf(v.cpf),
      'Título de Eleitor': v.tituloEleitor || '',
      'Telefone': v.telefone || '',
      'Zona Eleitoral': v.zona || '',
      'Seção Eleitoral': v.secao || '',
      'Bairro': v.bairro || '',
      'Cidade': v.cidade || 'Teresina',
      'Estado': v.estado || 'PI',
      'Liderança Responsável': v.lideranca || 'Sem liderança',
      'Status': v.status || 'Pendente',
      'Conflito de CPF': isConflict ? 'SIM (Duplicidade Detectada)' : 'NÃO',
      'Data de Cadastro': dateStr
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 32 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 },
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 10 },
    { wch: 26 },
    { wch: 16 },
    { wch: 26 },
    { wch: 22 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Eleitores');
  await exportWorkbook(wb, 'relatorio_completo_eleitores', format);
}

// 3.2 Relatório Hierárquico de Lideranças
export async function exportLiderancasReal(
  liderancas: Lideranca[],
  voters: Eleitor[],
  format: ExportReportFormat
) {
  // Precalculate voters count by leader
  const countByLeader = new Map<string, number>();
  voters.forEach((v) => {
    const leaderKey = (v.lideranca || '').trim().toLowerCase();
    if (leaderKey) {
      countByLeader.set(leaderKey, (countByLeader.get(leaderKey) || 0) + 1);
    }
  });

  if (format === 'pdf') {
    const { jsPDF, autoTable } = await getPDFModules();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const timestamp = new Date().toLocaleString('pt-BR');

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Relatório de Lideranças & Metas de Votos', 40, 40);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Gerado em: ${timestamp}  |  Total de Lideranças: ${liderancas.length}  |  Total de Eleitores Cadastrados: ${voters.length}`,
      40,
      56
    );

    doc.setDrawColor(226, 232, 240);
    doc.line(40, 65, 802, 65);

    const tableRows = liderancas.map((l, i) => {
      const cleanLeaderName = (l.nome || '').trim().toLowerCase();
      const eleitoresCadastrados = countByLeader.get(cleanLeaderName) || 0;
      const meta = Number(l.metaVotos) || 1;
      const percent = Math.round((eleitoresCadastrados / meta) * 100);

      return [
        String(i + 1),
        l.nome || '',
        l.tipo || 'Liderança Principal',
        l.liderancaPaiNome || '-',
        l.regiao || l.bairro || '-',
        l.telefone || '-',
        String(Number(l.metaVotos) || 0),
        String(eleitoresCadastrados),
        `${percent}%`,
        l.status || 'Ativa'
      ];
    });

    autoTable(doc, {
      startY: 75,
      head: [
        [
          '#',
          'Liderança',
          'Tipo',
          'Vínculo Principal',
          'Região/Bairro',
          'Telefone',
          'Meta',
          'Captados',
          '% Meta',
          'Status'
        ]
      ],
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 4,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.5
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        1: { cellWidth: 150 },
        2: { cellWidth: 90 },
        3: { cellWidth: 110 },
        4: { cellWidth: 85 },
        5: { cellWidth: 80 },
        6: { cellWidth: 50, halign: 'right' },
        7: { cellWidth: 55, halign: 'right' },
        8: { cellWidth: 55, halign: 'center' },
        9: { cellWidth: 60, halign: 'center' }
      },
      didDrawPage: function (data) {
        const str = `Página ${data.pageNumber} de ${doc.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(str, 802 - doc.getTextWidth(str) - 40, 575);
        doc.text('Sistema de Gestão Eleitoral & Campanha Política', 40, 575);
      },
      margin: { left: 40, right: 40, top: 40, bottom: 40 }
    });

    const fileTimestamp = new Date().toISOString().slice(0, 10);
    doc.save(`relatorio_liderancas_metas_${fileTimestamp}.pdf`);
    return;
  }

  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();

  const data = liderancas.map((l) => {
    const cleanLeaderName = (l.nome || '').trim().toLowerCase();
    const eleitoresCadastrados = countByLeader.get(cleanLeaderName) || 0;
    const meta = Number(l.metaVotos) || 1;
    const percent = Math.round((eleitoresCadastrados / meta) * 100);

    return {
      'Nome da Liderança': l.nome || '',
      'Tipo de Liderança': l.tipo || 'Liderança Principal',
      'Liderança Principal Vinculada': l.liderancaPaiNome || '-',
      'Telefone': l.telefone || '',
      'E-mail': l.email || '',
      'Região de Atuação': l.regiao || '',
      'Bairro Base': l.bairro || '',
      'Cidade': l.cidade || 'Teresina',
      'Estado': l.estado || 'PI',
      'Meta de Votos Estipulada': Number(l.metaVotos) || 0,
      'Eleitores Cadastrados no Banco': eleitoresCadastrados,
      '% Atingimento da Meta': `${percent}%`,
      'Status': l.status || 'Ativa',
      'Observações': l.observacoes || ''
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 30 },
    { wch: 22 },
    { wch: 28 },
    { wch: 18 },
    { wch: 26 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 10 },
    { wch: 24 },
    { wch: 28 },
    { wch: 22 },
    { wch: 14 },
    { wch: 40 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Liderancas');
  await exportWorkbook(wb, 'relatorio_liderancas_metas', format);
}

// 3.3 Relatório de Locais e Seções de Votação (Padrão Oficial TSE)
export async function exportLocaisReal(
  locais: LocalVotacao[],
  voters: Eleitor[],
  format: ExportReportFormat,
  mode: 'tse' | 'resumo' = 'tse'
) {
  if (mode === 'resumo') {
    // Relatório consolidado por estabelecimento com contagem de eleitores mapeados
    const votersBySection = new Map<string, number>();
    voters.forEach((v) => {
      if (v.zona && v.secao) {
        const key = `${v.zona.padStart(3, '0')}-${v.secao.padStart(4, '0')}`;
        votersBySection.set(key, (votersBySection.get(key) || 0) + 1);
      }
    });

    if (format === 'pdf') {
      const { jsPDF, autoTable } = await getPDFModules();
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const timestamp = new Date().toLocaleString('pt-BR');

      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Relatório Consolidado de Colégios e Locais de Votação', 40, 40);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Gerado em: ${timestamp}  |  Total de Estabelecimentos: ${locais.length}  |  Visão Consolidada`,
        40,
        55
      );

      doc.setDrawColor(226, 232, 240);
      doc.line(40, 63, 802, 63);

      const tableRows = locais.map((local, i) => {
        const secoes = Array.isArray(local.secoes) ? local.secoes : [];
        let mappedVotersCount = 0;
        secoes.forEach((sec) => {
          const key = `${(local.zona || '001').padStart(3, '0')}-${String(sec).padStart(4, '0')}`;
          mappedVotersCount += votersBySection.get(key) || 0;
        });

        return [
          String(i + 1),
          local.nome || '',
          local.tipo || 'Escola',
          local.zona || '',
          String(secoes.length),
          secoes.slice(0, 8).join(', ') + (secoes.length > 8 ? '...' : ''),
          local.bairro || '',
          local.endereco || '',
          String(Number(local.capacidadeAprox) || 0),
          String(mappedVotersCount)
        ];
      });

      autoTable(doc, {
        startY: 72,
        head: [
          [
            '#',
            'Estabelecimento / Colégio',
            'Tipo',
            'Zona',
            'Qtd Seções',
            'Seções',
            'Bairro',
            'Endereço',
            'Capacidade',
            'Eleitores Mapeados'
          ]
        ],
        body: tableRows,
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 3.5,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.5
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        margin: { left: 40, right: 40, top: 40, bottom: 40 }
      });

      const fileTimestamp = new Date().toISOString().slice(0, 10);
      doc.save(`relatorio_locais_resumido_${fileTimestamp}.pdf`);
      return;
    }

    const XLSX = await getXLSX();
    const wb = XLSX.utils.book_new();

    const data = locais.map((local) => {
      const secoes = Array.isArray(local.secoes) ? local.secoes : [];
      let mappedVotersCount = 0;
      secoes.forEach((sec) => {
        const key = `${(local.zona || '001').padStart(3, '0')}-${String(sec).padStart(4, '0')}`;
        mappedVotersCount += votersBySection.get(key) || 0;
      });

      return {
        'Nome do Estabelecimento / Colégio': local.nome || '',
        'Tipo de Local': local.tipo || 'Escola',
        'Zona Eleitoral': local.zona || '',
        'Qtd de Seções Alocadas': secoes.length,
        'Seções Eleitorais': secoes.join(', '),
        'Bairro': local.bairro || '',
        'Endereço Completo': local.endereco || '',
        'Capacidade Estimada': Number(local.capacidadeAprox) || 0,
        'Eleitores Reais Mapeados no Banco': mappedVotersCount,
        'Município': local.municipio || 'Teresina',
        'UF': local.uf || 'PI'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 35 },
      { wch: 22 },
      { wch: 15 },
      { wch: 22 },
      { wch: 35 },
      { wch: 20 },
      { wch: 30 },
      { wch: 20 },
      { wch: 32 },
      { wch: 18 },
      { wch: 8 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Locais_Resumo');
    await exportWorkbook(wb, 'relatorio_locais_resumido', format);
    return;
  }

  // Padrão OFICIAL TSE (Modelo da foto do Tribunal Superior Eleitoral):
  // Colunas exatas: ZONA ELEITORAL | MUNICÍPIO | SEÇÃO EFETIVA | SEÇÕES AGREGADAS | LOCAL DE VOTAÇÃO (LV) | ENDEREÇO | BAIRRO
  const extractSecoes = (local: LocalVotacao): string[] => {
    const list: string[] = [];
    if (Array.isArray(local.secoes)) {
      local.secoes.forEach((s) => {
        const parts = String(s).split(/[,;/]+/);
        parts.forEach((p) => {
          const clean = p.trim();
          if (clean) list.push(clean);
        });
      });
    } else if (typeof local.secoes === 'string' && local.secoes.trim()) {
      const parts = local.secoes.split(/[,;/]+/);
      parts.forEach((p) => {
        const clean = p.trim();
        if (clean) list.push(clean);
      });
    }
    if (local.secao && !list.includes(String(local.secao).trim())) {
      list.push(String(local.secao).trim());
    }
    return Array.from(new Set(list));
  };

  const tseRows: {
    'ZONA ELEITORAL': number | string;
    'MUNICÍPIO': string;
    'SEÇÃO EFETIVA': number | string;
    'SEÇÕES AGREGADAS': string;
    'LOCAL DE VOTAÇÃO (LV)': string;
    'ENDEREÇO': string;
    'BAIRRO': string;
  }[] = [];

  locais.forEach((local) => {
    const rawZona = String(local.zona || '1').replace(/\D/g, '');
    const zonaVal = rawZona ? Number(rawZona) : local.zona || 1;
    const municipioVal = (local.municipio || 'TERESINA').trim().toUpperCase();
    const nomeVal = (local.nome || '').trim().toUpperCase();
    const enderecoVal = (local.endereco || '').trim().toUpperCase();
    const bairroVal = (local.bairro || '').trim();

    const secoes = extractSecoes(local);

    if (secoes.length === 0) {
      tseRows.push({
        'ZONA ELEITORAL': zonaVal,
        'MUNICÍPIO': municipioVal,
        'SEÇÃO EFETIVA': '',
        'SEÇÕES AGREGADAS': '',
        'LOCAL DE VOTAÇÃO (LV)': nomeVal,
        'ENDEREÇO': enderecoVal,
        'BAIRRO': bairroVal
      });
      return;
    }

    secoes.forEach((sec) => {
      const rawSec = String(sec).replace(/\D/g, '');
      const secaoVal = rawSec ? Number(rawSec) : sec;

      let agregadasVal = '';
      if (local.secoesAgregadas) {
        if (typeof local.secoesAgregadas === 'object' && (local.secoesAgregadas as any)[String(sec)]) {
          agregadasVal = (local.secoesAgregadas as any)[String(sec)];
        } else if (typeof local.secoesAgregadas === 'string') {
          agregadasVal = local.secoesAgregadas;
        }
      }

      tseRows.push({
        'ZONA ELEITORAL': zonaVal,
        'MUNICÍPIO': municipioVal,
        'SEÇÃO EFETIVA': secaoVal,
        'SEÇÕES AGREGADAS': agregadasVal,
        'LOCAL DE VOTAÇÃO (LV)': nomeVal,
        'ENDEREÇO': enderecoVal,
        'BAIRRO': bairroVal
      });
    });
  });

  // Ordenação idêntica ao TSE:
  // 1. ZONA ELEITORAL (numérica)
  // 2. SEÇÃO EFETIVA (numérica)
  // 3. LOCAL DE VOTAÇÃO (LV)
  tseRows.sort((a, b) => {
    const zA = typeof a['ZONA ELEITORAL'] === 'number' ? a['ZONA ELEITORAL'] : Number(a['ZONA ELEITORAL']) || 0;
    const zB = typeof b['ZONA ELEITORAL'] === 'number' ? b['ZONA ELEITORAL'] : Number(b['ZONA ELEITORAL']) || 0;
    if (zA !== zB) return zA - zB;

    const sA = typeof a['SEÇÃO EFETIVA'] === 'number' ? a['SEÇÃO EFETIVA'] : Number(a['SEÇÃO EFETIVA']) || 0;
    const sB = typeof b['SEÇÃO EFETIVA'] === 'number' ? b['SEÇÃO EFETIVA'] : Number(b['SEÇÃO EFETIVA']) || 0;
    if (sA !== sB) return sA - sB;

    return a['LOCAL DE VOTAÇÃO (LV)'].localeCompare(b['LOCAL DE VOTAÇÃO (LV)'], 'pt-BR');
  });

  if (format === 'pdf') {
    const { jsPDF, autoTable } = await getPDFModules();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const timestamp = new Date().toLocaleString('pt-BR');

    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Tabela de Locais e Seções de Votação (Padrão Oficial TSE)', 40, 40);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Gerado em: ${timestamp}  |  Total de Seções Mapeadas: ${tseRows.length}  |  Tribunal Superior Eleitoral (TSE)`,
      40,
      55
    );

    doc.setDrawColor(226, 232, 240);
    doc.line(40, 63, 802, 63);

    const tableRows = tseRows.map((r) => [
      String(r['ZONA ELEITORAL']),
      r['MUNICÍPIO'],
      String(r['SEÇÃO EFETIVA']),
      r['SEÇÕES AGREGADAS'],
      r['LOCAL DE VOTAÇÃO (LV)'],
      r['ENDEREÇO'],
      r['BAIRRO']
    ]);

    autoTable(doc, {
      startY: 72,
      head: [
        [
          'ZONA ELEITORAL',
          'MUNICÍPIO',
          'SEÇÃO EFETIVA',
          'SEÇÕES AGREGADAS',
          'LOCAL DE VOTAÇÃO (LV)',
          'ENDEREÇO',
          'BAIRRO'
        ]
      ],
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 3.5,
        textColor: [30, 41, 59],
        lineColor: [203, 213, 225],
        lineWidth: 0.5
      },
      headStyles: {
        fillColor: [68, 114, 196], // Cor azul suave oficial TSE
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 50, halign: 'center' }, // ZONA ELEITORAL
        1: { cellWidth: 70 },                  // MUNICÍPIO
        2: { cellWidth: 55, halign: 'center' }, // SEÇÃO EFETIVA
        3: { cellWidth: 75 },                  // SEÇÕES AGREGADAS
        4: { cellWidth: 185 },                 // LOCAL DE VOTAÇÃO (LV)
        5: { cellWidth: 205 },                 // ENDEREÇO
        6: { cellWidth: 120 }                  // BAIRRO
      },
      didDrawPage: function (data) {
        const str = `Página ${data.pageNumber} de ${doc.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(str, 802 - doc.getTextWidth(str) - 40, 575);
        doc.text('Planilha Oficial TSE - Mapeamento de Locais e Seções', 40, 575);
      },
      margin: { left: 40, right: 40, top: 40, bottom: 40 }
    });

    const fileTimestamp = new Date().toISOString().slice(0, 10);
    doc.save(`tse_locais_e_secoes_votacao_${fileTimestamp}.pdf`);
    return;
  }

  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(tseRows);

  ws['!cols'] = [
    { wch: 16 }, // ZONA ELEITORAL
    { wch: 18 }, // MUNICÍPIO
    { wch: 16 }, // SEÇÃO EFETIVA
    { wch: 22 }, // SEÇÕES AGREGADAS
    { wch: 45 }, // LOCAL DE VOTAÇÃO (LV)
    { wch: 45 }, // ENDEREÇO
    { wch: 25 }  // BAIRRO
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'TSE_Locais_Secoes');
  await exportWorkbook(wb, 'tse_locais_e_secoes_votacao', format);
}

// 3.4 Relatório de Conflitos e Duplicidades de CPF
export async function exportConflitosReal(
  conflictGroups: CpfConflictGroup[],
  format: ExportReportFormat
) {
  if (format === 'pdf') {
    const { jsPDF, autoTable } = await getPDFModules();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const timestamp = new Date().toLocaleString('pt-BR');

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('Relatório de Auditoria: Conflitos e Duplicidades de CPF', 40, 40);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Gerado em: ${timestamp}  |  Total de Grupos em Disputa: ${conflictGroups.length}  |  CPFs Registrados por Múltiplas Lideranças`,
      40,
      56
    );

    doc.setDrawColor(254, 202, 202);
    doc.line(40, 65, 802, 65);

    const tableRows: any[] = [];
    conflictGroups.forEach((group, idx) => {
      group.voters.forEach((voter) => {
        tableRows.push([
          `#${idx + 1}`,
          group.formattedCpf,
          voter.nome || '',
          voter.lideranca || 'Sem liderança',
          voter.telefone || '-',
          `${voter.zona || ''} / ${voter.secao || ''}`,
          voter.bairro || '-',
          `${group.count} lideranças`,
          group.liderancas.join(' vs ')
        ]);
      });
    });

    autoTable(doc, {
      startY: 75,
      head: [
        [
          'Grupo',
          'CPF Disputado',
          'Nome do Eleitor',
          'Liderança Vinculada',
          'Telefone',
          'Zona/Seção',
          'Bairro',
          'Disputa',
          'Lideranças Conflitantes'
        ]
      ],
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 4,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.5
      },
      headStyles: {
        fillColor: [185, 28, 28],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      alternateRowStyles: {
        fillColor: [254, 242, 242]
      },
      columnStyles: {
        0: { cellWidth: 40, halign: 'center' },
        1: { cellWidth: 85, fontStyle: 'bold' },
        2: { cellWidth: 130 },
        3: { cellWidth: 110 },
        4: { cellWidth: 75 },
        5: { cellWidth: 65 },
        6: { cellWidth: 75 },
        7: { cellWidth: 60, halign: 'center' },
        8: { cellWidth: 120 }
      },
      didDrawPage: function (data) {
        const str = `Página ${data.pageNumber} de ${doc.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(str, 802 - doc.getTextWidth(str) - 40, 575);
        doc.text('Auditoria Oficial de Campanha - Resolução de Duplicidades', 40, 575);
      },
      margin: { left: 40, right: 40, top: 40, bottom: 40 }
    });

    const fileTimestamp = new Date().toISOString().slice(0, 10);
    doc.save(`relatorio_auditoria_conflitos_cpf_${fileTimestamp}.pdf`);
    return;
  }

  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();

  const data: any[] = [];
  conflictGroups.forEach((group, idx) => {
    group.voters.forEach((voter) => {
      data.push({
        'ID Grupo': `CONFLITO-${idx + 1}`,
        'CPF em Disputa': group.formattedCpf,
        'Nome Cadastrado': voter.nome || '',
        'Liderança Reivindicante': voter.lideranca || 'Sem liderança',
        'Telefone': voter.telefone || '',
        'Zona Eleitoral': voter.zona || '',
        'Seção': voter.secao || '',
        'Bairro': voter.bairro || '',
        'Total de Lideranças Disputando': group.count,
        'Lideranças em Conflito': group.liderancas.join(' vs ')
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 15 },
    { wch: 18 },
    { wch: 30 },
    { wch: 26 },
    { wch: 18 },
    { wch: 15 },
    { wch: 15 },
    { wch: 20 },
    { wch: 28 },
    { wch: 35 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Conflitos_CPF');
  await exportWorkbook(wb, 'relatorio_conflitos_cpf', format);
}
