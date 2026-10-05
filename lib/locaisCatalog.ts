import { LocalVotacao } from '@/context/CampaignContext';
import { parseSecoesAgregadas } from '@/lib/importExportUtils';

export interface LocalConflictItem {
  id: string;
  type: 'secao_duplicada' | 'divergencia_dados';
  titulo: string;
  descricao: string;
  zona: string;
  secaoConflitante?: string;
  localExistente: LocalVotacao;
  localImportado: Omit<LocalVotacao, 'id'>;
  divergencias?: { campo: string; valorAtual: string; valorNovo: string }[];
}

export interface CrossMatchResult {
  criados: Omit<LocalVotacao, 'id'>[];
  atualizados: { id: string; dados: Partial<LocalVotacao> }[];
  identicos: number;
  conflitos: LocalConflictItem[];
}

// ==================== CATÁLOGO OFICIAL: TERESINA - PI ====================
export const LOCAIS_TERESINA_PI: Omit<LocalVotacao, 'id'>[] = [
  // ZONA 001 - CENTRO / VERMELHA / PIÇARRA / SUL CENTRAL
  {
    nome: 'Unidade Escolar Zacarias de Góis (Liceu Piauiense)',
    tipo: 'Escola Estadual',
    bairro: 'Centro',
    zona: '001',
    secoes: ['0001', '0002', '0003', '0004', '0005', '0006', '0042'],
    endereco: 'Praça Landri Sales, s/n - Centro',
    capacidadeAprox: 2800,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Colégio Diocesano',
    tipo: 'Colégio Particular',
    bairro: 'Centro',
    zona: '001',
    secoes: ['0010', '0011', '0012', '0013', '0014', '0015'],
    endereco: 'Rua Desembargador Pires de Castro, 140 - Centro',
    capacidadeAprox: 2500,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Colégio Sagrado Coração de Jesus (Colégio das Irmãs)',
    tipo: 'Colégio Particular',
    bairro: 'Centro',
    zona: '001',
    secoes: ['0020', '0021', '0022', '0023', '0024'],
    endereco: 'Av. Frei Serafim, 1985 - Centro',
    capacidadeAprox: 2100,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Instituto Federal do Piauí (IFPI - Campus Central)',
    tipo: 'Faculdade / Universidade',
    bairro: 'Centro',
    zona: '001',
    secoes: ['0030', '0031', '0032', '0033', '0034', '0035', '0036'],
    endereco: 'Praça da Liberdade, 1597 - Centro',
    capacidadeAprox: 3200,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Unidade Escolar Benjamin Batista',
    tipo: 'Escola Estadual',
    bairro: 'Vermelha',
    zona: '001',
    secoes: ['0050', '0051', '0052', '0053', '0054'],
    endereco: 'Rua Barroso, 2100 - Vermelha',
    capacidadeAprox: 1900,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Unidade Escolar Nair Veloso',
    tipo: 'Escola Estadual',
    bairro: 'Monte Castelo',
    zona: '001',
    secoes: ['0060', '0061', '0062', '0063'],
    endereco: 'Rua Benjamin Constant, 1200 - Monte Castelo',
    capacidadeAprox: 1600,
    municipio: 'Teresina',
    uf: 'PI'
  },

  // ZONA 002 - ZONA NORTE (Mocambinho, Buenos Aires, Matadouro, Primavera, etc.)
  {
    nome: 'Instituto Superior de Educação Antonino Freire (ISEAF)',
    tipo: 'Faculdade / Universidade',
    bairro: 'Matadouro',
    zona: '002',
    secoes: ['0070', '0071', '0072', '0073', '0074', '0075'],
    endereco: 'Praça Rio Branco, s/n - Matadouro',
    capacidadeAprox: 2600,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Universidade Estadual do Piauí (UESPI - Campus Torquato Neto)',
    tipo: 'Faculdade / Universidade',
    bairro: 'Pirajá',
    zona: '002',
    secoes: ['0080', '0081', '0082', '0083', '0084', '0085', '0086'],
    endereco: 'Rua João Cabral, 2231 - Pirajá',
    capacidadeAprox: 3500,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'CEEP José Pacífico de Moura Neto',
    tipo: 'CIEP / Centro Integrado',
    bairro: 'Mocambinho',
    zona: '002',
    secoes: ['0090', '0091', '0092', '0093', '0094'],
    endereco: 'Av. Jornalista Josípio Lustosa, s/n - Mocambinho',
    capacidadeAprox: 2300,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Unidade Escolar Professor João Clímaco d\'Almeida',
    tipo: 'Escola Estadual',
    bairro: 'Mocambinho',
    zona: '002',
    secoes: ['0101', '0102', '0103', '0104'],
    endereco: 'Setor A, Quadra 12 - Mocambinho',
    capacidadeAprox: 1700,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Premen Norte - U.E. Professora Julia Nunes',
    tipo: 'Escola Estadual',
    bairro: 'Buenos Aires',
    zona: '002',
    secoes: ['0110', '0111', '0112', '0113', '0114'],
    endereco: 'Rua Desembargador Freitas, s/n - Buenos Aires',
    capacidadeAprox: 1850,
    municipio: 'Teresina',
    uf: 'PI'
  },

  // ZONA 063 - ZONA LESTE (Jóquei, Fátima, Ininga, São Cristóvão, etc.)
  {
    nome: 'Universidade Federal do Piauí (UFPI - CCHL / CCE)',
    tipo: 'Faculdade / Universidade',
    bairro: 'Ininga',
    zona: '063',
    secoes: ['0201', '0202', '0203', '0204', '0205', '0206', '0207'],
    endereco: 'Campus Universitário Ministro Petrônio Portella - Ininga',
    capacidadeAprox: 4200,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Unidade Escolar Professor Darcy Araújo',
    tipo: 'Escola Estadual',
    bairro: 'Fátima',
    zona: '063',
    secoes: ['0210', '0211', '0212', '0213', '0214'],
    endereco: 'Av. Nossa Senhora de Fátima, 1145 - Fátima',
    capacidadeAprox: 2100,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Colégio CEV - Unidade Kennedy',
    tipo: 'Colégio Particular',
    bairro: 'São Cristóvão',
    zona: '063',
    secoes: ['0220', '0221', '0222', '0223'],
    endereco: 'Av. Presidente Kennedy, 1500 - São Cristóvão',
    capacidadeAprox: 1950,
    municipio: 'Teresina',
    uf: 'PI'
  },

  // ZONA 097 - ZONA SUDESTE (Grande Dirceu, Itararé, Redenção)
  {
    nome: 'Unidade Escolar Dom Severino',
    tipo: 'Escola Estadual',
    bairro: 'Parque Itararé',
    zona: '097',
    secoes: ['0301', '0302', '0303', '0304', '0305'],
    endereco: 'Av. Joaquim Nelson, s/n - Parque Itararé',
    capacidadeAprox: 2400,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Unidade Escolar Raldir Cavalcante Bastos',
    tipo: 'Escola Estadual',
    bairro: 'Dirceu Arcoverde II',
    zona: '097',
    secoes: ['0310', '0311', '0312', '0313', '0314', '0315'],
    endereco: 'Rua Deputado Paulo Ferraz, s/n - Dirceu II',
    capacidadeAprox: 2700,
    municipio: 'Teresina',
    uf: 'PI'
  },

  // ZONA 098 - ZONA SUL (Lourival Parente, Parque Piauí, Promorar, Saci)
  {
    nome: 'Unidade Escolar Lourival Parente',
    tipo: 'Escola Estadual',
    bairro: 'Lourival Parente',
    zona: '098',
    secoes: ['0401', '0402', '0403', '0404', '0405'],
    endereco: 'Av. Prefeito Wall Ferraz, s/n - Lourival Parente',
    capacidadeAprox: 2200,
    municipio: 'Teresina',
    uf: 'PI'
  },
  {
    nome: 'Unidade Escolar Deputado Fernando Monteiro',
    tipo: 'Escola Estadual',
    bairro: 'Promorar',
    zona: '098',
    secoes: ['0410', '0411', '0412', '0413', '0414'],
    endereco: 'Quadra 25, s/n - Conjunto Promorar',
    capacidadeAprox: 2300,
    municipio: 'Teresina',
    uf: 'PI'
  }
];

