import { Eleitor, Lideranca, LocalVotacao } from '@/context/CampaignContext';
import { getPDFModules, getXLSX, formatCpf } from './importExportUtils';

export type ReportMode = 'nominal' | 'zona_secao' | 'lider_sublider' | 'folha_fiscal';

export interface ReportExportOptions {
  title: string;
  subtitle?: string;
  activeFiltersText: string;
  campaignName: string;
  reportMode: ReportMode;
  voters: Eleitor[];
  liderancas: Lideranca[];
  locais: LocalVotacao[];
  conflictingIds: Set<string>;
  conflictingCpfIds?: Set<string>;
  conflictingTituloIds?: Set<string>;
}

// Helper to safely extract sections array from string | string[]
function toSecArray(secoes?: string | string[]): string[] {
  if (!secoes) return [];
  if (Array.isArray(secoes)) return secoes.map((s) => String(s).trim()).filter(Boolean);
  return String(secoes)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Helper to trigger file download
function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * GERAÇÃO DE PDF PERSONALIZADO PARA A CENTRAL DE RELATÓRIOS
 */
export async function generateReportPDF(options: ReportExportOptions) {
  const {
    title,
    activeFiltersText,
    campaignName,
    reportMode,
    voters,
    liderancas,
    locais,
    conflictingIds
  } = options;

  const { jsPDF, autoTable } = await getPDFModules();
  const isLandscape = reportMode !== 'folha_fiscal';
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const timestamp = new Date().toLocaleString('pt-BR');

  // Cabeçalho Oficial
  doc.setFillColor(0, 20, 40); // #001428 (Primary Color)
  doc.rect(0, 0, pageWidth, 55, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), 36, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(176, 201, 232); // #b0c9e8
  doc.text(`${campaignName}  |  Gerado em: ${timestamp}  |  Total: ${voters.length} eleitor(es)`, 36, 42);

  // Faixa descritiva de filtros aplicados
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('Filtros aplicados:', 36, 70);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(activeFiltersText || 'Todos os registros (sem filtros)', 110, 70);

  // Linha separadora
  doc.setDrawColor(226, 232, 240);
  doc.line(36, 78, pageWidth - 36, 78);

  // Mapeamento de Lideranças para resolução rápida de Líder vs Sub-líder
  const leaderMap = new Map<string, Lideranca>();
  liderancas.forEach((l) => {
    leaderMap.set(l.id, l);
    if (l.nome) leaderMap.set(l.nome.trim().toLowerCase(), l);
  });

  // Mapeamento de locais por Zona e Seção
  const localMap = new Map<string, string>();
  locais.forEach((loc) => {
    const zonaNorm = (loc.zona || '').padStart(3, '0');
    toSecArray(loc.secoes).forEach((sec) => {
      const secNorm = String(sec).padStart(4, '0');
      localMap.set(`${zonaNorm}-${secNorm}`, `${loc.nome} (${loc.bairro || ''})`);
    });
  });

  if (reportMode === 'folha_fiscal') {
    // 1. Caderno de Votação / Lista de Urna para Fiscais de Campo (Dia D)
    const tableRows = voters.map((v, i) => {
      const liderObj = v.liderancaId ? leaderMap.get(v.liderancaId) : leaderMap.get((v.lideranca || '').trim().toLowerCase());
      const leaderDisplay = liderObj
        ? `${liderObj.nome}${liderObj.tipo === 'Sub-liderança' ? ' (Sub)' : ''}`
        : v.lideranca || '-';

      return [
        String(i + 1),
        v.nome || '',
        v.tituloEleitor || '-',
        v.zona ? `Z: ${v.zona} / S: ${v.secao}` : '-',
        v.bairro || '-',
        v.telefone || '-',
        leaderDisplay,
        '[   ] Votou'
      ];
    });

    autoTable(doc, {
      startY: 85,
      head: [
        ['#', 'Nome do Eleitor', 'Título Eleitoral', 'Zona / Seção', 'Bairro', 'Telefone', 'Liderança', 'Check Fiscal']
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
        fillColor: [0, 20, 40],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 140 },
        2: { cellWidth: 75 },
        3: { cellWidth: 65, halign: 'center' },
        4: { cellWidth: 65 },
        5: { cellWidth: 65 },
        6: { cellWidth: 75 },
        7: { cellWidth: 55, halign: 'center', fontStyle: 'bold' }
      },
      didDrawPage: (data) => {
        const str = `Página ${data.pageNumber} de ${doc.getNumberOfPages()}  •  Caderno de Fiscais Eleitorais`;
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(str, pageWidth - 36 - doc.getTextWidth(str), pageHeight - 20);
        doc.text(campaignName, 36, pageHeight - 20);
      },
      margin: { left: 36, right: 36, top: 85, bottom: 35 }
    });

  } else if (reportMode === 'zona_secao') {
    // 2. Relatório Agrupado por Zona & Seção Eleitoral
    const tableRows = voters.map((v, i) => {
      const zonaNorm = (v.zona || '').padStart(3, '0');
      const secNorm = (v.secao || '').padStart(4, '0');
      const localStr = localMap.get(`${zonaNorm}-${secNorm}`) || 'Local não cadastrado';

      const liderObj = v.liderancaId ? leaderMap.get(v.liderancaId) : leaderMap.get((v.lideranca || '').trim().toLowerCase());
      const leaderDisplay = liderObj
        ? `${liderObj.nome}${liderObj.liderancaPaiNome ? ` (Sub de ${liderObj.liderancaPaiNome})` : ''}`
        : v.lideranca || '-';

      return [
        String(i + 1),
        v.zona || '-',
        v.secao || '-',
        localStr,
        v.nome || '',
        formatCpf(v.cpf),
        v.tituloEleitor || '-',
        v.telefone || '-',
        v.bairro || '-',
        leaderDisplay,
        v.status || 'Validado'
      ];
    });

    autoTable(doc, {
      startY: 85,
      head: [
        ['#', 'Zona', 'Seção', 'Local de Votação (Colégio)', 'Nome do Eleitor', 'CPF', 'Título', 'Telefone', 'Bairro', 'Liderança Responsável', 'Status']
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
        fillColor: [0, 20, 40],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 35, halign: 'center' },
        3: { cellWidth: 125 },
        4: { cellWidth: 130 },
        5: { cellWidth: 70 },
        6: { cellWidth: 65 },
        7: { cellWidth: 65 },
        8: { cellWidth: 75 },
        9: { cellWidth: 105 },
        10: { cellWidth: 55, halign: 'center' }
      },
      didDrawPage: (data) => {
        const str = `Página ${data.pageNumber} de ${doc.getNumberOfPages()}  •  Mapeamento Territorial por Zona e Seção`;
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(str, pageWidth - 36 - doc.getTextWidth(str), pageHeight - 20);
        doc.text(campaignName, 36, pageHeight - 20);
      },
      margin: { left: 36, right: 36, top: 85, bottom: 35 }
    });

  } else if (reportMode === 'lider_sublider') {
    // 3. Relatório Hierárquico por Líder e Sub-líder
    const tableRows = voters.map((v, i) => {
      const liderObj = v.liderancaId ? leaderMap.get(v.liderancaId) : leaderMap.get((v.lideranca || '').trim().toLowerCase());
      const isSub = liderObj?.tipo === 'Sub-liderança';
      const principalLeader = isSub ? liderObj.liderancaPaiNome || '-' : liderObj?.nome || v.lideranca || 'Sem Liderança';
      const subLeader = isSub ? liderObj.nome : '-';

      return [
        String(i + 1),
        principalLeader,
        subLeader,
        v.nome || '',
        formatCpf(v.cpf),
        v.telefone || '-',
        v.bairro || '-',
        v.zona ? `${v.zona} / ${v.secao}` : '-',
        v.status || 'Validado',
        conflictingIds.has(v.id) ? 'DUPLICADO' : 'OK'
      ];
    });

    autoTable(doc, {
      startY: 85,
      head: [
        ['#', 'Liderança Principal', 'Sub-liderança', 'Nome do Eleitor', 'CPF', 'Telefone', 'Bairro', 'Zona/Seção', 'Status', 'Auditoria']
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
        fillColor: [0, 20, 40],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 110 },
        2: { cellWidth: 95 },
        3: { cellWidth: 140 },
        4: { cellWidth: 70 },
        5: { cellWidth: 65 },
        6: { cellWidth: 75 },
        7: { cellWidth: 60, halign: 'center' },
        8: { cellWidth: 60, halign: 'center' },
        9: { cellWidth: 55, halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 9) {
          if (data.cell.raw === 'DUPLICADO') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [16, 185, 129];
          }
        }
      },
      didDrawPage: (data) => {
        const str = `Página ${data.pageNumber} de ${doc.getNumberOfPages()}  •  Articulação Política: Líderes e Sub-líderes`;
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(str, pageWidth - 36 - doc.getTextWidth(str), pageHeight - 20);
        doc.text(campaignName, 36, pageHeight - 20);
      },
      margin: { left: 36, right: 36, top: 85, bottom: 35 }
    });

  } else {
    // 4. Relatório Geral Nominal Padrão
    const tableRows = voters.map((v, i) => {
      const isCpfConflict = options.conflictingCpfIds ? options.conflictingCpfIds.has(v.id) : conflictingIds.has(v.id);
      const isTituloConflict = options.conflictingTituloIds ? options.conflictingTituloIds.has(v.id) : false;
      const hasNoDoc = !v.cpf && !v.tituloEleitor;

      const auditStatus = isCpfConflict && isTituloConflict
        ? 'DUPLO CONFLITO'
        : isCpfConflict
        ? 'CPF DUPLICADO'
        : isTituloConflict
        ? 'TÍTULO DUPLICADO'
        : hasNoDoc
        ? 'SEM DOC'
        : 'Íntegro';

      const liderObj = v.liderancaId ? leaderMap.get(v.liderancaId) : leaderMap.get((v.lideranca || '').trim().toLowerCase());
      const leaderDisplay = liderObj
        ? `${liderObj.nome}${liderObj.tipo === 'Sub-liderança' ? ' (Sub)' : ''}`
        : v.lideranca || 'Sem Liderança';

      return [
        String(i + 1),
        v.nome || '',
        formatCpf(v.cpf),
        v.tituloEleitor || '-',
        v.telefone || '-',
        v.zona ? `${v.zona} / ${v.secao}` : '-',
        v.bairro || '-',
        leaderDisplay,
        v.status || 'Validado',
        auditStatus
      ];
    });

    autoTable(doc, {
      startY: 85,
      head: [
        ['#', 'Nome do Eleitor', 'CPF', 'Título', 'Telefone', 'Zona / Seção', 'Bairro', 'Liderança', 'Status', 'Auditoria']
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
        fillColor: [0, 20, 40],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 140 },
        2: { cellWidth: 70 },
        3: { cellWidth: 65 },
        4: { cellWidth: 65 },
        5: { cellWidth: 60, halign: 'center' },
        6: { cellWidth: 75 },
        7: { cellWidth: 110 },
        8: { cellWidth: 65, halign: 'center' },
        9: { cellWidth: 55, halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 9) {
          if (data.cell.raw === 'CONFLITO') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [16, 185, 129];
          }
        }
      },
      didDrawPage: (data) => {
        const str = `Página ${data.pageNumber} de ${doc.getNumberOfPages()}  •  Base Geral de Eleitores`;
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(str, pageWidth - 36 - doc.getTextWidth(str), pageHeight - 20);
        doc.text(campaignName, 36, pageHeight - 20);
      },
      margin: { left: 36, right: 36, top: 85, bottom: 35 }
    });
  }

  const fileTimestamp = new Date().toISOString().slice(0, 10);
  const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
  doc.save(`${cleanTitle}_${fileTimestamp}.pdf`);
}

