'use client';

import React, { useState } from 'react';

export interface GroupedBarItem {
  id: string | number;
  category: string;
  subCategory?: string;
  val1: number; // ex: Cadastrados / Prometidos
  val2: number; // ex: Apurados na Urna / Validados
  val3?: number; // opcional: ex: Conflitos ou Quebras
  label1?: string;
  label2?: string;
  label3?: string;
}

interface SvgGroupedBarChartProps {
  data: GroupedBarItem[];
  label1?: string;
  label2?: string;
  label3?: string;
  color1?: string;
  color2?: string;
  color3?: string;
  height?: number;
  className?: string;
  emptyText?: string;
  showDiffBadge?: boolean;
}

export function SvgGroupedBarChart({
  data,
  label1 = 'Cadastrados',
  label2 = 'Apurados na Urna',
  label3,
  color1 = '#255fa5', // azul primário
  color2 = '#10b981', // verde esmeralda
  color3 = '#ef4444', // vermelho alerta
  height = 240,
  className = '',
  emptyText = 'Sem dados suficientes para comparação',
  showDiffBadge = true
}: SvgGroupedBarChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 ${className}`}>
        <p className="text-xs font-medium">{emptyText}</p>
      </div>
    );
  }

  const maxValue = Math.max(
    ...data.flatMap((d) => [d.val1, d.val2, d.val3 || 0]),
    10
  );

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Legenda do Gráfico Comparativo */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-100 pb-2.5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs shadow-xs" style={{ backgroundColor: color1 }} />
            <span className="text-slate-700 font-medium">{label1}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs shadow-xs" style={{ backgroundColor: color2 }} />
            <span className="text-slate-700 font-medium">{label2}</span>
          </div>
          {label3 && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs shadow-xs" style={{ backgroundColor: color3 }} />
              <span className="text-slate-700 font-medium">{label3}</span>
            </div>
          )}
        </div>
        <span className="text-[11px] text-slate-500 italic">
          Valores absolutos por grupo
        </span>
      </div>

      {/* Área de Barras Verticais lado a lado */}
      <div className="overflow-x-auto custom-scrollbar pb-2">
        <div
          className="flex items-end gap-4 min-w-[500px] pt-6 px-2"
          style={{ height: height }}
        >
          {data.map((item, idx) => {
            const h1 = Math.min(100, Math.max(item.val1 > 0 ? 4 : 0, (item.val1 / maxValue) * 100));
            const h2 = Math.min(100, Math.max(item.val2 > 0 ? 4 : 0, (item.val2 / maxValue) * 100));
            const h3 = item.val3 !== undefined ? Math.min(100, Math.max(item.val3 > 0 ? 4 : 0, (item.val3 / maxValue) * 100)) : 0;
            const diff = item.val2 - item.val1;
            const isHovered = hoveredIdx === idx;

            return (
              <div
                key={item.id}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`flex-1 flex flex-col items-center h-full justify-end group transition-opacity ${
                  hoveredIdx !== null && !isHovered ? 'opacity-60' : 'opacity-100'
                }`}
              >
                {/* Diferença / Saldo no Topo */}
                {showDiffBadge && (
                  <div className="mb-2 text-center h-5 flex items-center justify-center">
                    {diff !== 0 && item.val2 > 0 ? (
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          diff > 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                        title={diff > 0 ? `Superávit de +${diff} votos` : `Quebra de ${diff} votos`}
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono">-</span>
                    )}
                  </div>
                )}

                {/* Colunas lado a lado */}
                <div className="w-full flex items-end justify-center gap-1.5 h-[calc(100%-48px)] px-1">
                  {/* Barra 1 */}
                  <div className="flex-1 max-w-[28px] h-full flex flex-col justify-end items-center">
                    <span className="text-[9px] font-mono text-slate-600 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.val1}
                    </span>
                    <div
                      className="w-full rounded-t-sm transition-all duration-300"
                      style={{
                        height: `${h1}%`,
                        backgroundColor: color1,
                        filter: isHovered ? 'brightness(1.1)' : 'none'
                      }}
                      title={`${label1}: ${item.val1.toLocaleString('pt-BR')}`}
                    />
                  </div>

                  {/* Barra 2 */}
                  <div className="flex-1 max-w-[28px] h-full flex flex-col justify-end items-center">
                    <span className="text-[9px] font-mono text-slate-600 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.val2}
                    </span>
                    <div
                      className="w-full rounded-t-sm transition-all duration-300"
                      style={{
                        height: `${h2}%`,
                        backgroundColor: color2,
                        filter: isHovered ? 'brightness(1.1)' : 'none'
                      }}
                      title={`${label2}: ${item.val2.toLocaleString('pt-BR')}`}
                    />
                  </div>

                  {/* Barra 3 (se aplicável) */}
                  {label3 && item.val3 !== undefined && (
                    <div className="flex-1 max-w-[28px] h-full flex flex-col justify-end items-center">
                      <span className="text-[9px] font-mono text-slate-600 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.val3}
                      </span>
                      <div
                        className="w-full rounded-t-sm transition-all duration-300"
                        style={{
                          height: `${h3}%`,
                          backgroundColor: color3,
                          filter: isHovered ? 'brightness(1.1)' : 'none'
                        }}
                        title={`${label3}: ${item.val3.toLocaleString('pt-BR')}`}
                      />
                    </div>
                  )}
                </div>

                {/* Linha de base e Rótulo */}
                <div className="w-full border-t border-slate-200 pt-1.5 text-center mt-1">
                  <p
                    className="text-[11px] font-semibold text-slate-700 truncate max-w-[90px] mx-auto"
                    title={item.category}
                  >
                    {item.category}
                  </p>
                  {item.subCategory && (
                    <p className="text-[9px] text-slate-500 truncate max-w-[90px] mx-auto">
                      {item.subCategory}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
