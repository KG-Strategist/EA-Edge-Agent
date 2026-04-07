import React, { useState, useEffect } from 'react';

export default function Logo({ className = "w-10 h-10", animated = true }: { className?: string; animated?: boolean }) {
  const FRAMES = [
    // Frame 0 (Original)
    [
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
    ],
    // Frame 1 (Scan Left + Hover Shift)
    [
      "     OOOOOO     ",
      "    OBBBBDBO    ",
      "   OBBBBDDBBO   ",
      "   OHHHHHHHHO   ",
      " OOOOOOOOOOOOOO ",
      " O            O ",
      "   OOOOOOOOOO   ",
      "  OMMMMMMMMMDO  ",
      "  O E MM E  DO  ",
      "  OMMMMMMMMMDO  ",
      "   OMOOOOOODO   ",
      "   ODDDDDDDDO   ",
      "    OOOOOOOO    ",
      "   OMMMMMMMDO   ",
      "  OMOODDDDOMOO  ",
      "  ODMODMMDOMDO  ",
      " OO  OOOOOO  OO ",
      "     OO  OO     ",
      "     OOO  OOO   ",
      "     OOO  OOO   ",
    ],
    // Frame 2 (Blink / Process)
    [
      "     OOOOOO     ",
      "    OBBBBDBO    ",
      "   OBBBBDDBBO   ",
      "   OHHHHHHHHO   ",
      " OOOOOOOOOOOOOO ",
      " O            O ",
      "   OOOOOOOOOO   ",
      "  OMMMMMMMMMDO  ",
      "  OM O MM O DO  ",
      "  OMMMMOOMMMDO  ",
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
    ],
    // Frame 3 (Scan Right)
    [
      "     OOOOOO     ",
      "    OBBBBDBO    ",
      "   OBBBBDDBBO   ",
      "   OHHHHHHHHO   ",
      " OOOOOOOOOOOOOO ",
      " O            O ",
      "   OOOOOOOOOO   ",
      "  OMMMMMMMMMDO  ",
      "  OM  E MM E O  ",
      "  OMMMMMMMMMDO  ",
      "   OMOOOOOODO   ",
      "   ODDDDDDDDO   ",
      "    OOOOOOOO    ",
      "   OMMMMMMMDO   ",
      "  OMOODDDDOMOO  ",
      "  ODMODMMDOMDO  ",
      "  OO OOOOOO OO  ",
      "     OO  OO     ",
      "   OOO  OOO     ",
      "   OOO  OOO     ",
    ],
    // Frame 4 (Waving)
    [
      "     OOOOOO     ",
      "    OBBBBDBO    ",
      "   OBBBBDDBBO  O",
      "   OHHHHHHHHO OM",
      " OOOOOOOOOOOOOOM",
      " O            OO",
      "   OOOOOOOOOO O ",
      "  OMMMMMMMMMDOO ",
      "  OM E MM E DO  ",
      "  OMMMMMMMMMDO  ",
      "   OMOOOOOODO   ",
      "   ODDDDDDDDO   ",
      "    OOOOOOOO    ",
      "   OMMMMMMMDO   ",
      "  OMOODDDDO     ",
      "  ODMODMMDO     ",
      "  OO OOOOOO     ",
      "     OO  OO     ",
      "    OOO  OOO    ",
      "    OOO  OOO    ",
    ],
    // Frame 5 (Namaste)
    [
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
      "   OMOOMMOODO   ",
      "   ODOMMMMODO   ",
      "    OMMMMMMO    ",
      "   OOMMMMMMOO   ",
      "    OOOMMOOO    ",
      "     OOOOOO     ",
      "     OOOOOO     ",
      "     OO  OO     ",
      "    OOO  OOO    ",
      "    OOO  OOO    ",
    ],
    // Frame 6 (Back Turned)
    [
      "     OOOOOO     ",
      "    OBBBBDBO    ",
      "   OBBBBDDBBO   ",
      "   OHHHHHHHHO   ",
      " OOOOOOOOOOOOOO ",
      " O            O ",
      "   OOOOOOOOOO   ",
      "  OMMMMMMMMMDO  ",
      "  OMMMMMMMMMDO  ",
      "  OMMMMMMMMMDO  ",
      "   OMOOOOOODO   ",
      "   ODDDDDDDDO   ",
      "    OOOOOOOO    ",
      "   OMMMMMMMDO   ",
      "  OMOODDDDOMOO  ",
      "  ODMODMMDOMDO  ",
      "  OO OOOOOO OO  ",
      "     OO  OO     ",
      "     OO  OO     ",
      "     OO  OO     ",
    ],
    // Frame 7 (Walk Sideways Left)
    [
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
      "    OOO  OO     ",
      "   OOOO   OO    ",
      "   OOOO   OO    ",
    ],
    // Frame 8 (Walk Sideways Right)
    [
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
      "     OO  OOO    ",
      "    OO   OOOO   ",
      "    OO   OOOO   ",
    ],
    // Frame 9 (Talking)
    [
      "     OOOOOO     ",
      "    OBBBBDBO    ",
      "   OBBBBDDBBO   ",
      "   OHHHHHHHHO   ",
      " OOOOOOOOOOOOOO ",
      " O            O ",
      "   OOOOOOOOOO   ",
      "  OMMMMMMMMMDO  ",
      "  OM E MM E DO  ",
      "  OMMMMOOMMMDO  ",
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
    ]
  ];

  const colorMap: Record<string, string> = {
    'O': '#0f172a',
    'B': '#334155',
    'H': '#06b6d4',
    'M': '#94a3b8',
    'D': '#64748b',
    'E': '#22d3ee',
  };

  const [frameIdx, setFrameIdx] = useState(0);
  const [posX, setPosX] = useState(0);
  const [currentMsg, setCurrentMsg] = useState<string | null>(null);
  const [typedMsg, setTypedMsg] = useState("");

  useEffect(() => {
    if (!currentMsg) {
      setTypedMsg("");
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      setTypedMsg(currentMsg.slice(0, i + 1));
      i++;
      if (i > currentMsg.length) clearInterval(interval);
    }, 60); // 60ms per character for slow reading
    
    return () => clearInterval(interval);
  }, [currentMsg]);

  useEffect(() => {
    const sequence = [
      { f: 0, x: 0, d: 2000 }, 
      
      // Moonwalk/Waddle Left (Total 800ms)
      { f: 7, x: -25, d: 150 },
      { f: 8, x: -25, d: 150 },
      { f: 7, x: -25, d: 150 },
      { f: 8, x: -25, d: 150 },
      { f: 0, x: -25, d: 200 }, 

      // Moonwalk/Waddle Right (Total 900ms)
      { f: 8, x: 25, d: 150 },
      { f: 7, x: 25, d: 150 },
      { f: 8, x: 25, d: 150 },
      { f: 7, x: 25, d: 150 },
      { f: 8, x: 25, d: 150 },
      { f: 0, x: 25, d: 150 }, 
      
      // Waddle Center (Total 800ms)
      { f: 7, x: 0, d: 150 },
      { f: 8, x: 0, d: 150 },
      { f: 7, x: 0, d: 150 },
      { f: 8, x: 0, d: 150 },
      { f: 0, x: 0, d: 200 },

      { f: 0, x: 0, d: 500 },
      { f: 4, msg: "Welcome!", x: 0, d: 2000 }, 
      { f: 0, x: 0, d: 1000 },
      { f: 5, msg: "Namaste", x: 0, d: 2000 },  
      { f: 0, x: 0, d: 1000 },
      
      // Talking Sequence (~6.5 seconds of flapping jaw)
      { f: 9, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 400 },
      { f: 0, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 300 },
      { f: 9, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 450 },
      { f: 0, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 250 },
      { f: 9, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 400 },
      { f: 0, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 300 },
      { f: 9, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 500 },
      { f: 0, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 200 },
      { f: 9, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 450 },
      { f: 0, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 250 },
      { f: 9, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 500 },
      { f: 0, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 300 },
      { f: 9, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 500 },
      { f: 0, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 200 },
      { f: 9, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 600 },
      { f: 0, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 300 },
      { f: 9, msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 400 },
      
      { f: 0, x: 0, d: 1000 },
      { f: 2, x: 0, d: 150 },   // Blink
      { f: 0, x: 0, d: 100 },
      { f: 2, x: 0, d: 150 },   // Blink
      { f: 0, x: 0, d: 2000 }
    ];
    
    let step = 0;
    let timeoutId: ReturnType<typeof setTimeout>;
    
    if (!animated) {
      setFrameIdx(0);
      setPosX(0);
      return;
    }

    const playNext = () => {
      setFrameIdx(sequence[step].f);
      setPosX(sequence[step].x);
      setCurrentMsg(sequence[step].msg || null);
      const delay = sequence[step].d;
      step = (step + 1) % sequence.length;
      timeoutId = setTimeout(playNext, delay);
    }
    
    timeoutId = setTimeout(playNext, sequence[0].d);

    return () => clearTimeout(timeoutId);
  }, [animated]);

  return (
    <div className="relative inline-flex items-center justify-center w-full h-full">
      <svg
        className={`${className} ${animated ? 'transition-transform duration-[800ms] ease-in-out' : ''} z-10`}
        style={{ transform: animated ? `translateX(${posX}px)` : 'none' }}
        viewBox="0 0 16 20"
        xmlns="http://www.w3.org/2000/svg"
        shapeRendering="crispEdges"
      >
        {FRAMES[frameIdx].map((row, y) =>
          row.split('').map((char, x) => {
            if (char === ' ') return null;
            return (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width="1.05"
                height="1.05"
                fill={colorMap[char]}
              />
            );
          })
        )}
      </svg>
      
      {typedMsg && (
        <div className="absolute top-1/2 left-1/2 sm:left-[-14rem] -translate-x-1/2 sm:-translate-x-full -translate-y-1/2 w-[80vw] max-w-[16rem] sm:w-[18rem] sm:max-w-[18rem] bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 text-[10px] sm:text-xs px-3.5 py-2.5 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 font-bold tracking-wide transition-opacity duration-300 z-50 whitespace-normal text-center leading-relaxed">
          {typedMsg}
        </div>
      )}
    </div>
  );
}
