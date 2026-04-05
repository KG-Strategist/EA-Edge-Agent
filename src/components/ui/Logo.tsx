import React from 'react';

export default function Logo({ className = "w-10 h-10" }: { className?: string }) {
  // 16x20 Grid mapping a classic 4-bit RPG sprite bot wearing a hat
  const PIXELS = [
    "     OOOOOO     ",
    "    OBBBBDBO    ",
    "   OBBBBDDBBO   ",
    "   OHHHHHHHHO   ",
    " OOOOOOOOOOOOOO ",
    " O            O ",
    "   OOOOOOOOOO   ",
    "  OMMMMMMMMMDO  ",
    "  OM E MM E DO  ",
    "  OMMMMMMMMMDO  ",
    "   OMOOOOOODO   ",
    "   ODDDDDDDDO   ",
    "    OOOOOOOO    ",
    "   OMMMMMMMDO   ",
    "  OMOODDDDOMOO  ",
    "  ODMODMMDOMDO  ",
    "  OO OOOOOO OO  ",
    "     OO  OO     ",
    "    OOO  OOO    ",
    "    OOO  OOO    ",
  ];

  const colorMap: Record<string, string> = {
    'O': '#0f172a', // Dark Outline (Slate 900)
    'B': '#334155', // Smoky blue hat (Slate 700)
    'H': '#06b6d4', // Neon Cyan hat band
    'M': '#94a3b8', // Light Metal body (Slate 400)
    'D': '#64748b', // Dark Metal body shade (Slate 500)
    'E': '#22d3ee', // Glowing eye (Cyan 400)
  };

  return (
    <svg
      className={className}
      viewBox="0 0 16 20"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges" // Guarantees true 8-bit sharpness without blur
    >
      {PIXELS.map((row, y) =>
        row.split('').map((char, x) => {
          if (char === ' ') return null;
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="1.05" // slight overlap to prevent subpixel rendering gaps
              height="1.05"
              fill={colorMap[char]}
            />
          );
        })
      )}
    </svg>
  );
}