// ==================== CATÁLOGO OFICIAL: PARNAÍBA - PI ====================
export const LOCAIS_PARNAIBA_PI: Omit<LocalVotacao, 'id'>[] = [
  {
    nome: 'Unidade Escolar Lima Rebelo',
    tipo: 'Escola Estadual',
    bairro: 'Centro',
    zona: '003',
    secoes: ['0001', '0002', '0003', '0004'],
    endereco: 'Rua Benjamin Constant, 450 - Centro',
    capacidadeAprox: 1600,
    municipio: 'Parnaíba',
    uf: 'PI'
  },
  {
    nome: 'Universidade Federal do Delta do Parnaíba (UFDPar)',
    tipo: 'Faculdade / Universidade',
    bairro: 'Nossa Senhora de Fátima',
    zona: '003',
    secoes: ['0015', '0016', '0017', '0018', '0019'],
    endereco: 'Av. São Sebastião, 2819 - Nossa Senhora de Fátima',
    capacidadeAprox: 2800,
    municipio: 'Parnaíba',
    uf: 'PI'
  },
  {
    nome: 'Unidade Escolar Chagas Rodrigues',
    tipo: 'Escola Estadual',
    bairro: 'São José',
    zona: '004',
    secoes: ['0030', '0031', '0032', '0033'],
    endereco: 'Rua Tabajara, 120 - São José',
    capacidadeAprox: 1500,
    municipio: 'Parnaíba',
    uf: 'PI'
  }
];

