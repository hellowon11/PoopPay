import React, { useEffect, useRef, useState } from 'react';
import { gameService } from '../../services/supabaseClient';
import { playSound } from '../../utils/audio';

interface FlappyPoopProps {
  onClose: () => void;
  userId?: string;
}

export const FlappyPoop: React.FC<FlappyPoopProps> = ({ onClose, userId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAME_OVER'>('START');
  const [isPaused, setIsPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // Game Constants
  const GRAVITY = 0.6;
  const JUMP = -8;
  const INITIAL_PIPE_SPEED = 3;
  const MAX_PIPE_SPEED = 8;
  const PIPE_SPAWN_RATE_BASE = 100;

  // Game Refs
  const birdY = useRef(200);
  const velocity = useRef(0);
  const pipes = useRef<{x: number, topHeight: number, passed: boolean}[]>([]);
  const frameId = useRef(0);
  const frameCount = useRef(0);

  // Load High Score
  useEffect(() => {
    if (userId) {
      gameService.getHighScore(userId, 'flappy_turd').then(setHighScore);
    }
  }, [userId]);

  // Handle Game Over & Score Saving
  useEffect(() => {
    if (gameState === 'GAME_OVER') {
      playSound('CRASH');
      if (score > highScore) {
        setHighScore(score);
        setIsNewRecord(true);
        if (userId) {
          gameService.saveScore(userId, 'flappy_turd', score);
        }
      } else if (score > 0 && userId) {
        gameService.saveScore(userId, 'flappy_turd', score);
      }
    } else if (gameState === 'START') {
      setIsNewRecord(false);
    }
  }, [gameState, score, userId]);

  const startGame = () => {
    birdY.current = 200;
    velocity.current = 0;
    pipes.current = [];
    frameCount.current = 0;
    setScore(0);
    setGameState('PLAYING');
    playSound('JUMP');
  };

  const lastJumpTime = useRef(0);
  const JUMP_COOLDOWN = 100; // Minimum 100ms between jumps for mobile

  const jump = () => {
    const now = Date.now();
    
    // If paused, resume game on tap
    if (isPaused) {
      setIsPaused(false);
      return;
    }
    
    // Prevent too frequent jumps on mobile
    if (gameState === 'PLAYING' && now - lastJumpTime.current < JUMP_COOLDOWN) {
      return;
    }
    lastJumpTime.current = now;

    if (gameState === 'PLAYING') {
      velocity.current = JUMP;
      playSound('JUMP');
    } else if (gameState === 'START' || gameState === 'GAME_OVER') {
      startGame();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = () => {
      if (gameState !== 'PLAYING' || isPaused) return;

      // --- DYNAMIC DIFFICULTY ---
      // Speed increases by 0.2 for every point, capped at MAX_PIPE_SPEED
      const currentSpeed = Math.min(MAX_PIPE_SPEED, INITIAL_PIPE_SPEED + (score * 0.15));
      
      const currentSpawnRate = Math.max(60, PIPE_SPAWN_RATE_BASE - (score * 2));

      // Update Physics
      velocity.current += GRAVITY;
      birdY.current += velocity.current;
      frameCount.current++;

      // Spawn Pipes
      if (frameCount.current % currentSpawnRate === 0) {
        const minHeight = 50;
        const gap = 160; 
        const topHeight = Math.random() * (canvas.height - gap - minHeight * 2) + minHeight;
        pipes.current.push({ x: canvas.width, topHeight, passed: false });
      }

      // Move Pipes & Collision
      pipes.current.forEach(pipe => {
        pipe.x -= currentSpeed;
        
        // Bird dimensions approx 30x30
        const birdLeft = 50;
        const birdRight = 80;
        const birdTop = birdY.current;
        const birdBottom = birdY.current + 30;

        const pipeLeft = pipe.x;
        const pipeRight = pipe.x + 50;
        const topPipeBottom = pipe.topHeight;
        const bottomPipeTop = pipe.topHeight + 160; // matches gap

        // Collision Check - give a little hitbox leniency (4px buffer)
        const buffer = 4;
        if (
          birdRight - buffer > pipeLeft && 
          birdLeft + buffer < pipeRight && 
          (birdTop + buffer < topPipeBottom || birdBottom - buffer > bottomPipeTop)
        ) {
          setGameState('GAME_OVER');
        }

        // Score update
        if (!pipe.passed && birdLeft > pipeRight) {
            setScore(prev => prev + 1);
            playSound('SCORE');
            pipe.passed = true;
        }
      });

      // Floor/Ceiling Collision
      if (birdY.current + 30 > canvas.height || birdY.current < 0) {
        setGameState('GAME_OVER');
      }

      // Cleanup off-screen pipes
      if (pipes.current.length > 0 && pipes.current[0].x < -60) {
        pipes.current.shift();
      }

      // DRAW
      // Background
      ctx.fillStyle = '#87CEEB';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Pipes
      ctx.fillStyle = '#228B22';
      pipes.current.forEach(pipe => {
        // Top Pipe
        ctx.fillRect(pipe.x, 0, 50, pipe.topHeight);
        // Bottom Pipe
        ctx.fillRect(pipe.x, pipe.topHeight + 160, 50, canvas.height - (pipe.topHeight + 160));
        // Pipe Borders
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(pipe.x, 0, 50, pipe.topHeight);
        ctx.strokeRect(pipe.x, pipe.topHeight + 160, 50, canvas.height - (pipe.topHeight + 160));
      });

      // Bird (Poop Emoji)
      ctx.font = '30px Arial';
      ctx.fillText('💩', 50, birdY.current + 30);

      // Speed Indicator
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '12px Arial';
      ctx.fillText(`Speed: ${currentSpeed.toFixed(1)}`, 10, 20);

      // Floor
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(0, canvas.height - 20, canvas.width, 20);

      frameId.current = requestAnimationFrame(loop);
    };

    if (gameState === 'PLAYING' && !isPaused) {
      frameId.current = requestAnimationFrame(loop);
    } else {
      if (frameId.current) cancelAnimationFrame(frameId.current);
    }

    return () => {
      if (frameId.current) cancelAnimationFrame(frameId.current);
    };
  }, [gameState, score, isPaused]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-4 w-full max-w-sm border-4 border-black relative">
        <div className="absolute -top-4 right-0 flex gap-2 z-10">
          {gameState === 'PLAYING' && (
            <button onClick={() => setIsPaused(!isPaused)} className="bg-yellow-500 text-white rounded-full p-2 border-2 border-black font-bold">
              {isPaused ? '▶' : '⏸'}
            </button>
          )}
          <button onClick={onClose} className="bg-red-500 text-white rounded-full p-2 border-2 border-black font-bold">X</button>
        </div>
        
        <div className="flex justify-between items-end mb-2">
            <div>
                 <h2 className="font-black text-2xl text-brand-brown leading-none">Flappy Turd</h2>
            </div>
            <div className="text-right">
                <div className="text-xs font-bold text-gray-400 uppercase">Best</div>
                <div className="font-black text-xl leading-none">{highScore}</div>
            </div>
        </div>

        <div className="text-center font-bold text-4xl mb-2 text-brand-blue">{score}</div>
        
        <div 
            className="relative border-4 border-black rounded-lg overflow-hidden bg-brand-blue" 
            style={{ 
                height: '400px',
                touchAction: 'none',
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent'
            }} 
            onClick={jump}
            onContextMenu={(e) => e.preventDefault()}
            onSelectStart={(e) => e.preventDefault()}
        >
            <canvas 
                ref={canvasRef} 
                width={300} 
                height={400} 
                className="w-full h-full block"
            />
            {gameState !== 'PLAYING' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                    <div className="bg-white p-4 rounded-xl border-4 border-black text-center animate-bounce">
                        {isNewRecord && <div className="text-xs font-bold text-yellow-500 mb-1 animate-pulse">NEW RECORD!</div>}
                        <div className="text-4xl mb-2">{isNewRecord ? '🏆' : '👆'}</div>
                        <div className="font-black text-xl">
                            {gameState === 'START' ? 'TAP TO START' : 'GAME OVER'}
                        </div>
                        {gameState === 'GAME_OVER' && <div className="text-sm">Tap to Restart</div>}
                    </div>
                </div>
            )}
        </div>
        <p className="text-center text-xs text-gray-500 mt-2">Tap/Click inside the box to jump</p>
      </div>
    </div>
  );
};