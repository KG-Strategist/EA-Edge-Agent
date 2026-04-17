import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

export default function Logo({ 
  className = "w-10 h-10", 
  animated = true, 
  context = 'default' 
}: { 
  className?: string; 
  animated?: boolean; 
  context?: string 
}) {
  const [currentMsg, setCurrentMsg] = useState<string | null>(null);
  const [typedMsg, setTypedMsg] = useState("");
  const [animationState, setAnimationState] = useState("static");
  const [posX, setPosX] = useState(0);

  // Typing effect
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

  // Sequence logic
  useEffect(() => {
    if (!animated) {
      setAnimationState("static");
      setPosX(0);
      setCurrentMsg(null);
      return;
    }

    let sequence: any[] = [];

    const danceOnly = [
      { state: 'static', x: 0, d: 2000 }, 
      { state: 'dance', x: -25, d: 800 }, // Move left
      { state: 'dance', x: 25, d: 900 },  // Move right
      { state: 'dance', x: 0, d: 800 },   // Move center
      { state: 'static', x: 0, d: 500 }
    ];

    const talkSequence = [
      { state: 'dance', msg: "Welcome!", x: 0, d: 2000 }, 
      { state: 'static', x: 0, d: 1000 },
      { state: 'namaste', msg: "Namaste", x: 0, d: 2000 },  
      { state: 'static', x: 0, d: 1000 },
      { state: 'talk', msg: "My name is EA-NITI and I am here to help resolve enterprise challenges.", x: 0, d: 6500 },
      { state: 'static', x: 0, d: 1000 }
    ];

    if (context === 'MODE_SELECT') {
      sequence = [
        ...danceOnly,
        ...talkSequence,
        { state: 'static', x: 0, d: 1000 },
        { state: 'talk', msg: "Please select a configuration mode below to define your enterprise threat boundary.", x: 0, d: 6000 },
        { state: 'static', x: 0, d: 1000 },
        { state: 'talk', msg: "Hybrid Mode uses public SSO like Google or Microsoft. It's great for prototyping.", x: 0, d: 6000 },
        { state: 'static', x: 0, d: 1000 },
        { state: 'talk', msg: "Air-Gapped Mode keeps everything strictly local and offline for maximum security.", x: 0, d: 6000 },
        { state: 'static', x: 0, d: 1000 },
        { state: 'blink', x: 0, d: 300 },
        { state: 'static', x: 0, d: 1000000 }
      ];
    } else if (context === 'LOGIN') {
      sequence = [
        { state: 'static', x: 0, d: 1000 },
        { state: 'dance', msg: "Welcome back!", x: 0, d: 2000 },
        { state: 'static', x: 0, d: 1000000 }
      ];
    } else {
      sequence = [
        ...danceOnly,
        { state: 'blink', x: 0, d: 300 },
        { state: 'static', x: 0, d: 1000000 }
      ];
    }
    
    let step = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const playNext = () => {
      setAnimationState(sequence[step].state);
      setPosX(sequence[step].x);
      setCurrentMsg(sequence[step].msg || null);
      const delay = sequence[step].d;
      step = (step + 1) % sequence.length;
      timeoutId = setTimeout(playNext, delay);
    }
    
    playNext();

    return () => clearTimeout(timeoutId);
  }, [animated, context]);

  // Animation variants for the image
  const imageVariants = {
    static: { scale: 1, y: 0, rotate: 0 },
    dance: { scale: [1, 1.05, 1], y: [0, -4, 0], rotate: [0, 5, -5, 0], transition: { duration: 0.5, repeat: Infinity } },
    talk: { scale: [1, 1.02, 1], y: [0, -2, 0], transition: { duration: 0.3, repeat: Infinity } },
    namaste: { scale: 1, y: 0, rotate: 0 },
    blink: { scale: 1, y: 0, rotate: 0 }
  };

  const leftArmVariants = {
    static: { rotate: 0, x: 0, y: 0 },
    dance: { rotate: [0, -15, 0], transition: { repeat: Infinity, duration: 0.5 } },
    talk: { rotate: [0, -5, 0], transition: { repeat: Infinity, duration: 0.4 } },
    namaste: { rotate: -35, x: 5, y: -2 },
    blink: { rotate: 0, x: 0, y: 0 }
  };

  const rightArmVariants = {
    static: { rotate: 0, x: 0, y: 0 },
    dance: { rotate: [0, 15, 0], transition: { repeat: Infinity, duration: 0.5, delay: 0.2 } },
    talk: { rotate: [0, 5, 0], transition: { repeat: Infinity, duration: 0.4, delay: 0.2 } },
    namaste: { rotate: 35, x: -5, y: -2 },
    blink: { rotate: 0, x: 0, y: 0 }
  };

  const eyeVariants = {
    static: { scaleY: 1 },
    dance: { scaleY: [1, 0.8, 1], transition: { repeat: Infinity, duration: 0.5 } },
    talk: { scaleY: [1, 0.5, 1], transition: { repeat: Infinity, duration: 0.25 } },
    namaste: { scaleY: 0.2 },
    blink: { scaleY: [1, 0.1, 1], transition: { duration: 0.3 } }
  };

  const headVariants = {
    static: { y: 0, rotate: 0 },
    dance: { y: [0, -2, 0], rotate: [0, -5, 5, 0], transition: { repeat: Infinity, duration: 0.5 } },
    talk: { y: [0, -1, 0], transition: { repeat: Infinity, duration: 0.4 } },
    namaste: { y: 2, rotate: 0 },
    blink: { y: 0, rotate: 0 }
  };

  // Floating animation for the whole container to give it that "AI Agent" vibe
  const floatVariants = {
    animate: { y: [0, -4, 0], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } },
    static: { y: 0 }
  };

  return (
    <div 
      className={`relative inline-flex items-center justify-center w-full h-full ${animated ? 'transition-transform duration-[800ms] ease-in-out' : ''} z-20`}
      style={{ transform: animated ? `translate(${posX}px, 0px)` : 'none' }}
    >
      <motion.div
        className={`${className} z-10 drop-shadow-xl`}
        initial="static"
        animate={animated ? "animate" : "static"}
        variants={floatVariants}
      >
        <motion.div
          className="w-full h-full"
          initial="static"
          animate={animationState}
          variants={imageVariants}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-full h-full drop-shadow-lg" shapeRendering="crispEdges">
            {/* Legs */}
            <g>
              {/* Left Leg */}
              <rect x="11" y="25" width="3" height="3" fill="#64748b" />
              {/* Left Foot */}
              <rect x="9" y="28" width="6" height="3" rx="1" fill="#f59e0b" />
              <rect x="9" y="30" width="6" height="1" fill="#475569" />
              
              {/* Right Leg */}
              <rect x="18" y="25" width="3" height="3" fill="#64748b" />
              {/* Right Foot */}
              <rect x="17" y="28" width="6" height="3" rx="1" fill="#f59e0b" />
              <rect x="17" y="30" width="6" height="1" fill="#475569" />
            </g>

            {/* Body */}
            <g>
              {/* Main Body Orange */}
              <rect x="7" y="12" width="18" height="14" rx="6" fill="#f59e0b" />
              {/* Chest Plate Dark */}
              <rect x="10" y="14" width="12" height="4" rx="1" fill="#64748b" />
              {/* Chest Plate Details */}
              <rect x="11" y="15" width="2" height="2" fill="#94a3b8" />
              <rect x="14" y="15" width="1" height="2" fill="#94a3b8" />
              <rect x="16" y="15" width="1" height="2" fill="#94a3b8" />
              <rect x="19" y="15" width="2" height="2" fill="#94a3b8" />
              {/* Lower Chest Line */}
              <rect x="11" y="19" width="10" height="1" fill="#d97706" />
              <rect x="14" y="19" width="4" height="1" fill="#f59e0b" /> {/* gap in line */}
              {/* Cyan details */}
              <rect x="18" y="21" width="1" height="2" fill="#0ea5e9" />
              <rect x="20" y="21" width="1" height="2" fill="#0ea5e9" />
            </g>

            {/* Animated Left Arm */}
            <motion.g variants={leftArmVariants} style={{ transformOrigin: '6px 14px' }}>
              {/* Shoulder */}
              <rect x="3" y="13" width="5" height="4" rx="1" fill="#64748b" />
              {/* Upper Arm */}
              <rect x="2" y="17" width="4" height="4" fill="#f59e0b" />
              {/* Lower Arm */}
              <rect x="2" y="21" width="4" height="4" fill="#64748b" />
              {/* Hand/Claw */}
              <rect x="1" y="25" width="2" height="3" fill="#475569" />
              <rect x="5" y="25" width="2" height="3" fill="#475569" />
            </motion.g>

            {/* Animated Right Arm */}
            <motion.g variants={rightArmVariants} style={{ transformOrigin: '26px 14px' }}>
              {/* Shoulder */}
              <rect x="24" y="13" width="5" height="4" rx="1" fill="#64748b" />
              {/* Upper Arm */}
              <rect x="26" y="17" width="4" height="4" fill="#f59e0b" />
              {/* Lower Arm */}
              <rect x="26" y="21" width="4" height="4" fill="#64748b" />
              {/* Hand/Claw */}
              <rect x="25" y="25" width="2" height="3" fill="#475569" />
              <rect x="29" y="25" width="2" height="3" fill="#475569" />
            </motion.g>

            {/* Neck */}
            <g>
              <rect x="14" y="10" width="4" height="3" fill="#64748b" />
            </g>

            {/* Head */}
            <motion.g variants={headVariants} style={{ transformOrigin: '16px 6px' }}>
              {/* Outer Orange */}
              <rect x="8" y="2" width="16" height="10" rx="4" fill="#f59e0b" />
              {/* Inner White */}
              <rect x="9" y="3" width="14" height="8" rx="3" fill="#f8fafc" />
              {/* Screen */}
              <rect x="10" y="4" width="12" height="6" rx="2" fill="#0f172a" />
              {/* Eyes */}
              <motion.rect x="12" y="5" width="2" height="3" rx="0.5" fill="#0ea5e9" variants={eyeVariants} style={{ transformOrigin: '13px 6.5px' }} />
              <motion.rect x="18" y="5" width="2" height="3" rx="0.5" fill="#0ea5e9" variants={eyeVariants} style={{ transformOrigin: '19px 6.5px' }} />
            </motion.g>
          </svg>
        </motion.div>
      </motion.div>
      
      {typedMsg && (
        <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-[90vw] max-w-[16rem] sm:w-[18rem] sm:max-w-[18rem] bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 text-[10px] sm:text-xs px-3.5 py-2.5 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 font-bold tracking-wide transition-opacity duration-300 z-50 whitespace-normal text-center leading-relaxed">
          {typedMsg}
        </div>
      )}
    </div>
  );
}