// ==================== CATÁLOGO OFICIAL: FORTALEZA - CE ====================
export const LOCAIS_FORTALEZA_CE: Omit<LocalVotacao, 'id'>[] = [
  {
    nome: 'Colégio Militar de Fortaleza',
    tipo: 'Colégio Militar',
    bairro: 'Aldeota',
    zona: '001',
    secoes: ['0001', '0002', '0003', '0004', '0005', '0006'],
    endereco: 'Av. Santos Dumont, 1687 - Aldeota',
    capacidadeAprox: 3200,
    municipio: 'Fortaleza',
    uf: 'CE'
  },
  {
    nome: 'Liceu do Ceará',
    tipo: 'Escola Estadual',
    bairro: 'Jacarecanga',
    zona: '002',
    secoes: ['0010', '0011', '0012', '0013', '0014', '0015'],
    endereco: 'Praça Gustavo Augusto da Frota, s/n - Jacarecanga',
    capacidadeAprox: 2900,
    municipio: 'Fortaleza',
    uf: 'CE'
  },
  {
    nome: 'Universidade Federal do Ceará (UFC - Campus Benfica)',
    tipo: 'Faculdade / Universidade',
    bairro: 'Benfica',
    zona: '003',
    secoes: ['0025', '0026', '0027', '0028', '0029'],
    endereco: 'Av. da Universidade, 2853 - Benfica',
    capacidadeAprox: 3100,
    municipio: 'Fortaleza',
    uf: 'CE'
  }
];

// ==================== CATÁLOGO OFICIAL: SÃO LUÍS - MA ====================
export const LOCAIS_SAO_LUIS_MA: Omit<LocalVotacao, 'id'>[] = [
  {
    nome: 'Centro de Ensino Liceu Maranhense',
    tipo: 'Escola Estadual',
    bairro: 'Centro',
    zona: '001',
    secoes: ['0001', '0002', '0003', '0004', '0005'],
    endereco: 'Parque 13 de Maio, s/n - Centro',
    capacidadeAprox: 2700,
    municipio: 'São Luís',
    uf: 'MA'
  },
  {
    nome: 'Universidade Federal do Maranhão (UFMA - Bacanga)',
    tipo: 'Faculdade / Universidade',
    bairro: 'Vila Bacanga',
    zona: '002',
    secoes: ['0020', '0021', '0022', '0023', '0024', '0025'],
    endereco: 'Av. dos Portugueses, 1966 - Vila Bacanga',
    capacidadeAprox: 3500,
    municipio: 'São Luís',
    uf: 'MA'
  }
];

