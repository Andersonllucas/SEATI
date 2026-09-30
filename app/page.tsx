'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  UserCheck,
  Users,
  Target,
  MapPin,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  Plus,
  RotateCcw
} from 'lucide-react';
import { useCampaignData, Eleitor } from '@/context/CampaignContext';
import { useTenant } from '@/context/TenantContext';
import { DashboardLeaderRow } from '@/components/DashboardLeaderRow';
import DashboardLayoutWrapper from './DashboardLayoutWrapper';

function parseVoterDate(e: Eleitor): Date | null {
  if (!e.dataCadastro) return null;
  const dc = e.dataCadastro as any;
  if (typeof dc.toDate === 'function') {
    return dc.toDate();
  }
  if (typeof dc.seconds === 'number') {
    return new Date(dc.seconds * 1000);
  }
  const d = new Date(dc);
  return isNaN(d.getTime()) ? null : d;
}

function DashboardContent() {
  const {
    eleitores,
    liderancas,
    locais,
    totalEleitores,
    totalLiderancasAtivas,
    totalConflitos
  } = useCampaignData();

  const [periodoGrafico, setPeriodoGrafico] = useState<'7d' | '30d'>('7d');

  // 1. Métricas de Contato e Qualidade dos Dados Reais
  const eleitoresComTelefone = useMemo(() => {
    return eleitores.filter((e) => !!(e.telefone && e.telefone.replace(/\D/g, '').length >= 8)).length;
  }, [eleitores]);

  const percentualComTelefone = useMemo(() => {
    if (totalEleitores === 0) return 0;
    return Math.round((eleitoresComTelefone / totalEleitores) * 100);
  }, [eleitoresComTelefone, totalEleitores]);

  // 2. Meta Global Consolidada das Lideranças
  const totalMetaVotos = useMemo(() => {
    return liderancas.reduce((acc, l) => acc + (Number(l.metaVotos) || 0), 0);
  }, [liderancas]);

  const percentualMetaGeral = useMemo(() => {
    if (totalMetaVotos <= 0) return 0;
    return Math.min(100, Math.round((totalEleitores / totalMetaVotos) * 100));
  }, [totalEleitores, totalMetaVotos]);

  // 3. Cobertura de Locais e Seções Reais
  const totalSecoesMapeadas = useMemo(() => {
    let count = 0;
    locais.forEach((loc) => {
      if (Array.isArray(loc.secoes)) {
        count += loc.secoes.length;
      }
    });
    return count;
  }, [locais]);

  const zonasAtivas = useMemo(() => {
    const set = new Set<string>();
    eleitores.forEach((e) => {
      if (e.zona) set.add(String(e.zona).trim());
    });
    locais.forEach((l) => {
      if (l.zona) set.add(String(l.zona).trim());
    });
    return Array.from(set).filter(Boolean).sort();
  }, [eleitores, locais]);

  // 4. Bairros e Regiões Mais Expressivos Reais
  const topBairros = useMemo(() => {
    const counts: Record<string, number> = {};
    eleitores.forEach((e) => {
      const b = (e.bairro || '').trim() || (e.zona ? `Zona ${e.zona}` : 'Bairro Não Informado');
      counts[b] = (counts[b] || 0) + 1;
    });

    const entries = Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      pctNumber: totalEleitores > 0 ? (count / totalEleitores) * 100 : 0,
      pct: totalEleitores > 0 ? ((count / totalEleitores) * 100).toFixed(1) : '0'
    }));

    return entries.sort((a, b) => b.count - a.count).slice(0, 5);
  }, [eleitores, totalEleitores]);

  // 5. Ranking Real de Desempenho das Lideranças
  const topLiderancasDesempenho = useMemo(() => {
    const countByLeader = new Map<string, number>();
    eleitores.forEach((e) => {
      if (e.liderancaId) {
        countByLeader.set(e.liderancaId, (countByLeader.get(e.liderancaId) || 0) + 1);
      } else if (e.lideranca) {
        const clean = e.lideranca.trim().toLowerCase();
        countByLeader.set(clean, (countByLeader.get(clean) || 0) + 1);
      }
    });

    return liderancas
      .map((l) => {
        const cleanName = (l.nome || '').trim().toLowerCase();
        const captados = (l.id ? countByLeader.get(l.id) : 0) || countByLeader.get(cleanName) || 0;
        const meta = Number(l.metaVotos) || 0;
        const pct = meta > 0 ? Math.round((captados / meta) * 100) : 0;
        return {
          id: l.id,
          nome: l.nome,
          tipo: l.tipo,
          regiao: l.regiao || l.bairro || 'Geral',
          status: l.status,
          meta,
          captados,
          pct
        };
      })
      .sort((a, b) => b.captados - a.captados)
      .slice(0, 5);
  }, [liderancas, eleitores]);

  // 6. Dados Reais de Captação Temporal (Últimos 7 dias ou Últimos 30 dias)
  const dadosTemporais = useMemo(() => {
    const now = new Date();
    const is7d = periodoGrafico === '7d';

    if (is7d) {
      // 7 dias individuais (de hoje até 6 dias atrás)
      const dias: { label: string; dateStr: string; count: number; dayName: string }[] = [];
      const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const dayName = i === 0 ? 'Hoje' : dayNames[d.getDay()];
        dias.push({
          label: `${dd}/${mm}`,
          dayName,
          dateStr,
          count: 0
        });
      }

      let totalPeriodo = 0;
      eleitores.forEach((e) => {
        const date = parseVoterDate(e);
        if (date) {
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          const str = `${yyyy}-${mm}-${dd}`;
          const match = dias.find((item) => item.dateStr === str);
          if (match) {
            match.count += 1;
            totalPeriodo += 1;
          }
        }
      });

      const maxVal = Math.max(...dias.map((d) => d.count), 1);
      const mediaDiaria = (totalPeriodo / 7).toFixed(1);

      return {
        itens: dias.map((d) => ({
          label: d.label,
          subtitle: d.dayName,
          count: d.count,
          pctHeight: d.count > 0 ? Math.max(10, Math.round((d.count / maxVal) * 100)) : 4
        })),
        totalPeriodo,
        mediaDiaria: Number(mediaDiaria),
        maxVal
      };
    } else {
      // Últimos 30 dias divididos em 6 blocos de 5 dias
      const blocos: { label: string; subtitle: string; start: Date; end: Date; count: number }[] = [];
      for (let b = 5; b >= 0; b--) {
        const start = new Date(now);
        start.setDate(start.getDate() - (b * 5 + 4));
        const end = new Date(now);
        end.setDate(end.getDate() - b * 5);

        const startDd = String(start.getDate()).padStart(2, '0');
        const startMm = String(start.getMonth() + 1).padStart(2, '0');
        const endDd = String(end.getDate()).padStart(2, '0');
        const endMm = String(end.getMonth() + 1).padStart(2, '0');

        blocos.push({
          label: `${startDd}/${startMm}`,
          subtitle: `até ${endDd}/${endMm}`,
          start,
          end,
          count: 0
        });
      }

      let totalPeriodo = 0;
      eleitores.forEach((e) => {
        const date = parseVoterDate(e);
        if (date) {
          blocos.forEach((bloco) => {
            if (date >= bloco.start && date <= bloco.end) {
              bloco.count += 1;
              totalPeriodo += 1;
            }
          });
        }
      });

      const maxVal = Math.max(...blocos.map((d) => d.count), 1);
      const mediaDiaria = (totalPeriodo / 30).toFixed(1);

      return {
        itens: blocos.map((b) => ({
          label: b.label,
          subtitle: b.subtitle,
          count: b.count,
          pctHeight: b.count > 0 ? Math.max(10, Math.round((b.count / maxVal) * 100)) : 4
        })),
        totalPeriodo,
        mediaDiaria: Number(mediaDiaria),
        maxVal
      };
    }
  }, [eleitores, periodoGrafico]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header com Informações Reais da Campanha */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl md:text-2xl text-on-surface font-bold tracking-tight">Painel Estratégico de Campanha</h2>
            <span className="px-2.5 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Sincronizado em Tempo Real
            </span>
          </div>
        </div>

        {/* Atalhos Rápidos de Ação */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/eleitores"
            prefetch={true}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold border border-outline-variant/50 transition-colors"
          >
            <UserCheck className="w-3.5 h-3.5 text-secondary" />
            <span>Ver Eleitores</span>
          </Link>
          <Link
            href="/cadastro-em-massa"
            prefetch={true}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-on-primary text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Cadastrar Eleitor</span>
          </Link>
        </div>
      </div>

      {/* Alerta Real de Auditoria (Apenas se houver conflitos reais detectados na base) */}
      {totalConflitos > 0 && (
        <div className="bg-error-container/20 border border-error/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-error-container text-error flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-on-surface">
                Auditoria de Campanha: {totalConflitos} CPF{totalConflitos > 1 ? 's' : ''} em Conflito entre Lideranças
              </h4>
              <p className="text-xs text-on-surface-variant">
                Existem eleitores cadastrados simultaneamente por mais de uma liderança. Acesse a auditoria para definir a atribuição oficial.
              </p>
            </div>
          </div>
          <Link
            href="/validacoes"
            prefetch={true}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-error text-white text-xs font-semibold hover:opacity-95 transition-opacity shrink-0"
          >
            <span>Resolver Conflitos</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* 4 Cards de Indicadores Estratégicos Reais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Real de Eleitores */}
        <KpiCard
          title="Total de Eleitores"
          value={totalEleitores.toLocaleString('pt-BR')}
          icon={UserCheck}
          highlight={totalEleitores > 0 ? `${percentualComTelefone}% com WhatsApp` : undefined}
          sub={
            totalEleitores > 0
              ? `${eleitoresComTelefone.toLocaleString('pt-BR')} eleitores com telefone para contato direto`
              : 'Nenhum eleitor cadastrado'
          }
        />

        {/* Card 2: Lideranças e Articuladores */}
        <KpiCard
          title="Lideranças Ativas"
          value={`${totalLiderancasAtivas} / ${liderancas.length}`}
          icon={Users}
          sub={
            totalMetaVotos > 0
              ? `Meta combinada: ${totalMetaVotos.toLocaleString('pt-BR')} votos pretendidos`
              : 'Defina metas nas fichas das lideranças'
          }
        />

        {/* Card 3: Progresso Real da Meta Geral (Substitui o card TSE removido) */}
        <KpiCard
          title="Atingimento da Meta Geral"
          value={`${percentualMetaGeral}%`}
          icon={Target}
          progress={percentualMetaGeral}
          progressLabel="Progresso Geral da Campanha"
          highlight={percentualMetaGeral >= 100 ? 'Meta Atingida' : undefined}
          sub={
            totalMetaVotos > 0
              ? `${totalEleitores.toLocaleString('pt-BR')} de ${totalMetaVotos.toLocaleString('pt-BR')} votos estipulados`
              : 'Cadastre metas para calcular o atingimento'
          }
        />

        {/* Card 4: Cobertura Territorial & Locais */}
        <KpiCard
          title="Locais de Votação"
          value={`${locais.length} Colégios`}
          icon={MapPin}
          sub={
            locais.length > 0
              ? `${totalSecoesMapeadas} seções em ${zonasAtivas.length || 1} zona${(zonasAtivas.length || 1) > 1 ? 's' : ''}`
              : 'Nenhum local cadastrado ainda'
          }
          highlight={topBairros.length > 0 ? `${topBairros.length} Bairros` : undefined}
        />
      </div>

      {/* Grid Principal: Gráfico Temporal Real + Regiões Prioritárias Reais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico Real de Evolução de Cadastros */}
        <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-secondary" />
                <h3 className="text-lg text-on-surface font-bold">Evolução Real de Cadastros</h3>
              </div>
              <p className="text-sm text-on-surface-variant mt-0.5">
                {dadosTemporais.totalPeriodo > 0
                  ? `${dadosTemporais.totalPeriodo} novos eleitores no período (${dadosTemporais.mediaDiaria} por dia em média)`
                  : `Total acumulado na base: ${totalEleitores.toLocaleString('pt-BR')} eleitores`}
              </p>
            </div>

            {/* Alternador de Período */}
            <div className="flex border border-outline-variant/60 rounded-lg p-0.5 bg-surface-container-low text-xs w-fit">
              <button
                type="button"
                onClick={() => setPeriodoGrafico('7d')}
                className={`px-3 py-1 rounded transition-colors font-semibold cursor-pointer ${
                  periodoGrafico === '7d'
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Últimos 7 Dias
              </button>
              <button
                type="button"
                onClick={() => setPeriodoGrafico('30d')}
                className={`px-3 py-1 rounded transition-colors font-semibold cursor-pointer ${
                  periodoGrafico === '30d'
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Últimos 30 Dias
              </button>
            </div>
          </div>

          {/* Área das Barras Dinâmicas */}
          <div className="h-56 w-full flex items-end justify-between gap-2 px-2 border-b border-outline-variant/30 pb-3">
            {dadosTemporais.itens.map((item, i) => {
              const hasCount = item.count > 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                  <span
                    className={`text-xs font-bold transition-transform group-hover:scale-110 ${
                      hasCount ? 'text-secondary' : 'text-on-surface-variant/40'
                    }`}
                  >
                    {item.count}
                  </span>
                  <div className="w-full bg-surface-container-low rounded-t relative overflow-hidden flex items-end h-[140px]">
                    <div
                      className={`w-full rounded-t transition-all duration-500 ${
                        hasCount
                          ? 'bg-primary-container group-hover:bg-secondary'
                          : 'bg-surface-container-high/40'
                      }`}
                      style={{ height: `${item.pctHeight}%` }}
                      title={`${item.count} eleitores (${item.subtitle} - ${item.label})`}
                    ></div>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="text-[11px] font-semibold text-on-surface leading-tight">{item.subtitle}</span>
                    <span className="text-[10px] text-on-surface-variant">{item.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-on-surface-variant">
            <span>Base de dados real integrada ao Firestore</span>
            <span className="font-semibold text-primary">
              Total Geral: {totalEleitores.toLocaleString('pt-BR')} registros
            </span>
          </div>
        </div>

        {/* Regiões e Bairros Prioritários Reais */}
        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              <h3 className="text-lg text-on-surface font-bold">Bairros Principais</h3>
            </div>
            <span className="text-xs font-semibold text-secondary">Concentração</span>
          </div>
          <p className="text-xs text-on-surface-variant mb-5">Distribuição real dos eleitores cadastrados por localidade.</p>

          {topBairros.length > 0 ? (
            <div className="space-y-4 flex-1">
              {topBairros.map((bairro, idx) => {
                const colors = [
                  'bg-primary-container',
                  'bg-secondary',
                  'bg-tertiary-container',
                  'bg-primary-fixed-variant',
                  'bg-secondary-container'
                ];
                const color = colors[idx % colors.length];

                return (
                  <div key={bairro.name}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-on-surface font-semibold truncate pr-2" title={bairro.name}>
                        {bairro.name}
                      </span>
                      <span className="text-primary font-bold whitespace-nowrap text-xs">
                        {bairro.count.toLocaleString('pt-BR')} ({bairro.pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded bg-surface-container overflow-hidden">
                      <div
                        className={`${color} h-full rounded transition-all duration-500`}
                        style={{ width: `${Math.max(bairro.pctNumber, 3)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-outline-variant rounded-lg">
              <MapPin className="w-8 h-8 text-on-surface-variant/40 mb-2" />
              <p className="text-xs font-medium text-on-surface-variant">Nenhum bairro registrado ainda.</p>
              <Link
                href="/eleitores"
                prefetch={true}
                className="mt-3 text-xs text-primary font-semibold hover:underline"
              >
                Cadastrar eleitores com bairro
              </Link>
            </div>
          )}

          <div className="mt-5 pt-3 border-t border-outline-variant/30 flex justify-between items-center text-xs text-on-surface-variant">
            <span>Bairros Mapeados: {topBairros.length}</span>
            <Link href="/eleitores" prefetch={true} className="font-semibold text-secondary hover:underline flex items-center gap-1">
              <span>Filtrar na Tabela</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Desempenho Real das Lideranças da Campanha */}
      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-secondary" />
              <h3 className="text-lg text-on-surface font-bold">Desempenho Real por Liderança</h3>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Comparativo de eleitores cadastrados em relação à meta de votos estipulada para cada liderança.
            </p>
          </div>
          <Link
            href="/liderancas"
            prefetch={true}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold border border-outline-variant/60 transition-colors w-fit"
          >
            <span>Gerenciar Lideranças</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {topLiderancasDesempenho.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/40 text-on-surface-variant uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3 font-semibold">Liderança</th>
                  <th className="py-2.5 px-3 font-semibold">Tipo / Função</th>
                  <th className="py-2.5 px-3 font-semibold">Região / Bairro</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Meta de Votos</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Cadastrados</th>
                  <th className="py-2.5 px-3 font-semibold text-center">% da Meta</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {topLiderancasDesempenho.map((lider) => (
                  <DashboardLeaderRow key={lider.id} lider={lider} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center border border-dashed border-outline-variant rounded-lg">
            <Users className="w-10 h-10 text-on-surface-variant/40 mx-auto mb-2" />
            <p className="text-sm font-semibold text-on-surface">Nenhuma liderança cadastrada</p>
            <p className="text-xs text-on-surface-variant mt-1">
              Cadastre suas lideranças e estipule metas de votos para acompanhar o desempenho aqui.
            </p>
            <Link
              href="/liderancas"
              prefetch={true}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-primary text-on-primary text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Cadastrar Primeira Liderança</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { isAdminMaster, subdomain } = useTenant();
  const router = useRouter();

  useEffect(() => {
    if (isAdminMaster || subdomain === 'admin') {
      router.replace('/admin-master');
    }
  }, [isAdminMaster, subdomain, router]);

  // Se estiver no modo master (domínio admin.adti.app.br ou subdomínio 'admin'), não renderiza o painel de campanha
  if (isAdminMaster || subdomain === 'admin') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center animate-spin">
            <RotateCcw className="w-5 h-5" />
          </div>
          <p className="text-xs text-slate-400 font-medium">Acessando Painel Master...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayoutWrapper>
      <DashboardContent />
    </DashboardLayoutWrapper>
  );
}

interface KpiCardProps {
  title: string;
  value: string;
  icon: any;
  highlight?: string;
  progress?: number;
  progressLabel?: string;
  sub?: string;
  subColor?: string;
}

const KpiCard = React.memo(function KpiCard({
  title,
  value,
  icon: Icon,
  highlight,
  progress,
  progressLabel,
  sub,
  subColor
}: KpiCardProps) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-4 shadow-sm flex flex-col justify-between hover:border-secondary transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-sm font-medium text-on-surface-variant">{title}</span>
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            <span className="text-2xl md:text-3xl text-primary font-bold">{value}</span>
            {highlight && (
              <span className="text-[10px] text-tertiary-fixed-variant bg-tertiary-fixed/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                {highlight}
              </span>
            )}
          </div>
        </div>
        <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary shrink-0">
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {(progress !== undefined || sub) && (
        <div className="mt-4 pt-3 border-t border-outline-variant/30">
          {progress !== undefined && (
            <div className="mb-2">
              <div className="flex justify-between text-xs text-on-surface-variant mb-1">
                <span>{progressLabel}</span>
                <span className="font-semibold text-primary">{progress}%</span>
              </div>
              <div className="w-full h-1.5 rounded bg-surface-container overflow-hidden">
                <div
                  className="bg-primary-container h-full rounded transition-all duration-500"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                ></div>
              </div>
            </div>
          )}
          {sub && (
            <div className={`text-xs mt-1 font-medium ${subColor || 'text-on-surface-variant'}`}>
              {sub}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
