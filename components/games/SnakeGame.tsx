import React, { useEffect, useRef, useState, useCallback } from 'react';
import { gameService } from '../../services/supabaseClient';
import { playSound } from '../../utils/audio';

interface SnakeGameProps {
  onClose: () => void;
  userId?: string;
}

const GRID_SIZE = 20;
const INITIAL_SPEED = 130; // Slightly faster base speed
const CHILI_SPEED = 60; // Super fast

// Main food stays on screen until eaten
type MainFoodType = 'FOOD' | 'GOLDEN_ROLL';
// Bonus items appear temporarily
type BonusType = 'BAD_BURRITO' | 'CHILI';

interface BonusItem {
    id: number;
    x: number;
    y: number;
    type: BonusType;
    expires: number;
}

type GameMode = 'MENU' | 'CLASSIC' | 'SURVIVAL';

export const SnakeGame: React.FC<SnakeGameProps> = ({ onClose, userId }) => {
  const [mode, setMode] = useState<GameMode>('MENU');
  const [isPaused, setIsPaused] = useState(false);
  
  const [snake, setSnake] = useState<{x: number, y: number}[]>([{x: 10, y: 10}]);
  
  // Game Items
  const [food, setFood] = useState<{x: number, y: number, type: MainFoodType}>({x: 15, y: 5, type: 'FOOD'});
  
  // Simultaneous Bonus Items (Burrito & Chili)
  const [bonusItems, setBonusItems] = useState<BonusItem[]>([]);
  
  const [direction, setDirection] = useState<'UP'|'DOWN'|'LEFT'|'RIGHT'>('RIGHT');
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  
  // Status Effects
  const [currentSpeed, setCurrentSpeed] = useState(INITIAL_SPEED);
  const [chiliTime, setChiliTime] = useState(0); 
  const [reversedControls, setReversedControls] = useState(0); // Timer for reversed controls
  
  // Survival Mechanic
  const [energy, setEnergy] = useState(100);
  
  const lastProcessedDirection = useRef<'UP'|'DOWN'|'LEFT'|'RIGHT'>('RIGHT');
  const moveInterval = useRef<any>(null);
  const touchStartRef = useRef<{x: number, y: number} | null>(null);
  const bonusIdCounter = useRef(0);

  useEffect(() => {
    if (userId) {
      gameService.getHighScore(userId, 'snake_turd').then(setHighScore);
    }
  }, [userId]);

  const getRandomPos = (currentSnake: {x: number, y: number}[], currentFood: {x: number, y: number}, currentBonuses: BonusItem[]) => {
      let newPos;
      let isCollision;
      do {
        newPos = {
          x: Math.floor(Math.random() * GRID_SIZE),
          y: Math.floor(Math.random() * GRID_SIZE)
        };
        const hitSnake = currentSnake.some(s => s.x === newPos.x && s.y === newPos.y);
        const hitFood = currentFood.x === newPos.x && currentFood.y === newPos.y;
        const hitBonus = currentBonuses.some(b => b.x === newPos.x && b.y === newPos.y);
        
        isCollision = hitSnake || hitFood || hitBonus;
      } while (isCollision);
      return newPos;
  }

  const generateFood = (currentSnake: {x: number, y: number}[]): {x: number, y: number, type: MainFoodType} => {
    const newPos = getRandomPos(currentSnake, food, bonusItems);

    const rand = Math.random();
    let type: MainFoodType = 'FOOD';

    // 10% chance for Golden Roll as main food replacement
    if (rand > 0.90) { 
        type = 'GOLDEN_ROLL';
    } 

    return { ...newPos, type };
  };

  const spawnBonus = () => {
      if (bonusItems.length >= 2) return; // Cap simultaneous bonuses

      // 50/50 chance between Chili and Burrito
      const isChili = Math.random() > 0.5;
      const type: BonusType = isChili ? 'CHILI' : 'BAD_BURRITO';
      const duration = isChili ? 10000 : 8000; // Chili 10s, Burrito 8s

      const pos = getRandomPos(snake, food, bonusItems);
      
      const newItem: BonusItem = {
          id: bonusIdCounter.current++,
          x: pos.x,
          y: pos.y,
          type,
          expires: Date.now() + duration
      };

      setBonusItems(prev => [...prev, newItem]);
  };

  const startGame = (selectedMode: 'CLASSIC' | 'SURVIVAL') => {
    setMode(selectedMode);
    setSnake([{x: 10, y: 10}]);
    setFood({x: 15, y: 5, type: 'FOOD'});
    setBonusItems([]);
    setDirection('RIGHT');
    lastProcessedDirection.current = 'RIGHT';
    setScore(0);
    setGameOver(false);
    setCurrentSpeed(INITIAL_SPEED);
    setChiliTime(0);
    setReversedControls(0);
    setEnergy(100);
    playSound('SCORE');
  };

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    let key = e.key;
    
    // Logic for Reversed Controls
    if (reversedControls > 0) {
        if (key === 'ArrowUp') key = 'ArrowDown';
        else if (key === 'ArrowDown') key = 'ArrowUp';
        else if (key === 'ArrowLeft') key = 'ArrowRight';
        else if (key === 'ArrowRight') key = 'ArrowLeft';
    }

    const currentDir = lastProcessedDirection.current;
    switch(key) {
      case 'ArrowUp': if (currentDir !== 'DOWN') setDirection('UP'); break;
      case 'ArrowDown': if (currentDir !== 'UP') setDirection('DOWN'); break;
      case 'ArrowLeft': if (currentDir !== 'RIGHT') setDirection('LEFT'); break;
      case 'ArrowRight': if (currentDir !== 'LEFT') setDirection('RIGHT'); break;
    }
  }, [reversedControls]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // Touch Handling for Mobile - Swipe Control
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    e.preventDefault(); // Prevent scrolling
    
    const currentTouch = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
    
    const dx = currentTouch.x - touchStartRef.current.x;
    const dy = currentTouch.y - touchStartRef.current.y;
    
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    const currentDir = lastProcessedDirection.current;
    let inputDir = '';

    // Lower threshold for swipe detection (15px instead of 20px) for more responsive control
    if (Math.max(absDx, absDy) > 15) {
      if (absDx > absDy) {
        // Horizontal
        if (dx > 0) inputDir = 'RIGHT';
        else inputDir = 'LEFT';
      } else {
        // Vertical
        if (dy > 0) inputDir = 'DOWN';
        else inputDir = 'UP';
      }

      // Apply Reverse Logic to Touch
      if (reversedControls > 0 && inputDir) {
          if (inputDir === 'UP') inputDir = 'DOWN';
          else if (inputDir === 'DOWN') inputDir = 'UP';
          else if (inputDir === 'LEFT') inputDir = 'RIGHT';
          else if (inputDir === 'RIGHT') inputDir = 'LEFT';
      }

      // Apply Direction
      if (inputDir === 'RIGHT' && currentDir !== 'LEFT') {
        setDirection('RIGHT');
        touchStartRef.current = currentTouch; // Update start position for continuous swipe
      }
      if (inputDir === 'LEFT' && currentDir !== 'RIGHT') {
        setDirection('LEFT');
        touchStartRef.current = currentTouch;
      }
      if (inputDir === 'DOWN' && currentDir !== 'UP') {
        setDirection('DOWN');
        touchStartRef.current = currentTouch;
      }
      if (inputDir === 'UP' && currentDir !== 'DOWN') {
        setDirection('UP');
        touchStartRef.current = currentTouch;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchStartRef.current = null;
  };

  // Speed Logic
  useEffect(() => {
      if (chiliTime > 0) {
          setCurrentSpeed(CHILI_SPEED);
      } else {
          // Speed ramps up with score
          const baseSpeed = Math.max(80, INITIAL_SPEED - Math.floor(score / 50) * 5);
          setCurrentSpeed(baseSpeed);
      }
  }, [chiliTime, score]);

  useEffect(() => {
    if (mode === 'MENU') return;

    if (gameOver) {
      playSound('BAD');
      if (score > highScore) {
        setHighScore(score);
        if (userId) gameService.saveScore(userId, 'snake_turd', score);
      } else if (userId && score > 0) {
        gameService.saveScore(userId, 'snake_turd', score);
      }
      return;
    }

    const moveSnake = () => {
      const now = Date.now();

      // 1. Bonus Item Management (Expire old ones)
      setBonusItems(prev => prev.filter(item => item.expires > now));

      // 2. Random Chance to Spawn Bonus (2.5% per tick - increased for better chili spawn rate)
      // Only if we don't have too many bonuses
      if (Math.random() < 0.025) {
          spawnBonus();
      }

      if (mode === 'SURVIVAL') {
          setEnergy(e => {
              const drain = chiliTime > 0 ? 0.5 : 1.5; // Drains slower if on chili
              const next = e - drain;
              if (next <= 0) {
                  setGameOver(true);
                  return 0;
              }
              return next;
          });
      }

      setSnake(prevSnake => {
        const head = { ...prevSnake[0] };
        lastProcessedDirection.current = direction;

        switch(direction) {
          case 'UP': head.y -= 1; break;
          case 'DOWN': head.y += 1; break;
          case 'LEFT': head.x -= 1; break;
          case 'RIGHT': head.x += 1; break;
        }

        // Check Wall Collision
        if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
          setGameOver(true);
          return prevSnake;
        }

        // Check Self Collision
        if (prevSnake.some(segment => segment.x === head.x && segment.y === head.y)) {
          setGameOver(true);
          return prevSnake;
        }

        const newSnake = [head, ...prevSnake];
        let didEat = false;

        // --- CHECK COLLISIONS ---

        // 1. Check Main Food
        if (head.x === food.x && head.y === food.y) {
          didEat = true;
          let points = 1;
          
          if (mode === 'SURVIVAL') {
              setEnergy(prev => Math.min(100, prev + 30));
          }
          
          if (food.type === 'GOLDEN_ROLL') {
              points = 30;
              const tail = newSnake[newSnake.length - 1];
              newSnake.push({...tail});
              newSnake.push({...tail}); // +2 Segments
              playSound('SCORE');
          } else {
              // Burger
              playSound('SCORE');
          }

          if (chiliTime > 0) points *= 3;
          setScore(s => s + points);
          setFood(generateFood(newSnake));
        } 
        
        // 2. Check Bonus Items
        const hitBonusIndex = bonusItems.findIndex(b => b.x === head.x && b.y === head.y);
        
        if (hitBonusIndex !== -1) {
            const bonus = bonusItems[hitBonusIndex];
            didEat = true; // Consuming bonus also prevents tail reduction (grows 1)
            
            // Remove the eaten bonus
            setBonusItems(prev => prev.filter(b => b.id !== bonus.id));

            if (bonus.type === 'CHILI') {
                let points = 10;
                setChiliTime(prev => prev + 50); 
                playSound('EXPLOSION');
                if (chiliTime > 0) points *= 3;
                setScore(s => s + points);
            } 
            else if (bonus.type === 'BAD_BURRITO') {
                let points = 60;
                // Burrito Penalty: Grow by +4 segments (Total 5 because didEat=true keeps one)
                const tail = newSnake[newSnake.length - 1];
                for(let i=0; i<4; i++) newSnake.push({...tail});

                setReversedControls(prev => prev + 50);
                playSound('BAD');
                
                if (chiliTime > 0) points *= 3;
                setScore(s => s + points);
            }
        }

        if (!didEat) {
          // Didn't eat, remove tail
          newSnake.pop();
        }
        
        if (chiliTime > 0) setChiliTime(prev => prev - 1);
        if (reversedControls > 0) setReversedControls(prev => prev - 1);

        return newSnake;
      });
    };

    if (!isPaused && !gameOver) {
      moveInterval.current = setInterval(moveSnake, currentSpeed);
    } else {
      if (moveInterval.current) clearInterval(moveInterval.current);
    }
    return () => {
      if (moveInterval.current) clearInterval(moveInterval.current);
    };
  }, [direction, food, bonusItems, gameOver, score, highScore, userId, currentSpeed, chiliTime, mode, reversedControls, isPaused]);

  if (mode === 'MENU') {
      return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
             <div className="bg-brand-cream border-4 border-black rounded-2xl p-6 w-full max-w-sm text-center space-y-4">
                 <button onClick={onClose} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 border-2 border-black font-bold z-10 w-8 h-8 flex items-center justify-center">X</button>
                 <h2 className="text-3xl font-black text-brand-brown mb-4">Turd Snake</h2>
                 <p className="font-bold text-gray-500 mb-6">Select Mode</p>
                 
                 <button onClick={() => startGame('CLASSIC')} className="w-full bg-blue-100 border-4 border-blue-500 rounded-xl p-4 hover:scale-105 transition-transform">
                     <div className="text-4xl mb-2">😌</div>
                     <div className="font-black text-blue-900 text-xl">CLASSIC</div>
                     <div className="text-xs font-bold text-gray-500">Relaxing. Just eat & grow.</div>
                 </button>

                 <button onClick={() => startGame('SURVIVAL')} className="w-full bg-red-100 border-4 border-red-500 rounded-xl p-4 hover:scale-105 transition-transform animate-pulse">
                     <div className="text-4xl mb-2">⚡</div>
                     <div className="font-black text-red-900 text-xl">SURVIVAL</div>
                     <div className="text-xs font-bold text-gray-500">Hunger bar drains fast!</div>
                 </button>
             </div>
        </div>
      )
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className={`bg-brand-cream rounded-2xl p-4 w-full max-w-sm border-4 transition-colors duration-500 relative ${reversedControls > 0 ? 'border-purple-500 bg-purple-50' : 'border-black'}`}>
        <div className="absolute -top-4 right-0 flex gap-2 z-10">
          {!gameOver && (
            <button onClick={() => setIsPaused(!isPaused)} className="bg-yellow-500 text-white rounded-full p-2 border-2 border-black font-bold">
              {isPaused ? '▶' : '⏸'}
            </button>
          )}
          <button onClick={onClose} className="bg-red-500 text-white rounded-full p-2 border-2 border-black font-bold">X</button>
        </div>
        
        {reversedControls > 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                <div className="bg-purple-600 text-white font-black text-2xl px-4 py-2 rounded-xl animate-bounce shadow-lg border-2 border-white rotate-12">
                    😵 DIZZY! (Controls Flipped)
                </div>
            </div>
        )}

        <div className="flex justify-between items-center mb-2">
            <div>
                <h2 className="font-black text-2xl text-brand-brown">Turd Snake</h2>
                <div className="text-xs font-bold text-gray-500">{mode} MODE</div>
            </div>
            <div className="text-right leading-tight">
                <div className="text-xs text-gray-500 font-bold">HIGH: {highScore}</div>
                <div className={`font-black text-xl ${chiliTime > 0 ? 'text-red-500 animate-bounce' : 'text-brand-blue'}`}>
                    {chiliTime > 0 ? '🌶️ ' : ''}SCORE: {score}
                </div>
            </div>
        </div>

        {/* ENERGY BAR (SURVIVAL ONLY) */}
        {mode === 'SURVIVAL' && (
            <div className="w-full h-4 border-2 border-black rounded-full bg-gray-200 mb-4 relative overflow-hidden">
                <div 
                    className={`h-full transition-all duration-200 ${energy < 30 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}
                    style={{ width: `${energy}%` }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-black/50 tracking-widest">
                    HUNGER
                </div>
            </div>
        )}
        {mode === 'CLASSIC' && <div className="h-4 mb-4"></div>} 

        <div 
            className={`relative border-4 border-black rounded-lg mx-auto touch-none select-none transition-colors duration-300 ${chiliTime > 0 ? 'bg-red-100' : 'bg-[#90EE90]'}`}
            style={{
                width: '300px', 
                height: '300px',
                display: 'grid',
                gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
                filter: reversedControls > 0 ? 'hue-rotate(90deg)' : 'none'
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
           {gameOver && (
               <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                   <div className="bg-white p-4 rounded-xl border-4 border-black text-center animate-bounce">
                       <div className="text-4xl mb-2">{mode === 'SURVIVAL' && energy <= 0 ? '😫' : '💀'}</div>
                       <div className="font-black text-xl text-red-600 mb-2">
                           {mode === 'SURVIVAL' && energy <= 0 ? 'STARVED!' : 'GAME OVER'}
                       </div>
                       <div className="flex gap-2 justify-center">
                           <button onClick={() => startGame(mode)} className="bg-brand-yellow px-4 py-2 rounded-lg border-2 border-black font-bold">Try Again</button>
                           <button onClick={() => setMode('MENU')} className="bg-white px-4 py-2 rounded-lg border-2 border-black font-bold text-xs">Exit</button>
                       </div>
                   </div>
               </div>
           )}

           {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
               const x = i % GRID_SIZE;
               const y = Math.floor(i / GRID_SIZE);
               const snakeIndex = snake.findIndex(s => s.x === x && s.y === y);
               const isSnakeHead = snakeIndex === 0;
               const isSnakeBody = snakeIndex > 0;
               const isFood = food.x === x && food.y === y;
               const bonus = bonusItems.find(b => b.x === x && b.y === y);

               return (
                   <div key={i} className="w-full h-full flex items-center justify-center relative">
                       {isSnakeHead && (
                           <div className="relative text-sm z-10" style={{
                               transform: direction === 'RIGHT' ? 'scaleX(-1)' : direction === 'UP' ? 'rotate(-90deg)' : direction === 'DOWN' ? 'rotate(90deg)' : 'none'
                           }}>
                               {chiliTime > 0 ? '🥵' : (reversedControls > 0 ? '🤢' : '💩')}
                           </div>
                       )}
                       
                       {isSnakeBody && (
                           <div className={`w-full h-full rounded-sm border ${chiliTime > 0 ? 'bg-red-500 border-red-300' : 'bg-brand-brown border-[#90EE90]'}`}></div>
                       )}
                       
                       {isFood && (
                           <span className={`text-sm`}>
                               {food.type === 'FOOD' && '🍔'}
                               {food.type === 'GOLDEN_ROLL' && '✨'}
                           </span>
                       )}

                       {bonus && (
                           <span className="text-sm animate-pulse">
                               {bonus.type === 'BAD_BURRITO' && '🌯'}
                               {bonus.type === 'CHILI' && '🌶️'}
                           </span>
                       )}
                   </div>
               )
           })}
        </div>
        
        {/* Legend */}
        <div className="mt-4 flex flex-wrap justify-between text-[10px] font-bold text-gray-500 px-2 gap-y-1">
             <div className="flex items-center gap-1"><span>🍔</span>{mode === 'SURVIVAL' ? 'Energy' : 'Pt'}</div>
             <div className="flex items-center gap-1"><span>🌶️</span>Speed</div>
             <div className="flex items-center gap-1"><span>✨</span>+30</div>
             <div className="flex items-center gap-1"><span>🌯</span>Dizzy (+60)</div>
        </div>
      </div>
    </div>
  );
};