// ==================== CATÁLOGO OFICIAL: SÃO PAULO - SP ====================
export const LOCAIS_SAO_PAULO_SP: Omit<LocalVotacao, 'id'>[] = [
  {
    nome: 'Escola Estadual Caetano de Campos',
    tipo: 'Escola Estadual',
    bairro: 'Consolação',
    zona: '001',
    secoes: ['0001', '0002', '0003', '0004', '0005', '0006'],
    endereco: 'Rua da Consolação, 1012 - Consolação',
    capacidadeAprox: 3400,
    municipio: 'São Paulo',
    uf: 'SP'
  },
  {
    nome: 'Colégio Dante Alighieri',
    tipo: 'Colégio Particular',
    bairro: 'Cerqueira César',
    zona: '001',
    secoes: ['0010', '0011', '0012', '0013', '0014'],
    endereco: 'Alameda Jaú, 1061 - Cerqueira César',
    capacidadeAprox: 2800,
    municipio: 'São Paulo',
    uf: 'SP'
  },
  {
    nome: 'Universidade Presbiteriana Mackenzie',
    tipo: 'Faculdade / Universidade',
    bairro: 'Higienópolis',
    zona: '002',
    secoes: ['0020', '0021', '0022', '0023', '0024', '0025'],
    endereco: 'Rua da Consolação, 930 - Higienópolis',
    capacidadeAprox: 4200,
    municipio: 'São Paulo',
    uf: 'SP'
  }
];

// ==================== CATÁLOGO OFICIAL: BRASÍLIA - DF ====================
export const LOCAIS_BRASILIA_DF: Omit<LocalVotacao, 'id'>[] = [
  {
    nome: 'Centro de Ensino Médio Setor Leste (CEMSL)',
    tipo: 'Escola Estadual',
    bairro: 'Asa Sul',
    zona: '001',
    secoes: ['0001', '0002', '0003', '0004', '0005'],
    endereco: 'SGAS 611/612 Conjunto E - Asa Sul',
    capacidadeAprox: 2800,
    municipio: 'Brasília',
    uf: 'DF'
  },
  {
    nome: 'Universidade de Brasília (UnB - Darcy Ribeiro)',
    tipo: 'Faculdade / Universidade',
    bairro: 'Asa Norte',
    zona: '002',
    secoes: ['0015', '0016', '0017', '0018', '0019', '0020'],
    endereco: 'Campus Universitário Darcy Ribeiro - Asa Norte',
    capacidadeAprox: 4500,
    municipio: 'Brasília',
    uf: 'DF'
  }
];

export const ESTADOS_BRASIL = [
  { uf: 'AC', nome: 'Acre' },
  { uf: 'AL', nome: 'Alagoas' },
  { uf: 'AP', nome: 'Amapá' },
  { uf: 'AM', nome: 'Amazonas' },
  { uf: 'BA', nome: 'Bahia' },
  { uf: 'CE', nome: 'Ceará' },
  { uf: 'DF', nome: 'Distrito Federal' },
  { uf: 'ES', nome: 'Espírito Santo' },
  { uf: 'GO', nome: 'Goiás' },
  { uf: 'MA', nome: 'Maranhão' },
  { uf: 'MT', nome: 'Mato Grosso' },
  { uf: 'MS', nome: 'Mato Grosso do Sul' },
  { uf: 'MG', nome: 'Minas Gerais' },
  { uf: 'PA', nome: 'Pará' },
  { uf: 'PB', nome: 'Paraíba' },
  { uf: 'PR', nome: 'Paraná' },
  { uf: 'PE', nome: 'Pernambuco' },
  { uf: 'PI', nome: 'Piauí' },
  { uf: 'RJ', nome: 'Rio de Janeiro' },
  { uf: 'RN', nome: 'Rio Grande do Norte' },
  { uf: 'RS', nome: 'Rio Grande do Sul' },
  { uf: 'RO', nome: 'Rondônia' },
  { uf: 'RR', nome: 'Roraima' },
  { uf: 'SC', nome: 'Santa Catarina' },
  { uf: 'SP', nome: 'São Paulo' },
  { uf: 'SE', nome: 'Sergipe' },
  { uf: 'TO', nome: 'Tocantins' }
];

