import React from 'react';

/**
 * BDATRadar — Reusable SVG radar chart for BDAT axis comparison.
 * Pure SVG, zero external chart library dependencies.
 * Renders up to 5 vendor overlays on a 4-axis (B/D/A/T) radar.
 */

interface VendorData {
  name: string;
  B: number; // 0-100 percentage
  D: number;
  A: number;
  T: number;
}

interface BDATRadarProps {
  vendors: VendorData[];
  size?: number;
}

const AXES = ['B', 'D', 'A', 'T'] as const;
const AXIS_LABELS = { B: 'Business', D: 'Data', A: 'Application', T: 'Technology' };
const VENDOR_COLORS = [
  { stroke: '#6366f1', fill: 'rgba(99,102,241,0.15)' },  // indigo
  { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.12)' },  // amber
  { stroke: '#10b981', fill: 'rgba(16,185,129,0.12)' },   // emerald
  { stroke: '#ef4444', fill: 'rgba(239,68,68,0.12)' },    // red
  { stroke: '#8b5cf6', fill: 'rgba(139,92,246,0.12)' },   // violet
];

function polarToCartesian(cx: number, cy: number, radius: number, angleIndex: number, totalAxes: number): [number, number] {
  const angle = (Math.PI * 2 * angleIndex) / totalAxes - Math.PI / 2;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

export default function BDATRadar({ vendors, size = 280 }: BDATRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.38;
  const levels = 4; // Concentric rings

  // Build concentric grid
  const gridPolygons: string[] = [];
  for (let level = 1; level <= levels; level++) {
    const r = (maxRadius * level) / levels;
    const points = AXES.map((_, i) => polarToCartesian(cx, cy, r, i, AXES.length));
    gridPolygons.push(points.map(p => `${p[0]},${p[1]}`).join(' '));
  }

  // Build axis lines
  const axisLines = AXES.map((_, i) => {
    const [x2, y2] = polarToCartesian(cx, cy, maxRadius, i, AXES.length);
    return { x1: cx, y1: cy, x2, y2 };
  });

  // Build label positions
  const labels = AXES.map((axis, i) => {
    const [x, y] = polarToCartesian(cx, cy, maxRadius + 22, i, AXES.length);
    return { axis, label: AXIS_LABELS[axis], x, y };
  });

  // Build vendor polygons
  const vendorPolygons = vendors.map((vendor, vi) => {
    const points = AXES.map((axis, i) => {
      const value = Math.min(100, Math.max(0, vendor[axis]));
      const r = (maxRadius * value) / 100;
      return polarToCartesian(cx, cy, r, i, AXES.length);
    });
    return {
      name: vendor.name,
      color: VENDOR_COLORS[vi % VENDOR_COLORS.length],
      pointsStr: points.map(p => `${p[0]},${p[1]}`).join(' '),
      dots: points,
    };
  });

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Grid rings */}
        {gridPolygons.map((pts, i) => (
          <polygon
            key={`grid-${i}`}
            points={pts}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-gray-300 dark:text-gray-700"
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <line
            key={`axis-${i}`}
            x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-gray-300 dark:text-gray-700"
          />
        ))}

        {/* Vendor polygons */}
        {vendorPolygons.map((vp, i) => (
          <g key={`vendor-${i}`}>
            <polygon
              points={vp.pointsStr}
              fill={vp.color.fill}
              stroke={vp.color.stroke}
              strokeWidth="2"
              className="transition-all duration-300"
            />
            {vp.dots.map((dot, di) => (
              <circle
                key={`dot-${i}-${di}`}
                cx={dot[0]} cy={dot[1]} r="3.5"
                fill={vp.color.stroke}
                className="transition-all duration-300"
              />
            ))}
          </g>
        ))}

        {/* Axis labels */}
        {labels.map((l) => (
          <text
            key={l.axis}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-gray-600 dark:fill-gray-300 font-semibold"
            style={{ fontSize: '11px' }}
          >
            {l.label}
          </text>
        ))}

        {/* Scale labels */}
        {[25, 50, 75, 100].map((val, i) => {
          const r = (maxRadius * (i + 1)) / levels;
          return (
            <text
              key={`scale-${val}`}
              x={cx + 4}
              y={cy - r - 2}
              className="fill-gray-400 dark:fill-gray-600"
              style={{ fontSize: '8px' }}
            >
              {val}%
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      {vendors.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 mt-4">
          {vendorPolygons.map((vp, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: vp.color.stroke }}
              />
              <span className="text-gray-700 dark:text-gray-300 font-medium">{vp.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