/**
 * GERAÇÃO DE EXCEL (.XLSX) COM ABAS E FORMATAÇÃO RICA
 */
export async function generateReportExcel(options: ReportExportOptions) {
  const { title, voters, liderancas, locais, conflictingIds } = options;
  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();

  const leaderMap = new Map<string, Lideranca>();
  liderancas.forEach((l) => {
    leaderMap.set(l.id, l);
    if (l.nome) leaderMap.set(l.nome.trim().toLowerCase(), l);
  });

  const localMap = new Map<string, string>();
  locais.forEach((loc) => {
    const zonaNorm = (loc.zona || '').padStart(3, '0');
    toSecArray(loc.secoes).forEach((sec) => {
      const secNorm = String(sec).padStart(4, '0');
      localMap.set(`${zonaNorm}-${secNorm}`, loc.nome);
    });
  });

  // Aba Principal: Dados Filtrados dos Eleitores
  const voterRows = voters.map((v) => {
    const isConflict = conflictingIds.has(v.id);
    const liderObj = v.liderancaId ? leaderMap.get(v.liderancaId) : leaderMap.get((v.lideranca || '').trim().toLowerCase());
    const isSub = liderObj?.tipo === 'Sub-liderança';
    const principalLeader = isSub ? liderObj.liderancaPaiNome || '-' : liderObj?.nome || v.lideranca || 'Sem Liderança';
    const subLeader = isSub ? liderObj.nome : '-';

    const zonaNorm = (v.zona || '').padStart(3, '0');
    const secNorm = (v.secao || '').padStart(4, '0');
    const colegio = localMap.get(`${zonaNorm}-${secNorm}`) || '';

    return {
      'Nome Completo': v.nome || '',
      'CPF': formatCpf(v.cpf),
      'Título de Eleitor': v.tituloEleitor || '',
      'Telefone / WhatsApp': v.telefone || '',
      'Zona Eleitoral': v.zona || '',
      'Seção Eleitoral': v.secao || '',
      'Colégio / Local de Votação': colegio,
      'Bairro': v.bairro || '',
      'Cidade': v.cidade || '',
      'UF': v.estado || '',
      'Liderança Principal': principalLeader,
      'Sub-liderança': subLeader,
      'Status de Validação': v.status || 'Validado',
      'Duplicidade Detectada': isConflict ? 'SIM' : 'NÃO',
      'Observações': v.observacoes || ''
    };
  });

  const wsVoters = XLSX.utils.json_to_sheet(voterRows);
  wsVoters['!cols'] = [
    { wch: 32 }, // Nome
    { wch: 18 }, // CPF
    { wch: 18 }, // Titulo
    { wch: 20 }, // Telefone
    { wch: 14 }, // Zona
    { wch: 14 }, // Secao
    { wch: 30 }, // Colegio
    { wch: 20 }, // Bairro
    { wch: 18 }, // Cidade
    { wch: 8 },  // UF
    { wch: 24 }, // Lider
    { wch: 24 }, // Sub
    { wch: 18 }, // Status
    { wch: 16 }, // Conflito
    { wch: 25 }  // Obs
  ];
  XLSX.utils.book_append_sheet(wb, wsVoters, 'Relatório de Eleitores');

  // Aba 2: Resumo Agrupado por Zona e Seção
  const sectionSummaryMap = new Map<string, { zona: string; secao: string; total: number; colégio: string }>();
  voters.forEach((v) => {
    const z = v.zona || 'N/I';
    const s = v.secao || 'N/I';
    const key = `${z}-${s}`;
    const col = localMap.get(`${z.padStart(3, '0')}-${s.padStart(4, '0')}`) || '-';
    if (!sectionSummaryMap.has(key)) {
      sectionSummaryMap.set(key, { zona: z, secao: s, total: 1, colégio: col });
    } else {
      sectionSummaryMap.get(key)!.total += 1;
    }
  });

  const sectionRows = Array.from(sectionSummaryMap.values()).map((item) => ({
    'Zona Eleitoral': item.zona,
    'Seção Eleitoral': item.secao,
    'Local de Votação': item.colégio,
    'Eleitores Mapeados': item.total
  }));

  const wsSections = XLSX.utils.json_to_sheet(sectionRows);
  wsSections['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 32 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSections, 'Resumo por Zona e Seção');

  // Aba 3: Resumo por Liderança
  const leaderSummaryMap = new Map<string, { lider: string; tipo: string; vinculadaA: string; total: number }>();
  voters.forEach((v) => {
    const liderObj = v.liderancaId ? leaderMap.get(v.liderancaId) : leaderMap.get((v.lideranca || '').trim().toLowerCase());
    const name = liderObj?.nome || v.lideranca || 'Sem Liderança';
    const tipo = liderObj?.tipo || 'Liderança';
    const vinculo = liderObj?.liderancaPaiNome || '-';

    if (!leaderSummaryMap.has(name)) {
      leaderSummaryMap.set(name, { lider: name, tipo, vinculadaA: vinculo, total: 1 });
    } else {
      leaderSummaryMap.get(name)!.total += 1;
    }
  });

  const leaderRows = Array.from(leaderSummaryMap.values()).map((item) => ({
    'Liderança': item.lider,
    'Tipo': item.tipo,
    'Vinculada a': item.vinculadaA,
    'Total de Eleitores Captados': item.total
  }));

  const wsLeaders = XLSX.utils.json_to_sheet(leaderRows);
  wsLeaders['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 25 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsLeaders, 'Resumo por Lideranças');

  const fileTimestamp = new Date().toISOString().slice(0, 10);
  const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  triggerDownload(blob, `${cleanTitle}_${fileTimestamp}.xlsx`);
}

/**
 * GERAÇÃO DE CSV COM UTF-8 BOM
 */
export async function generateReportCSV(options: ReportExportOptions) {
  const { title, voters, liderancas, conflictingIds } = options;
  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();

  const leaderMap = new Map<string, Lideranca>();
  liderancas.forEach((l) => {
    leaderMap.set(l.id, l);
    if (l.nome) leaderMap.set(l.nome.trim().toLowerCase(), l);
  });

  const voterRows = voters.map((v) => {
    const isConflict = conflictingIds.has(v.id);
    const liderObj = v.liderancaId ? leaderMap.get(v.liderancaId) : leaderMap.get((v.lideranca || '').trim().toLowerCase());
    const isSub = liderObj?.tipo === 'Sub-liderança';
    const principalLeader = isSub ? liderObj.liderancaPaiNome || '-' : liderObj?.nome || v.lideranca || 'Sem Liderança';
    const subLeader = isSub ? liderObj.nome : '-';

    return {
      'Nome': v.nome || '',
      'CPF': formatCpf(v.cpf),
      'Titulo': v.tituloEleitor || '',
      'Telefone': v.telefone || '',
      'Zona': v.zona || '',
      'Secao': v.secao || '',
      'Bairro': v.bairro || '',
      'Lideranca_Principal': principalLeader,
      'Sub_lideranca': subLeader,
      'Status': v.status || 'Validado',
      'Duplicidade': isConflict ? 'SIM' : 'NAO'
    };
  });

  const ws = XLSX.utils.json_to_sheet(voterRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  const csvData = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\uFEFF' + csvData], { type: 'text/csv;charset=utf-8;' });

  const fileTimestamp = new Date().toISOString().slice(0, 10);
  const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
  triggerDownload(blob, `${cleanTitle}_${fileTimestamp}.csv`);
}
