import React, { useEffect, useRef, useState } from 'react';
import { gameService } from '../../services/supabaseClient';
import { playSound } from '../../utils/audio';

interface SpeedRollProps {
  onClose: () => void;
  userId?: string;
}

const TOTAL_SHEETS = 500; // Total game length
const FRICTION = 0.96;

export const SpeedRoll: React.FC<SpeedRollProps> = ({ onClose, userId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'WIN'>('START');
  const [isPaused, setIsPaused] = useState(false);
  const [sheetsLeft, setSheetsLeft] = useState(TOTAL_SHEETS);
  const [timeTaken, setTimeTaken] = useState(0);
  const [highScore, setHighScore] = useState(0); 
  const [isOnFire, setIsOnFire] = useState(false); // Visual flare
  
  // Physics Refs
  const rotationRef = useRef(0);
  const angularVelRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastDragY = useRef<number | null>(null);
  const sheetsRef = useRef(TOTAL_SHEETS); // for sync update
  
  const rafRef = useRef(0);

  useEffect(() => {
    if (userId) {
        gameService.getHighScore(userId, 'speed_roll').then(val => setHighScore(val));
    }
  }, [userId]);

  const startGame = () => {
      setGameState('PLAYING');
      setSheetsLeft(TOTAL_SHEETS);
      sheetsRef.current = TOTAL_SHEETS;
      setTimeTaken(0);
      startTimeRef.current = Date.now();
      angularVelRef.current = 0;
      rotationRef.current = 0;
      setIsOnFire(false);
      playSound('SCORE');
  };

  const handleInputStart = (y: number) => {
      if (gameState !== 'PLAYING') return;
      lastDragY.current = y;
  };

  const handleInputMove = (y: number) => {
      if (gameState !== 'PLAYING' || lastDragY.current === null) return;
      
      const delta = y - lastDragY.current;
      lastDragY.current = y;

      if (delta > 0) { // Pulling down
          // Add velocity based on drag speed
          angularVelRef.current += delta * 0.02;
          playSound('ROLL');
      }
  };

  const handleInputEnd = () => {
      lastDragY.current = null;
  };

  const endGame = (endTime: number) => {
      const duration = (endTime - startTimeRef.current) / 1000;
      setGameState('WIN');
      playSound('SCORE');
      
      const scoreMs = Math.floor(duration * 1000);
      
      if (userId) {
          if (highScore === 0 || scoreMs < highScore) {
              setHighScore(scoreMs);
              gameService.saveScore(userId, 'speed_roll', scoreMs);
          }
      }
  };

  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const loop = () => {
          if (gameState === 'PLAYING' && !isPaused) {
              const now = Date.now();
              setTimeTaken((now - startTimeRef.current) / 1000);

              // Physics
              rotationRef.current += angularVelRef.current;
              angularVelRef.current *= FRICTION; // Inertia

              // Unroll logic
              // 1 full rotation = approx 5 sheets? Let's say speed determines sheet reduction rate directly
              if (angularVelRef.current > 0.01) {
                  const removeAmount = angularVelRef.current * 0.5;
                  sheetsRef.current = Math.max(0, sheetsRef.current - removeAmount);
                  setSheetsLeft(Math.floor(sheetsRef.current));
                  
                  if (sheetsRef.current <= 0) {
                      endGame(now);
                      return; // Stop loop
                  }
              }

              // Fire Logic
              if (angularVelRef.current > 1.5 && !isOnFire) setIsOnFire(true);
              if (angularVelRef.current < 1.0 && isOnFire) setIsOnFire(false);
          }

          draw(ctx);
          rafRef.current = requestAnimationFrame(loop);
      };

      const draw = (ctx: CanvasRenderingContext2D) => {
          const w = canvas.width;
          const h = canvas.height;
          const cx = w / 2;
          const cy = 150;

          ctx.clearRect(0, 0, w, h);

          // Draw Holder
          ctx.fillStyle = '#C0C0C0';
          ctx.fillRect(cx - 100, cy - 20, 200, 20); // Top bar
          ctx.fillRect(cx - 100, cy - 20, 10, 100); // Left arm
          ctx.fillRect(cx + 90, cy - 20, 10, 100); // Right arm

          // Calculate Roll Radius based on sheets left
          // Start radius 70, End radius 20 (cardboard core)
          const progress = sheetsRef.current / TOTAL_SHEETS;
          const radius = 25 + (progress * 55); 

          ctx.save();
          ctx.translate(cx, cy + 60);
          
          // Rotate the roll
          ctx.rotate(rotationRef.current);

          // Draw Roll (Side view circle) - Actually front view is better for scrolling
          // Let's do a front view of the roll spinning
          
          // Cardboard Core
          ctx.fillStyle = '#8B4513';
          ctx.beginPath();
          ctx.arc(0, 0, 20, 0, Math.PI * 2);
          ctx.fill();

          // Paper body
          ctx.fillStyle = '#FFF';
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2); // Outer paper
          ctx.arc(0, 0, 20, 0, Math.PI * 2, true); // Hole
          ctx.fill();
          ctx.strokeStyle = '#DDD';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, radius - 5, 0, Math.PI * 2);
          ctx.stroke();

          // Texture lines to show spinning
          for(let i=0; i<4; i++) {
              ctx.beginPath();
              ctx.moveTo(20, 0);
              ctx.lineTo(radius, 0);
              ctx.stroke();
              ctx.rotate(Math.PI / 2);
          }

          ctx.restore();

          // Draw Flying Paper Sheet
          // It originates from the bottom of the roll
          const paperY = cy + 60 + radius;
          
          if (angularVelRef.current > 0.1) {
              const speed = angularVelRef.current;
              ctx.fillStyle = '#FFF';
              ctx.strokeStyle = '#EEE';
              
              // Waving paper simulation
              ctx.beginPath();
              ctx.moveTo(cx - 60, paperY); // Roll width approx
              ctx.lineTo(cx + 60, paperY);
              
              // Bottom points (waving)
              const length = Math.min(300, speed * 100 + 50);
              const waveOffset = Math.sin(Date.now() / 20) * (speed * 10);
              
              ctx.lineTo(cx + 60 + waveOffset, paperY + length);
              ctx.lineTo(cx - 60 + waveOffset, paperY + length);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();

              // Perforations
              ctx.beginPath();
              ctx.setLineDash([5, 5]);
              ctx.moveTo(cx - 60 + (waveOffset/2), paperY + length/2);
              ctx.lineTo(cx + 60 + (waveOffset/2), paperY + length/2);
              ctx.stroke();
              ctx.setLineDash([]);
          }

          // FIRE EFFECT
          if (angularVelRef.current > 1.2) {
              const fireScale = Math.min(2, angularVelRef.current - 1);
              ctx.font = `${30 * fireScale}px Arial`;
              ctx.fillText('🔥', cx - 80 + Math.random()*10, cy + 50 + Math.random()*10);
              ctx.fillText('🔥', cx + 50 + Math.random()*10, cy + 50 + Math.random()*10);
              
              // Shake screen slightly
              ctx.translate((Math.random()-0.5)*5, (Math.random()-0.5)*5);
          }
          
          if (sheetsRef.current <= 0) {
              // Empty roll core
              ctx.fillStyle = '#8B4513';
              ctx.fillRect(cx - 60, cy + 60 - 20, 120, 40);
          }
      };

      rafRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafRef.current);
  }, [gameState]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-brand-cream rounded-2xl w-full max-w-sm border-4 border-black relative overflow-hidden flex flex-col items-center p-6 h-[80vh]">
         <div className="absolute top-2 right-2 flex gap-2 z-30">
           {gameState === 'PLAYING' && (
             <button onClick={() => setIsPaused(!isPaused)} className="bg-yellow-500 text-white rounded-full p-2 border-2 border-black font-bold">
               {isPaused ? '▶' : '⏸'}
             </button>
           )}
           <button onClick={onClose} className="bg-red-500 text-white rounded-full p-2 border-2 border-black font-bold">X</button>
         </div>

         <h2 className="text-3xl font-black text-brand-brown mb-2">Speed Roll</h2>
         
         {/* Stats */}
         <div className="flex justify-between w-full mb-4 font-bold text-gray-600 z-10">
             <div>
                 <div className="text-xs uppercase">Sheets Left</div>
                 <div className="text-3xl text-black">{sheetsLeft}</div>
             </div>
             <div className="text-right">
                 <div className="text-xs uppercase">Time</div>
                 <div className={`text-3xl ${isOnFire ? 'text-red-500 animate-pulse' : 'text-brand-blue'}`}>{timeTaken.toFixed(2)}s</div>
                 <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                     BEST: {highScore > 0 ? (highScore/1000).toFixed(3) : '-'}s
                 </div>
             </div>
         </div>

         {/* Game Area */}
         <div 
            className="flex-1 w-full flex flex-col items-center justify-start relative touch-none select-none bg-white/50 rounded-xl border-2 border-black/10"
            style={{
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTapHighlightColor: 'transparent'
            }}
            onTouchStart={(e) => handleInputStart(e.touches[0].clientY)}
            onTouchMove={(e) => handleInputMove(e.touches[0].clientY)}
            onTouchEnd={handleInputEnd}
            onMouseDown={(e) => handleInputStart(e.clientY)}
            onMouseMove={(e) => e.buttons === 1 && handleInputMove(e.clientY)}
            onMouseUp={handleInputEnd}
            onMouseLeave={handleInputEnd}
            onContextMenu={(e) => e.preventDefault()}
            onSelectStart={(e) => e.preventDefault()}
         >
             <canvas ref={canvasRef} width={300} height={500} className="w-full h-full block" />

             {gameState === 'START' && (
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                     <div className="text-6xl animate-bounce mb-4">👇</div>
                     <div className="font-black text-2xl text-brand-brown">SWIPE DOWN FAST!</div>
                     <button onClick={startGame} className="mt-6 pointer-events-auto bg-brand-yellow px-8 py-4 rounded-xl border-2 border-black font-bold text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:scale-105 transition-transform">
                         Start Unrolling
                     </button>
                 </div>
             )}

             {gameState === 'WIN' && (
                 <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                     <div className="text-6xl mb-4">🧻🔥</div>
                     <div className="font-black text-3xl text-brand-blue mb-2">EMPTY ROLL!</div>
                     <div className="text-4xl font-black mb-6 border-b-4 border-brand-yellow px-4">{timeTaken.toFixed(3)}s</div>
                     
                     {highScore > 0 && (
                        <div className="text-sm font-bold text-gray-500 mb-6 bg-gray-100 px-4 py-2 rounded-full">
                            Record: {(highScore/1000).toFixed(3)}s
                        </div>
                     )}

                     <button onClick={startGame} className="bg-brand-green px-8 py-4 rounded-xl border-2 border-black font-black text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1 transition-all">
                         ROLL AGAIN
                     </button>
                 </div>
             )}
         </div>
      </div>
    </div>
  );
};