// Available pre-configured regions
export const CIDADES_DISPONIVEIS = [
  {
    cidade: 'Teresina',
    uf: 'PI',
    nomeCompleto: 'Teresina - PI (TRE-PI)',
    zonas: ['001', '002', '063', '097', '098'],
    totalLocais: LOCAIS_TERESINA_PI.length,
    itens: LOCAIS_TERESINA_PI
  },
  {
    cidade: 'Parnaíba',
    uf: 'PI',
    nomeCompleto: 'Parnaíba - PI (TRE-PI)',
    zonas: ['003', '004'],
    totalLocais: LOCAIS_PARNAIBA_PI.length,
    itens: LOCAIS_PARNAIBA_PI
  },
  {
    cidade: 'Fortaleza',
    uf: 'CE',
    nomeCompleto: 'Fortaleza - CE (TRE-CE)',
    zonas: ['001', '002', '003'],
    totalLocais: LOCAIS_FORTALEZA_CE.length,
    itens: LOCAIS_FORTALEZA_CE
  },
  {
    cidade: 'São Luís',
    uf: 'MA',
    nomeCompleto: 'São Luís - MA (TRE-MA)',
    zonas: ['001', '002'],
    totalLocais: LOCAIS_SAO_LUIS_MA.length,
    itens: LOCAIS_SAO_LUIS_MA
  },
  {
    cidade: 'São Paulo',
    uf: 'SP',
    nomeCompleto: 'São Paulo - SP (TRE-SP)',
    zonas: ['001', '002'],
    totalLocais: LOCAIS_SAO_PAULO_SP.length,
    itens: LOCAIS_SAO_PAULO_SP
  },
  {
    cidade: 'Brasília',
    uf: 'DF',
    nomeCompleto: 'Brasília - DF (TRE-DF)',
    zonas: ['001', '002'],
    totalLocais: LOCAIS_BRASILIA_DF.length,
    itens: LOCAIS_BRASILIA_DF
  }
];

