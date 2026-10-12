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
  printStats?: {
    card1Label: string;
    card1Val: string;
    card1Sub: string;
    card2Label: string;
    card2Val: string;
    card2Sub: string;
    card3Label: string;
    card3Val: string;
    card3Sub: string;
    card4Label: string;
    card4Val: string;
    card4Sub: string;
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
    printStats,
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

  // Cabeçalho Principal Timbrado
  doc.setFillColor(0, 20, 40); // #001428
  doc.rect(0, 0, pageWidth, 54, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);

  let title = 'RELATÓRIO DE CUMPRIMENTO DE VOTOS POR SEÇÃO ELEITORAL';
  if (reportType === 'liderancas') {
    title = 'RELATÓRIO DE AUDITORIA DE EFICÁCIA POR LIDERANÇA';
  } else if (reportType === 'lideranca_individual' && selectedLideranca) {
    title = `PRESTAÇÃO DE CONTAS DE VOTOS: ${selectedLideranca.nome.toUpperCase()}`;
  }

  doc.text(title, 32, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(176, 201, 232);
  doc.text(
    `${campaignDisplayName}  |  Gerado em: ${timestamp}  |  Operador: ${userName || 'Coordenação de Campanha'}`,
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
      ? 'Apenas com Quebra / Faltantes'
      : 'Todos os registros filtrados';
  doc.text(`${filtersText || 'Geral'}  [Escopo: ${scopeLabel}]`, 110, 68);

  // Linha separadora
  doc.setDrawColor(226, 232, 240);
  doc.line(32, 76, pageWidth - 32, 76);

  // Bloco de Resumo Estatístico em 4 colunas (Utiliza printStats dinâmico e contextual com os filtros)
  const boxY = 84;
  const boxWidth = (pageWidth - 64 - 24) / 4;
  const boxHeight = 38;

  const boxes = printStats ? [
    {
      label: printStats.card1Label.toUpperCase(),
      val: printStats.card1Val,
      sub: printStats.card1Sub
    },
    {
      label: printStats.card2Label.toUpperCase(),
      val: printStats.card2Val,
      sub: printStats.card2Sub
    },
    {
      label: printStats.card3Label.toUpperCase(),
      val: printStats.card3Val,
      sub: printStats.card3Sub
    },
    {
      label: printStats.card4Label.toUpperCase(),
      val: printStats.card4Val,
      sub: printStats.card4Sub
    }
  ] : [
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
    const isAlerta = (b.label.includes('FALTANTES') || b.label.includes('QUEBRA')) && parseInt(b.val, 10) > 0;
    
    if (isAlerta) {
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(252, 165, 165);
    } else {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
    }
    doc.roundedRect(x, boxY, boxWidth, boxHeight, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(isAlerta ? 185 : 100, isAlerta ? 28 : 116, isAlerta ? 28 : 139);
    doc.text(b.label, x + 6, boxY + 11);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(isAlerta ? 153 : 15, isAlerta ? 27 : 23, isAlerta ? 27 : 42);
    doc.text(b.val, x + 6, boxY + 23);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text(b.sub.slice(0, 32), x + 6, boxY + 33);
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

    const body = secoesList.map((item, idx) => [
      String(idx + 1),
      `${item.zona}/${item.secao}`,
      item.localNome || 'Local não informado',
      item.bairro || '-',
      String(item.totalCadastrados),
      item.isApurada && typeof item.votosApurados === 'number' ? String(item.votosApurados) : 'Pendente',
      item.isApurada ? `${item.cumprimentoPct}%` : '-',
      item.isApurada ? (item.saldo > 0 ? `+${item.saldo}` : String(item.saldo)) : '-',
      item.isApurada
        ? item.teveVotosSuficientes
          ? 'Cumprida ✓'
          : 'Quebra ✗'
        : 'Aguardando Urna'
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
        1: { cellWidth: 55, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 80 },
        4: { cellWidth: 42, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 45, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 42, halign: 'center', fontStyle: 'bold' },
        7: { cellWidth: 35, halign: 'center' },
        8: { cellWidth: 65, halign: 'center', fontStyle: 'bold' }
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });
  } else if (reportType === 'liderancas') {
    const headers = [
      '#',
      'Liderança / Articulador',
      'Tipo / Superior',
      'Cadastrados',
      'Seções Apur.',
      'Confirmados',
      'Faltantes',
      'Cumprimento',
      'Situação'
    ];

    const body = liderancasList.map((l, idx) => {
      const faltantes = l.votosFaltantesTotal ?? Math.max(0, l.eleitoresEmSecoesApuradas - l.votosValidadosTotal);
      return [
        String(idx + 1),
        l.nome,
        `${l.tipo || 'Liderança'}${l.liderancaPaiNome ? ` (Sub de ${l.liderancaPaiNome})` : ''}`,
        `${l.totalEleitoresPrometidos} (${l.eleitoresEmSecoesApuradas} apur.)`,
        `${l.secoesApuradas}/${l.secoesAtuadas}`,
        String(l.votosValidadosTotal),
        l.secoesApuradas > 0 ? (faltantes > 0 ? `${faltantes} faltantes` : '0') : '-',
        l.secoesApuradas > 0 ? `${l.cumprimentoMedioPct}%` : 'Pendente',
        l.classificacao === 'Meta Cumprida'
          ? 'Meta Cumprida ✓'
          : l.classificacao === 'Cumprimento Parcial'
          ? 'Na Meta (~)'
          : l.classificacao === 'Quebra Grave'
          ? `Quebra (-${faltantes}) ✗`
          : 'Aguardando Urna'
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
        1: { cellWidth: 105, fontStyle: 'bold' },
        2: { cellWidth: 85 },
        3: { cellWidth: 60, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 45, halign: 'center' },
        5: { cellWidth: 48, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 50, halign: 'center', fontStyle: 'bold' },
        7: { cellWidth: 45, halign: 'center', fontStyle: 'bold' },
        8: { cellWidth: 70, halign: 'center', fontStyle: 'bold' }
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
      'Cadastrados',
      'Urna BU',
      'Confirmados',
      'Faltantes',
      'Situação'
    ];

    const body = selectedLideranca.detalhesSecoes.map((item, idx) => {
      const faltantes = item.isApurada ? Math.max(0, item.eleitoresLideranca - item.votosValidados) : 0;
      return [
        String(idx + 1),
        `Z${item.zona} / S${item.secao}`,
        item.localNome || 'Local não cadastrado',
        item.bairro || '-',
        String(item.eleitoresLideranca),
        item.isApurada && typeof item.votosApurados === 'number' ? String(item.votosApurados) : 'Pendente',
        item.isApurada ? String(item.votosValidados) : '-',
        item.isApurada ? (faltantes > 0 ? `${faltantes} falt.` : '0') : '-',
        item.isApurada ? (item.teveVotosSuficientes ? 'Cumprida ✓' : `Quebra (-${faltantes}) ✗`) : 'Aguardando'
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
        1: { cellWidth: 55, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 70 },
        4: { cellWidth: 45, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 42, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 45, halign: 'center', fontStyle: 'bold' },
        7: { cellWidth: 45, halign: 'center', fontStyle: 'bold' },
        8: { cellWidth: 65, halign: 'center', fontStyle: 'bold' }
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });

    // Relação Nominal dos Eleitores Cadastrados desta Liderança
    const eleitoresDaLideranca = selectedLideranca.detalhesSecoes.flatMap((s) => s.eleitores);
    if (eleitoresDaLideranca.length > 0) {
      const lastTableY = (doc as any).lastAutoTable.finalY + 16;
      
      // Checa se precisa criar nova página para a lista nominal
      if (lastTableY > doc.internal.pageSize.getHeight() - 140) {
        doc.addPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(`Relação Nominal dos Eleitores de ${selectedLideranca.nome} (${eleitoresDaLideranca.length} eleitores):`, 32, 40);
        
        const eleitoresHeaders = ['#', 'Nome do Eleitor', 'Zona / Seção', 'Bairro', 'Telefone / Contato'];
        const eleitoresBody = eleitoresDaLideranca.slice(0, 150).map((e, idx) => [
          String(idx + 1),
          e.nome || 'Eleitor sem nome',
          `Z${e.zona} / S${e.secao}`,
          e.bairro || '-',
          (e as any).telefone || (e as any).celular || (e as any).whatsapp || '-'
        ]);

        autoTable(doc, {
          startY: 48,
          head: [eleitoresHeaders],
          body: eleitoresBody,
          margin: { left: 32, right: 32 },
          styles: {
            fontSize: 6.5,
            cellPadding: 2.5,
            textColor: [15, 23, 42]
          },
          headStyles: {
            fillColor: [51, 65, 85],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7
          },
          columnStyles: {
            0: { cellWidth: 20, halign: 'center' },
            1: { cellWidth: 170, fontStyle: 'bold' },
            2: { cellWidth: 70, halign: 'center' },
            3: { cellWidth: 95 },
            4: { cellWidth: 'auto' }
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          }
        });
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(`Relação Nominal dos Eleitores de ${selectedLideranca.nome} (${eleitoresDaLideranca.length} eleitores):`, 32, lastTableY);

        const eleitoresHeaders = ['#', 'Nome do Eleitor', 'Zona / Seção', 'Bairro', 'Telefone / Contato'];
        const eleitoresBody = eleitoresDaLideranca.slice(0, 150).map((e, idx) => [
          String(idx + 1),
          e.nome || 'Eleitor sem nome',
          `Z${e.zona} / S${e.secao}`,
          e.bairro || '-',
          (e as any).telefone || (e as any).celular || (e as any).whatsapp || '-'
        ]);

        autoTable(doc, {
          startY: lastTableY + 8,
          head: [eleitoresHeaders],
          body: eleitoresBody,
          margin: { left: 32, right: 32 },
          styles: {
            fontSize: 6.5,
            cellPadding: 2.5,
            textColor: [15, 23, 42]
          },
          headStyles: {
            fillColor: [51, 65, 85],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7
          },
          columnStyles: {
            0: { cellWidth: 20, halign: 'center' },
            1: { cellWidth: 170, fontStyle: 'bold' },
            2: { cellWidth: 70, halign: 'center' },
            3: { cellWidth: 95 },
            4: { cellWidth: 'auto' }
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          }
        });
      }
    }

    // Assinaturas para Prestação de Contas
    const lastY = (doc as any).lastAutoTable?.finalY || tableStartY + 100;
    let signBoxY = lastY + 45;
    if (signBoxY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      signBoxY = 60;
    }
    
    doc.setDrawColor(148, 163, 184);
    doc.line(40, signBoxY, 240, signBoxY);
    doc.line(pageWidth - 240, signBoxY, pageWidth - 40, signBoxY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('Assinatura da Coordenação Geral', 65, signBoxY + 12);
    doc.text(`Assinatura de ${selectedLideranca.nome}`, pageWidth - 215, signBoxY + 12);
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
      'SEATI Eleitoral • Sistema de Auditoria e Gestão Estratégica  |  Prestação de Contas Eleitoral',
      32,
      pageH - 18
    );
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 70, pageH - 18);
  }

  const cleanTitle = (
    reportType === 'secoes'
      ? 'relatorio_cumprimento_secoes'
      : reportType === 'liderancas'
      ? 'relatorio_cumprimento_liderancas'
      : `prestacao_contas_${selectedLideranca?.nome.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'lideranca'}`
  );
  doc.save(`${cleanTitle}_${Date.now()}.pdf`);
}
