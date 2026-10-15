'use client';

import React, { useState } from 'react';

export interface HorizontalBarItem {
  id: string | number;
  label: string;
  subLabel?: string;
  value: number;
  secondaryValue?: number;
  secondaryLabel?: string;
  color?: string;
  badge?: string;
  badgeColor?: string;
}

interface SvgHorizontalBarChartProps {
  data: HorizontalBarItem[];
  maxValue?: number;
  valueSuffix?: string;
  barColor?: string;
  showPercentage?: boolean;
  className?: string;
  emptyText?: string;
  maxItemsToShow?: number;
}

export function SvgHorizontalBarChart({
  data,
  maxValue,
  valueSuffix = 'votos',
  barColor = '#255fa5',
  showPercentage = true,
  className = '',
  emptyText = 'Nenhum registro para exibir',
  maxItemsToShow
}: SvgHorizontalBarChartProps) {
  const [hoveredId, setHoveredId] = useState<string | number | null>(null);

  const displayedData = maxItemsToShow ? data.slice(0, maxItemsToShow) : data;

  const totalSum = data.reduce((acc, item) => acc + item.value, 0);
  const calculatedMax = maxValue || Math.max(...displayedData.map((d) => d.value), 1);

  if (!displayedData.length || totalSum === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 ${className}`}>
        <p className="text-xs font-medium">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {displayedData.map((item, index) => {
        const pctOfMax = Math.min(100, Math.max(3, (item.value / calculatedMax) * 100));
        const pctOfTotal = totalSum > 0 ? ((item.value / totalSum) * 100).toFixed(1) : '0';
        const isHovered = hoveredId === item.id;
        const color = item.color || barColor;

        return (
          <div
            key={item.id}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
            className={`p-2 rounded-lg transition-colors ${
              isHovered ? 'bg-slate-50/80 shadow-xs' : ''
            }`}
          >
            {/* Header com Label e Valores */}
            <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                  {index + 1}
                </span>
                <span className="font-semibold text-slate-800 truncate" title={item.label}>
                  {item.label}
                </span>
                {item.subLabel && (
                  <span className="text-[11px] text-slate-500 truncate hidden sm:inline" title={item.subLabel}>
                    • {item.subLabel}
                  </span>
                )}
                {item.badge && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    item.badgeColor || 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono font-bold text-slate-900">
                  {item.value.toLocaleString('pt-BR')}{' '}
                  <span className="text-[10px] font-normal text-slate-500">{valueSuffix}</span>
                </span>
                {showPercentage && (
                  <span className="text-[10px] font-mono text-slate-500 w-12 text-right">
                    {pctOfTotal}%
                  </span>
                )}
              </div>
            </div>

            {/* Barra SVG animada */}
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex items-center p-0.5">
              <div
                className="h-full rounded-full transition-all duration-300 ease-out shadow-xs"
                style={{
                  width: `${pctOfMax}%`,
                  backgroundColor: color,
                  opacity: hoveredId !== null && !isHovered ? 0.7 : 1
                }}
              />
            </div>

            {/* Sub-valores informativos secundários se fornecidos */}
            {item.secondaryValue !== undefined && item.secondaryLabel && (
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 px-1">
                <span>{item.secondaryLabel}</span>
                <span className="font-mono font-medium">{item.secondaryValue.toLocaleString('pt-BR')}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