// Helper to normalize strings for comparisons
function normalize(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * MOTOR DE CRUZAMENTO E RESOLUÇÃO DE CONFLITOS DE LOCAIS E SEÇÕES
 *
 * Analisa cada item da nova importação contra os registros existentes no banco de dados.
 * 1. Identifica conflitos graves de seção (quando a mesma seção pertence a escolas diferentes na mesma zona)
 * 2. Identifica divergências cadastrais (mesma escola mas bairro/endereço conflitante)
 * 3. Desconsidera registros conflitantes da importação direta e encaminha para a fila de conciliação
 * 4. Mescla automaticamente novas seções em escolas existentes sem conflito
 */
const toSecArray = (secoes?: string | string[]): string[] => {
  if (!secoes) return [];
  if (Array.isArray(secoes)) return secoes;
  return String(secoes).split(',').map((s) => s.trim()).filter(Boolean);
};

export function processLocaisCrossMatch(
  locaisAtuais: LocalVotacao[],
  locaisImportados: Omit<LocalVotacao, 'id'>[]
): CrossMatchResult {
  // 1. Build an index of existing sections: Map<"zona-secao", LocalVotacao>
  const secaoIndex = new Map<string, LocalVotacao>();
  locaisAtuais.forEach((loc) => {
    const z = (loc.zona || '001').trim();
    toSecArray(loc.secoes).forEach((sec) => {
      const cleanSec = sec.trim().padStart(4, '0');
      secaoIndex.set(`${z}-${cleanSec}`, loc);
    });
  });

  // 2. Build an index of existing schools: Map<"zona-normalizedName", LocalVotacao>
  const escolaIndex = new Map<string, LocalVotacao>();
  locaisAtuais.forEach((loc) => {
    const z = (loc.zona || '001').trim();
    const key = `${z}-${normalize(loc.nome)}`;
    escolaIndex.set(key, loc);
  });

  const criados: Omit<LocalVotacao, 'id'>[] = [];
  const atualizados: { id: string; dados: Partial<LocalVotacao> }[] = [];
  const conflitos: LocalConflictItem[] = [];
  let identicos = 0;

  for (const imp of locaisImportados) {
    const z = (imp.zona || '001').trim();
    const normName = normalize(imp.nome);
    const existingSchool = escolaIndex.get(`${z}-${normName}`);

    // Check for section collision: Does any section from imp already belong to a DIFFERENT school in the same zone?
    let secaoConflitoEncontrada: { secao: string; donoAtual: LocalVotacao } | null = null;

    for (const sec of toSecArray(imp.secoes)) {
      const cleanSec = sec.trim().padStart(4, '0');
      const dono = secaoIndex.get(`${z}-${cleanSec}`);
      if (dono) {
        // If owner is a DIFFERENT school
        if (!existingSchool || dono.id !== existingSchool.id) {
          secaoConflitoEncontrada = { secao: cleanSec, donoAtual: dono };
          break;
        }
      }
    }

    // SCENARIO 1: CRITICAL SECTION CONFLICT
    if (secaoConflitoEncontrada) {
      conflitos.push({
        id: `conf-sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'secao_duplicada',
        titulo: `Conflito de Seção Eleitoral (${secaoConflitoEncontrada.secao})`,
        descricao: `A Seção ${secaoConflitoEncontrada.secao} (Zona ${z}) já está alocada em "${secaoConflitoEncontrada.donoAtual.nome}", mas a nova importação tenta atribuí-la a "${imp.nome}".`,
        zona: z,
        secaoConflitante: secaoConflitoEncontrada.secao,
        localExistente: secaoConflitoEncontrada.donoAtual,
        localImportado: imp
      });
      // Skip automatic write - protected against corruption!
      continue;
    }

    // SCENARIO 2: EXISTING SCHOOL DETECTED
    if (existingSchool) {
      const existingSecoes = new Set(toSecArray(existingSchool.secoes).map((s) => s.padStart(4, '0')));
      const newSecoesToAdd = toSecArray(imp.secoes)
        .map((s) => s.padStart(4, '0'))
        .filter((s) => !existingSecoes.has(s));

      const divergencias: { campo: string; valorAtual: string; valorNovo: string }[] = [];

      if (
        imp.bairro &&
        existingSchool.bairro &&
        normalize(imp.bairro) !== normalize(existingSchool.bairro)
      ) {
        divergencias.push({
          campo: 'Bairro',
          valorAtual: existingSchool.bairro,
          valorNovo: imp.bairro
        });
      }

      if (
        imp.endereco &&
        existingSchool.endereco &&
        normalize(imp.endereco) !== normalize(existingSchool.endereco)
      ) {
        divergencias.push({
          campo: 'Endereço',
          valorAtual: existingSchool.endereco,
          valorNovo: imp.endereco
        });
      }

      // If divergence in address or neighborhood exists, flag it for operator inspection
      if (divergencias.length > 0) {
        conflitos.push({
          id: `conf-div-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'divergencia_dados',
          titulo: `Divergência Cadastral em "${existingSchool.nome}"`,
          descricao: `Existem dados divergentes de endereço/bairro entre o cadastro atual e a nova importação.`,
          zona: z,
          localExistente: existingSchool,
          localImportado: imp,
          divergencias
        });
        continue;
      }

      // If new sections exist and no divergence, merge new sections smoothly!
      if (newSecoesToAdd.length > 0) {
        const mergedSecoes = Array.from(new Set([...toSecArray(existingSchool.secoes), ...newSecoesToAdd]));
        atualizados.push({
          id: existingSchool.id,
          dados: {
            secoes: mergedSecoes,
            capacidadeAprox: Math.max(existingSchool.capacidadeAprox || 0, imp.capacidadeAprox || 0)
          }
        });
      } else {
        identicos++;
      }
      continue;
    }

    // SCENARIO 3: BRAND NEW VOTING LOCATION (NO CONFLICTS)
    criados.push(imp);
  }

  return { criados, atualizados, identicos, conflitos };
}

/**
 * CSV PARSER PARA LOCAIS E SEÇÕES DE VOTAÇÃO DO TSE / TRE
 * Suporta tanto o formato oficial completo do TSE (NM_LOCAL_VOTACAO, NR_ZONA, NR_SECAO...)
 * quanto planilhas amigáveis customizadas (nome, zona, secoes, bairro, endereco...).
 */
