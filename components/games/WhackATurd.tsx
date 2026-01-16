import React, { useEffect, useRef, useState } from 'react';
import { gameService } from '../../services/supabaseClient';
import { playSound } from '../../utils/audio';

interface WhackATurdProps {
  onClose: () => void;
  userId?: string;
}

const GAME_DURATION = 30; // 30 Seconds
const FEVER_DURATION = 5000; // 5 seconds

interface Mole {
    id: number;
    type: 'TURD' | 'GOLDEN' | 'SOAP' | 'MEGA' | 'NINJA';
    active: boolean;
    hp?: number; // For Mega Turd
    hitAnim?: boolean; // For scaling animation on hit
}

interface FloatingText {
    id: number;
    x: number;
    y: number;
    text: string;
    color: string;
    life: number;
}

export const WhackATurd: React.FC<WhackATurdProps> = ({ onClose, userId }) => {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAME_OVER'>('START');
  const [isPaused, setIsPaused] = useState(false);
  const [grid, setGrid] = useState<Mole[]>(Array(9).fill({ id: 0, type: 'TURD', active: false }));
  const [highScore, setHighScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [screenShake, setScreenShake] = useState(0);
  const [screenFlash, setScreenFlash] = useState(false); 
  
  // FEVER MODE STATE
  const [feverValue, setFeverValue] = useState(0);
  const [isFeverMode, setIsFeverMode] = useState(false);
  
  const timerRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const loopRef = useRef<number>(0);
  const feverTimeoutRef = useRef<number>(0);
  
  // Ref for time left to access in spawn loop without dependency issues
  const timeLeftRef = useRef(GAME_DURATION);
  const isFeverRef = useRef(false);

  useEffect(() => {
    if (userId) {
      gameService.getHighScore(userId, 'whack_turd').then(setHighScore);
    }
  }, [userId]);

  const startGame = () => {
    playSound('SCORE');
    setScore(0);
    setTimeLeft(GAME_DURATION);
    timeLeftRef.current = GAME_DURATION;
    setGameState('PLAYING');
    setCombo(0);
    setGrid(Array(9).fill({ id: 0, type: 'TURD', active: false }));
    setFloatingTexts([]);
    setFeverValue(0);
    setIsFeverMode(false);
    isFeverRef.current = false;
  };

  // Visual Loop
  useEffect(() => {
      const loop = () => {
          if (screenShake > 0) setScreenShake(s => Math.max(0, s - 1));
          
          setFloatingTexts(prev => 
              prev.map(t => ({...t, y: t.y - 1, life: t.life - 0.05}))
                  .filter(t => t.life > 0)
          );
          loopRef.current = requestAnimationFrame(loop);
      }
      loopRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(loopRef.current);
  }, [screenShake]);

  const triggerFever = () => {
      setIsFeverMode(true);
      isFeverRef.current = true;
      playSound('EXPLOSION'); // Sound effect start
      setScreenShake(20);
      
      feverTimeoutRef.current = window.setTimeout(() => {
          setIsFeverMode(false);
          isFeverRef.current = false;
          setFeverValue(0);
      }, FEVER_DURATION);
  };

  // Main Logic Loop (Timer + Spawner)
  useEffect(() => {
    if (gameState === 'PLAYING' && !isPaused) {
      
      // 1. Independent Timer
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          const next = prev - 1;
          timeLeftRef.current = next;
          if (next <= 0) {
            endGame();
            return 0;
          }
          return next;
        });
      }, 1000);

      // 2. Recursive Spawn Loop
      const spawnLoop = () => {
          if (timeLeftRef.current <= 0) return;

          spawnMole();
          
          let nextSpawnTime = 0;

          if (isFeverRef.current) {
              // CHAOS MODE
              nextSpawnTime = 120; // Extremely fast
          } else {
              // DYNAMIC DIFFICULTY
              const timeFactor = (GAME_DURATION - timeLeftRef.current) * 10; 
              nextSpawnTime = Math.max(300, 750 - (score * 3) - timeFactor); 
          }
          
          spawnTimerRef.current = window.setTimeout(spawnLoop, nextSpawnTime);
      }
      spawnLoop();
    }

    return () => {
      clearInterval(timerRef.current);
      clearTimeout(spawnTimerRef.current);
      clearTimeout(feverTimeoutRef.current);
    };
  }, [gameState, isPaused]); 

  const endGame = () => {
    playSound('CRASH');
    setGameState('GAME_OVER');
    setIsFeverMode(false);
    clearInterval(timerRef.current);
    clearTimeout(spawnTimerRef.current);
    if (userId && score > 0) {
        gameService.saveScore(userId, 'whack_turd', score);
        if (score > highScore) setHighScore(score);
    }
  };

  const spawnMole = () => {
      setGrid(prev => {
          const newGrid = [...prev];
          const availableIndices = newGrid.map((m, i) => !m.active ? i : -1).filter(i => i !== -1);
          
          if (availableIndices.length > 0) {
              const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
              
              const rand = Math.random();
              let type: 'TURD' | 'GOLDEN' | 'SOAP' | 'MEGA' | 'NINJA' = 'TURD';
              let hp = 1;

              if (isFeverRef.current) {
                  // FEVER POOL: Mostly Gold and Turds, No Soap, No Mega (too slow)
                  if (rand > 0.7) type = 'GOLDEN';
                  else type = 'TURD';
              } else {
                  // NORMAL POOL
                  if (rand > 0.95) {
                      type = 'MEGA'; 
                      hp = 3; 
                  } else if (rand > 0.90) {
                      type = 'NINJA'; // New rare enemy
                  } else if (rand > 0.82) {
                      type = 'GOLDEN'; 
                  } else if (rand > 0.60) { 
                      type = 'SOAP'; 
                  }
              }

              newGrid[randomIndex] = {
                  id: Date.now() + Math.random(),
                  type,
                  active: true,
                  hp
              };

              // Auto-hide logic
              let stayDuration = 0;
              
              if (type === 'MEGA') stayDuration = 4000;
              else if (type === 'NINJA') stayDuration = 800; // Increased to 800ms
              else stayDuration = Math.max(550, 1300 - (score * 12));
              
              if (isFeverRef.current) stayDuration = 600; // Fast popups in fever
              if (type === 'SOAP') stayDuration += 300;

              setTimeout(() => {
                  setGrid(g => {
                      const g2 = [...g];
                      if (g2[randomIndex] && g2[randomIndex].id === newGrid[randomIndex].id) { 
                          if (g2[randomIndex].type === 'MEGA' && (g2[randomIndex].hp || 0) <= 0) {
                             return g2;
                          }
                          g2[randomIndex] = { ...g2[randomIndex], active: false };
                      }
                      return g2;
                  });
              }, stayDuration);
          }
          return newGrid;
      });
  };

  const addText = (index: number, text: string, color: string) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      setFloatingTexts(prev => [...prev, {
          id: Math.random(),
          x: (col - 1) * 60, 
          y: (row - 1) * 60,
          text,
          color,
          life: 1.0
      }]);
  };

  const handleWhack = (index: number) => {
      setGrid(prevGrid => {
        const mole = prevGrid[index];
        if (!mole.active) return prevGrid;

        const newGrid = [...prevGrid];

        if (mole.type === 'SOAP') {
            playSound('BAD');
            setScore(s => Math.max(0, s - 1)); // Penalty reduced to -1
            setCombo(0);
            setFeverValue(val => Math.max(0, val - 10)); // Less fever penalty
            setScreenShake(5);
            setScreenFlash(true);
            setTimeout(() => setScreenFlash(false), 200);
            addText(index, "-1", "red");
            newGrid[index] = { ...mole, active: false };
        } else if (mole.type === 'MEGA') {
             const m = {...mole};
             m.hp = (m.hp || 0) - 1;
             m.hitAnim = true; 

             if (m.hp === 0) {
                  playSound('EXPLOSION');
                  setScore(s => s + 100);
                  setFeverValue(val => Math.min(100, val + 25));
                  setScreenShake(20);
                  addText(index, "BROKEN!", "#FF00FF");
                  
                  setTimeout(() => {
                      setGrid(g => {
                          const g2 = [...g];
                          if(g2[index] && g2[index].id === m.id) g2[index].active = false;
                          return g2;
                      });
                  }, 1000); 

              } else if (m.hp < 0) {
                  playSound('SCORE');
                  setScore(s => s + 20);
                  setScreenShake(5);
                  addText(index, "+20", "#FFFF00");
              } else {
                  playSound('WHACK');
                  addText(index, `${m.hp}`, "white");
                  setScreenShake(5);
              }
              
              newGrid[index] = m;
              
              setTimeout(() => {
                  setGrid(g => {
                      const g2 = [...g];
                      if(g2[index]) g2[index].hitAnim = false;
                      return g2;
                  })
              }, 100);

        } else {
             playSound('WHACK');
             let points = 1;
             if (mole.type === 'GOLDEN') points = 5;
             if (mole.type === 'NINJA') points = 20;

             if (isFeverMode) points *= 2; // Double points in fever

             setCombo(c => {
                 const newCombo = c + 1;
                 const bonus = Math.floor(newCombo / 5);
                 setScore(s => s + points + bonus);
                 
                 let color = "#FFF";
                 if (mole.type === 'GOLDEN') color = "#FFD700";
                 if (mole.type === 'NINJA') color = "#000";
                 if (isFeverMode) color = "#FF4500";

                 addText(index, `+${points + bonus}`, color);
                 return newCombo;
             });

             // Increase Fever
             if (!isFeverMode) {
                 setFeverValue(val => {
                     const gain = mole.type === 'GOLDEN' ? 10 : (mole.type === 'NINJA' ? 20 : 5);
                     const next = val + gain;
                     if (next >= 100) triggerFever();
                     return Math.min(100, next);
                 });
             }
             
             setScreenShake(isFeverMode ? 5 : 2);
             newGrid[index] = { ...mole, active: false };
        }
        return newGrid;
      });
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div 
        className={`bg-brand-cream rounded-2xl w-full max-w-md border-4 border-black relative overflow-hidden flex flex-col p-4 shadow-2xl transition-transform transition-colors duration-300 ${isFeverMode ? 'bg-yellow-100' : ''}`}
        style={{ transform: `translate(${Math.random() * screenShake - screenShake/2}px, ${Math.random() * screenShake - screenShake/2}px)` }}
      >
         <div className="absolute top-2 right-2 flex gap-2 z-30">
           {gameState === 'PLAYING' && (
             <button onClick={() => setIsPaused(!isPaused)} className="bg-yellow-500 text-white rounded-full p-2 border-2 border-black font-bold w-8 h-8 flex items-center justify-center">
               {isPaused ? '▶' : '⏸'}
             </button>
           )}
           <button onClick={onClose} className="bg-red-500 text-white rounded-full p-2 border-2 border-black font-bold w-8 h-8 flex items-center justify-center">X</button>
         </div>
         
         {screenFlash && <div className="absolute inset-0 bg-red-500/30 z-20 pointer-events-none"></div>}

         {/* FEVER BAR */}
         <div className="absolute top-0 left-0 w-full h-2 bg-gray-200 z-20">
             <div 
                className={`h-full transition-all duration-200 ${isFeverMode ? 'bg-gradient-to-r from-red-500 via-yellow-400 to-red-500 animate-pulse' : 'bg-orange-400'}`}
                style={{ width: `${isFeverMode ? 100 : feverValue}%` }}
             ></div>
         </div>

         <div className="text-center mb-4 mt-2">
             <div className="flex justify-between items-end px-2 mt-2">
                 <div className="text-left">
                     <div className="text-xs font-bold text-gray-500">SCORE</div>
                     <div className={`text-4xl font-black ${isFeverMode ? 'text-red-600 animate-bounce' : 'text-brand-blue'}`}>{score}</div>
                 </div>
                 {isFeverMode && <div className="text-xl font-black text-orange-500 animate-pulse">🔥 FEVER 🔥</div>}
                 <div className="text-center">
                      <div className="text-xs font-bold text-gray-500">TIME</div>
                      <div className={`text-2xl font-black ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-gray-800'}`}>{timeLeft}s</div>
                 </div>
             </div>
         </div>

         <div 
            className={`grid grid-cols-3 gap-3 p-4 rounded-xl border-4 relative min-h-[300px] touch-manipulation transition-colors duration-300 ${isFeverMode ? 'bg-orange-300 border-orange-500' : 'bg-[#8B4513] border-[#5D4037]'}`}
            style={{
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTapHighlightColor: 'transparent'
            }}
            onContextMenu={(e) => e.preventDefault()}
            onSelectStart={(e) => e.preventDefault()}
         >
             
             <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                 {floatingTexts.map(t => (
                     <div 
                        key={t.id} 
                        className="absolute font-black text-2xl drop-shadow-md" 
                        style={{ 
                            transform: `translate(${t.x}px, ${t.y}px) scale(${1 + (1-t.life)})`, 
                            color: t.color,
                            opacity: t.life 
                        }}
                     >
                         {t.text}
                     </div>
                 ))}
             </div>

             {grid.map((mole, i) => (
                 <div 
                    key={i} 
                    className={`aspect-square rounded-full relative overflow-hidden shadow-inner cursor-pointer active:scale-95 transition-transform touch-none select-none ${isFeverMode ? 'bg-orange-800' : 'bg-[#3e2723]'}`}
                    onPointerDown={(e) => { e.preventDefault(); handleWhack(i); }}
                 >
                     <div className="absolute inset-0 bg-black/30 rounded-full scale-90"></div>
                     
                     <div className={`absolute inset-0 flex items-center justify-center transition-all duration-100 ease-out select-none pointer-events-none
                         ${mole.active ? 'translate-y-0' : 'translate-y-full'}
                         ${mole.hitAnim ? 'scale-90 brightness-150' : 'scale-100'}
                     `}>
                         <div className="text-5xl drop-shadow-lg">
                            {mole.type === 'TURD' && '💩'}
                            {mole.type === 'GOLDEN' && '✨'}
                            {mole.type === 'SOAP' && '🧼'}
                            {mole.type === 'NINJA' && '🥷'}
                            {mole.type === 'MEGA' && (
                                <div className="relative">
                                    <span className="text-6xl">{mole.hp! <= 0 ? '💥' : '👺'}</span>
                                    {mole.hp! > 0 && (
                                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-red-600 h-2 w-full rounded-full border border-black">
                                            <div className="bg-green-400 h-full transition-all" style={{width: `${(mole.hp! / 3) * 100}%`}}></div>
                                        </div>
                                    )}
                                </div>
                            )}
                         </div>
                     </div>
                 </div>
             ))}
         </div>

         <div className="mt-4 text-center">
            {gameState === 'START' && (
                <button onClick={startGame} className="bg-brand-yellow border-2 border-black px-8 py-3 rounded-xl font-black text-xl animate-bounce">START WHACKING</button>
            )}
            {gameState === 'GAME_OVER' && (
                <div className="animate-bounce">
                    <div className="text-2xl font-black mb-2">TIME'S UP!</div>
                    <button onClick={startGame} className="bg-brand-green border-2 border-black px-8 py-3 rounded-xl font-black text-xl">PLAY AGAIN</button>
                </div>
            )}
            {gameState === 'PLAYING' && (
                <div className="flex justify-center gap-4 text-xs font-bold text-gray-500 mt-2">
                    <span className="flex items-center gap-1">🧼 <span className="text-red-500">-1</span></span>
                    <span className="flex items-center gap-1">🥷 <span className="text-brand-blue">+20</span></span>
                    <span className="flex items-center gap-1">🔥 <span className="text-orange-500">Fill Bar!</span></span>
                </div>
            )}
         </div>
      </div>
    </div>
  );
};