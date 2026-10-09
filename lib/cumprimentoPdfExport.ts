import { getPDFModules } from './importExportUtils';
import { SecaoAgrupada, LiderancaDesempenho } from '@/app/cumprimento-votos/page';

export interface CumprimentoPdfExportOptions {
  campaignDisplayName: string;
  reportType: 'secoes' | 'liderancas' | 'lideranca_individual';
  printScope: string;
  filtersText: string;
  userName: string;
  stats: {
    totalEleitoresCadastrados: number;
    totalVotosImportados: number;
    taxaCumprimentoReal: number;
    taxaCoberturaBase: number;
    secoesCadastradasCumpridasCount: number;
    secoesCadastradasQuebradasCount: number;
    votosCumpridosBase: number;
    votosQuebradosBase: number;
    secoesComEleitoresCount: number;
    totalSecoesImportadas: number;
  };
  secoesList: SecaoAgrupada[];
  liderancasList: LiderancaDesempenho[];
  selectedLideranca: LiderancaDesempenho | null;
}

export async function exportCumprimentoPDF(options: CumprimentoPdfExportOptions) {
  const {
    campaignDisplayName,
    reportType,
    printScope,
    filtersText,
    userName,
    stats,
    secoesList,
    liderancasList,
    selectedLideranca
  } = options;

  const { jsPDF, autoTable } = await getPDFModules();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const timestamp = new Date().toLocaleString('pt-BR');

  // Cabeçalho Principal
  doc.setFillColor(0, 20, 40); // #001428
  doc.rect(0, 0, pageWidth, 54, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);

  let title = 'RELATÓRIO DE CUMPRIMENTO DE VOTOS POR SEÇÃO ELEITORAL';
  if (reportType === 'liderancas') {
    title = 'RELATÓRIO DE AUDITORIA DE CUMPRIMENTO POR LIDERANÇA';
  } else if (reportType === 'lideranca_individual' && selectedLideranca) {
    title = `AUDITORIA DE EFICÁCIA: ${selectedLideranca.nome.toUpperCase()}`;
  }

  doc.text(title, 32, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(176, 201, 232);
  doc.text(
    `${campaignDisplayName}  |  Gerado em: ${timestamp}  |  Operador: ${userName || 'Coordenação'}`,
    32,
    42
  );

  // Faixa de Filtros
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('Filtros Aplicados:', 32, 68);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const scopeLabel =
    printScope === 'com_votos'
      ? 'Apenas Seções com Votos'
      : printScope === 'sem_votos'
      ? 'Apenas Seções sem Votos'
      : printScope === 'apenas_apuradas'
      ? 'Apenas Apuradas'
      : printScope === 'apenas_quebras'
      ? 'Apenas com Quebra'
      : 'Todos os registros filtrados';
  doc.text(`${filtersText || 'Geral'}  [Escopo: ${scopeLabel}]`, 110, 68);

  // Linha separadora
  doc.setDrawColor(226, 232, 240);
  doc.line(32, 76, pageWidth - 32, 76);

  // Bloco de Resumo Estatístico em 4 colunas
  const boxY = 84;
  const boxWidth = (pageWidth - 64 - 24) / 4;
  const boxHeight = 38;

  const boxes = [
    {
      label: 'CADASTRADOS',
      val: String(stats.totalEleitoresCadastrados),
      sub: `${stats.secoesComEleitoresCount} seções base`
    },
    {
      label: 'VOTOS URNA',
      val: String(stats.totalVotosImportados),
      sub: `${stats.totalSecoesImportadas} seções importadas`
    },
    {
      label: 'CUMPRIMENTO REAL',
      val: `${stats.taxaCumprimentoReal}%`,
      sub: `${stats.votosCumpridosBase}/${stats.totalEleitoresCadastrados} cumpridos`
    },
    {
      label: 'BALANÇO SEÇÕES',
      val: `${stats.secoesCadastradasCumpridasCount} ✓ / ${stats.secoesCadastradasQuebradasCount} ✗`,
      sub: `${stats.taxaCoberturaBase}% cobertura`
    }
  ];

  boxes.forEach((b, idx) => {
    const x = 32 + idx * (boxWidth + 8);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, boxY, boxWidth, boxHeight, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(b.label, x + 6, boxY + 11);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(b.val, x + 6, boxY + 23);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(b.sub, x + 6, boxY + 33);
  });

  const tableStartY = boxY + boxHeight + 14;

  if (reportType === 'secoes') {
    const headers = [
      '#',
      'Zona/Seção',
      'Local de Votação',
      'Bairro',
      'Cadastr.',
      'Votos Urna',
      'Cumpr.',
      'Saldo',
      'Situação'
    ];

    const body = secoesList.map((item, idx) => {
      let situacao = 'Aguardando Apuração';
      if (item.isApurada) {
        if (item.teveVotosSuficientes === true) {
          situacao = item.superouMeta ? 'Superou Meta' : 'Cumprida';
        } else if (item.teveVotosSuficientes === false) {
          situacao = 'Quebra de Votos';
        } else {
          situacao = 'Votos Recebidos';
        }
      }

      return [
        String(idx + 1),
        `Z${item.zona} / S${item.secao}`,
        item.localNome || 'Não Mapeado',
        item.bairro || '-',
        String(item.totalCadastrados),
        item.isApurada ? String(item.votosApurados) : '-',
        item.percentualCumprimento !== null ? `${item.percentualCumprimento}%` : '-',
        item.saldoVotos !== null ? (item.saldoVotos > 0 ? `+${item.saldoVotos}` : String(item.saldoVotos)) : '-',
        situacao
      ];
    });

    autoTable(doc, {
      startY: tableStartY,
      head: [headers],
      body,
      margin: { left: 32, right: 32 },
      styles: {
        fontSize: 7,
        cellPadding: 3,
        overflow: 'linebreak',
        textColor: [15, 23, 42]
      },
      headStyles: {
        fillColor: [0, 20, 40],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 60, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 70 },
        4: { cellWidth: 38, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 42, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 40, halign: 'center' },
        7: { cellWidth: 32, halign: 'center' },
        8: { cellWidth: 75, halign: 'center', fontStyle: 'bold' }
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });
  } else if (reportType === 'liderancas') {
    const headers = [
      '#',
      'Liderança',
      'Tipo / Articulador',
      'Região / Bairro',
      'Meta',
      'Cadastr.',
      'Votos Estim.',
      'Apuradas',
      'Classificação'
    ];

    const body = liderancasList.map((l, idx) => [
      String(idx + 1),
      l.nome,
      l.tipo === 'Sub-liderança' ? `Sub (${l.liderancaPaiNome || '-'})` : 'Líder Direto',
      `${l.bairro || '-'}${l.regiao ? ` (${l.regiao})` : ''}`,
      String(l.metaVotos),
      String(l.totalEleitores),
      String(l.votosApuradosEstimados),
      `${l.secoesApuradas}/${l.totalSecoes}`,
      l.classificacao
    ]);

    autoTable(doc, {
      startY: tableStartY,
      head: [headers],
      body,
      margin: { left: 32, right: 32 },
      styles: {
        fontSize: 7,
        cellPadding: 3,
        textColor: [15, 23, 42]
      },
      headStyles: {
        fillColor: [0, 20, 40],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 100, fontStyle: 'bold' },
        2: { cellWidth: 80 },
        3: { cellWidth: 70 },
        4: { cellWidth: 35, halign: 'center' },
        5: { cellWidth: 38, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 45, halign: 'center', fontStyle: 'bold' },
        7: { cellWidth: 45, halign: 'center' },
        8: { cellWidth: 75, halign: 'center', fontStyle: 'bold' }
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });
  } else if (reportType === 'lideranca_individual' && selectedLideranca) {
    const headers = [
      '#',
      'Zona / Seção',
      'Local de Votação',
      'Bairro',
      'Eleitores Liderança',
      'Votos Urna Total',
      'Status Seção'
    ];

    const body = selectedLideranca.detalhesSecoes.map((item, idx) => [
      String(idx + 1),
      `Z${item.zona} / S${item.secao}`,
      item.localNome || 'Não Mapeado',
      item.bairro || '-',
      String(item.eleitores.length),
      item.isApurada ? String(item.votosUrnaTotal) : 'Pendente',
      item.isApurada ? (item.cumpriuIntegralmente ? 'Cumprida ✓' : 'Quebra ✗') : 'Aguardando'
    ]);

    autoTable(doc, {
      startY: tableStartY,
      head: [headers],
      body,
      margin: { left: 32, right: 32 },
      styles: {
        fontSize: 7,
        cellPadding: 3,
        textColor: [15, 23, 42]
      },
      headStyles: {
        fillColor: [0, 20, 40],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5
      },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 65, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 80 },
        4: { cellWidth: 60, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 55, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 75, halign: 'center', fontStyle: 'bold' }
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });
  }

  // Rodapé Oficial em todas as páginas
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'SEATI Eleitoral • Sistema de Auditoria e Gestão Estratégica  |  Uso Interno e Confidencial',
      32,
      pageH - 18
    );
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 70, pageH - 18);
  }

  const fileName = `relatorio_cumprimento_votos_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