export function parseLocaisCSV(csvText: string, defaultUf = 'PI', defaultMunicipio = 'Teresina'): Omit<LocalVotacao, 'id'>[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Detect delimiter (; or , or \t)
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : headerLine.includes('\t') ? '\t' : ',';

  // Normalize header columns
  const rawHeaders = headerLine.split(delimiter).map((h) => h.replace(/^["']|["']$/g, '').trim().toUpperCase());

  // Detect column indexes
  const idxNome = rawHeaders.findIndex((h) => h.includes('NOME') || h.includes('LOCAL') || h.includes('ESTABELECIMENTO'));
  const idxZona = rawHeaders.findIndex((h) => h.includes('ZONA') || h === 'NR_ZONA');
  const idxAgregadas = rawHeaders.findIndex((h) => h.includes('AGREGAD'));
  const idxSecao = rawHeaders.findIndex((h, idx) => idx !== idxAgregadas && (h.includes('SECAO') || h.includes('SEC') || h === 'NR_SECAO'));
  const idxBairro = rawHeaders.findIndex((h) => h.includes('BAIRRO') || h === 'NM_BAIRRO');
  const idxEndereco = rawHeaders.findIndex((h) => h.includes('ENDERECO') || h.includes('LOGRADOURO') || h === 'DS_ENDERECO');
  const idxTipo = rawHeaders.findIndex((h) => h.includes('TIPO') || h === 'DS_TIPO_LOCAL');
  const idxCapacidade = rawHeaders.findIndex((h) => h.includes('CAPACIDADE') || h.includes('ELEITORES') || h.includes('QT_APTOS'));
  const idxMunicipio = rawHeaders.findIndex((h) => h.includes('MUNICIPIO') || h.includes('CIDADE') || h === 'NM_MUNICIPIO');
  const idxUf = rawHeaders.findIndex((h) => h === 'UF' || h === 'SG_UF');

  if (idxNome === -1) {
    throw new Error('A planilha precisa conter ao menos uma coluna com o nome do local ou escola (ex: "nome", "NM_LOCAL_VOTACAO").');
  }

  // Map to group multiple lines belonging to the same school into a single aggregated LocalVotacao record
  const aggregatedMap = new Map<string, Omit<LocalVotacao, 'id'>>();

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Split taking care of quoted CSV values
    const parts = rawLine.split(delimiter).map((p) => p.replace(/^["']|["']$/g, '').trim());

    const nome = parts[idxNome] || '';
    if (!nome) continue;

    const zonaRaw = idxZona !== -1 && parts[idxZona] ? parts[idxZona] : '001';
    const zona = zonaRaw.replace(/\D/g, '').padStart(3, '0') || '001';
    const bairro = idxBairro !== -1 && parts[idxBairro] ? parts[idxBairro].trim() : 'Centro';
    const endereco = idxEndereco !== -1 && parts[idxEndereco] ? parts[idxEndereco].trim() : '';
    const tipo = idxTipo !== -1 && parts[idxTipo] ? parts[idxTipo].trim() : 'Escola Estadual';
    const municipio = idxMunicipio !== -1 && parts[idxMunicipio] ? parts[idxMunicipio].trim() : defaultMunicipio;
    const uf = idxUf !== -1 && parts[idxUf] ? parts[idxUf].trim().toUpperCase() : defaultUf;
    const capacidadeAprox = idxCapacidade !== -1 && parts[idxCapacidade] ? Number(parts[idxCapacidade].replace(/\D/g, '')) || 1200 : 1500;

    // Parse section(s)
    let secoesList: string[] = [];
    if (idxSecao !== -1 && parts[idxSecao]) {
      const parsedSec = parseSecoesAgregadas(parts[idxSecao]);
      secoesList = parsedSec.secoes;
    }

    const agregadas = idxAgregadas !== -1 && parts[idxAgregadas] ? parts[idxAgregadas].trim() : '';
    const agregadasParsed = parseSecoesAgregadas(agregadas);
    // Inclui apenas as seções agregadas reais (ex: 509) e NUNCA o número de eleitores aptos (ex: 121)
    agregadasParsed.secoes.forEach((s) => {
      if (!secoesList.includes(s)) secoesList.push(s);
    });

    const capacidadeComAptos = capacidadeAprox + (agregadasParsed.aptosTotal || 0);

    const key = `${zona}-${normalize(nome)}`;
    if (aggregatedMap.has(key)) {
      const existing = aggregatedMap.get(key)!;
      const combinedSecoes = Array.from(new Set([...toSecArray(existing.secoes), ...secoesList]));
      aggregatedMap.set(key, {
        ...existing,
        secoes: combinedSecoes,
        secoesAgregadas: existing.secoesAgregadas || agregadas || undefined,
        capacidadeAprox: Math.max(existing.capacidadeAprox || 0, capacidadeComAptos || 0)
      });
    } else {
      aggregatedMap.set(key, {
        nome,
        tipo,
        zona,
        bairro,
        endereco,
        capacidadeAprox: capacidadeComAptos,
        secoes: secoesList,
        secoesAgregadas: agregadas || undefined,
        municipio,
        uf
      });
    }
  }

  return Array.from(aggregatedMap.values());
}
