'use client';

import React, { useState } from 'react';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  secondaryText?: string;
}

interface SvgDonutChartProps {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerTitle?: string;
  centerSubtitle?: string;
  showLegend?: boolean;
  legendPosition?: 'bottom' | 'right';
  className?: string;
  emptyText?: string;
}

export function SvgDonutChart({
  data,
  size = 220,
  thickness = 32,
  centerTitle,
  centerSubtitle,
  showLegend = true,
  legendPosition = 'right',
  className = '',
  emptyText = 'Nenhum dado cadastrado'
}: SvgDonutChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = data.reduce((acc, item) => acc + (item.value || 0), 0);

  if (total === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 ${className}`}>
        <div className="w-16 h-16 rounded-full border-4 border-dashed border-slate-200 flex items-center justify-center mb-2 text-slate-300">
          ∅
        </div>
        <p className="text-xs font-medium">{emptyText}</p>
      </div>
    );
  }

  const radius = size / 2;
  const innerRadius = radius - thickness;
  const center = radius;

  // Gerar arcos SVG em formato donut
  let cumulativeAngle = 0;
  const slicesWithAngles = data.map((item, idx) => {
    const angle = (item.value / total) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle += angle;

    // Converte ângulos para coordenadas cartesianas (em radianos)
    // -90 graus para iniciar no topo (12 horas)
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    const x3 = center + innerRadius * Math.cos(endRad);
    const y3 = center + innerRadius * Math.sin(endRad);
    const x4 = center + innerRadius * Math.cos(startRad);
    const y4 = center + innerRadius * Math.sin(startRad);

    const largeArc = angle > 180 ? 1 : 0;

    const pathData = `
      M ${x1} ${y1}
      A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
      L ${x3} ${y3}
      A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}
      Z
    `;

    const percentage = ((item.value / total) * 100).toFixed(1);

    return {
      ...item,
      pathData,
      percentage,
      startAngle,
      endAngle,
      idx
    };
  });

  return (
    <div
      className={`flex ${
        legendPosition === 'bottom' ? 'flex-col items-center gap-4' : 'flex-col sm:flex-row items-center gap-6'
      } ${className}`}
    >
      {/* SVG Donut */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible select-none drop-shadow-sm"
        >
          {slicesWithAngles.map((slice) => {
            const isHovered = hoveredIdx === slice.idx;
            return (
              <path
                key={slice.idx}
                d={slice.pathData}
                fill={slice.color}
                className="transition-all duration-200 cursor-pointer"
                style={{
                  transformOrigin: `${center}px ${center}px`,
                  transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                  opacity: hoveredIdx !== null && !isHovered ? 0.75 : 1,
                  filter: isHovered ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.15))' : 'none'
                }}
                onMouseEnter={() => setHoveredIdx(slice.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <title>
                  {`${slice.label}: ${slice.value.toLocaleString('pt-BR')} (${slice.percentage}%)`}
                </title>
              </path>
            );
          })}
        </svg>

        {/* Centro Informativo */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
          <span className="text-xl sm:text-2xl font-bold font-display text-slate-800 tracking-tight leading-none">
            {centerTitle !== undefined ? centerTitle : total.toLocaleString('pt-BR')}
          </span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-1">
            {centerSubtitle !== undefined ? centerSubtitle : 'Total'}
          </span>
        </div>
      </div>

      {/* Legenda Lateral ou Inferior */}
      {showLegend && (
        <div className="flex-1 w-full flex flex-col gap-2 min-w-0">
          {slicesWithAngles.map((slice) => {
            const isHovered = hoveredIdx === slice.idx;
            return (
              <div
                key={slice.idx}
                onMouseEnter={() => setHoveredIdx(slice.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer ${
                  isHovered ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="text-slate-700 truncate" title={slice.label}>
                    {slice.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono font-bold text-slate-900">
                    {slice.value.toLocaleString('pt-BR')}
                  </span>
                  <span className="text-[10px] font-mono font-medium text-slate-500 w-12 text-right">
                    {slice.percentage}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
