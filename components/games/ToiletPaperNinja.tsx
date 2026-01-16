import React, { useEffect, useRef, useState } from 'react';
import { gameService } from '../../services/supabaseClient';
import { playSound } from '../../utils/audio';

interface NinjaProps {
  onClose: () => void;
  userId?: string;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const GRAVITY = 0.45; 
const FRENZY_DURATION = 90; // Reduced from 120 (1.5 seconds)

interface GameObject {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotation: number;
    vRotation: number;
    type: 'TP' | 'GOLDEN_TP' | 'POOP' | 'MEGA_TP' | 'ICE_TP' | 'BOMB' | 'RAINBOW_TP';
    size: number;
    active: boolean;
    hp?: number; // For Mega TP
    maxHp?: number;
    hitFlash?: number; // Visual flash timer
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
    size: number;
    type?: 'SPARK' | 'CONFETTI' | 'LINE'; 
}

interface FloatingText {
    id: number;
    x: number;
    y: number;
    text: string;
    color: string;
    life: number;
    scale: number;
}

export const ToiletPaperNinja: React.FC<NinjaProps> = ({ onClose, userId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Game State
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAME_OVER'>('START');
  const [isPaused, setIsPaused] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [combo, setCombo] = useState(0);
  
  // Special Modes
  const [frenzyMeter, setFrenzyMeter] = useState(0);
  const [isFrenzy, setIsFrenzy] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false); // Slow Motion
  
  // Visual Overlays
  const [poopSplatterOpacity, setPoopSplatterOpacity] = useState(0);

  // Refs for loop
  const objectsRef = useRef<GameObject[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const requestRef = useRef<number>(0);
  const swipePointsRef = useRef<{x: number, y: number, age: number}[]>([]);
  const lastSwipeTimeRef = useRef(0);
  const objectIdCounter = useRef(0);
  const frameCount = useRef(0);
  const frenzyTimerRef = useRef(0);
  const freezeTimerRef = useRef(0);
  const timeScaleRef = useRef(1.0); // Controls game speed
  
  // Game Feel Refs
  const shakeRef = useRef(0);
  const hitStopRef = useRef(0); // Frames to freeze
  const lastHitTimeRef = useRef(0); // For Blitz Combo
  const blitzCountRef = useRef(0); // Count hits in quick succession
  
  // Smart Spawning "Bag"
  const spawnBagRef = useRef<string[]>([]);

  useEffect(() => {
    if (userId) {
      gameService.getHighScore(userId, 'tp_ninja').then(setHighScore);
    }
  }, [userId]);

  const startGame = () => {
      setScore(0);
      setLives(3);
      setGameState('PLAYING');
      setCombo(0);
      setFrenzyMeter(0);
      setIsFrenzy(false);
      setIsFrozen(false);
      setPoopSplatterOpacity(0);
      
      objectsRef.current = [];
      particlesRef.current = [];
      floatingTextsRef.current = [];
      swipePointsRef.current = [];
      spawnBagRef.current = []; // Reset bag
      frameCount.current = 0;
      shakeRef.current = 0;
      hitStopRef.current = 0;
      timeScaleRef.current = 1.0;
      blitzCountRef.current = 0;
      playSound('SLICE');
  };

  const endGame = () => {
      playSound('BAD');
      setGameState('GAME_OVER');
      if (userId && score > 0) {
          gameService.saveScore(userId, 'tp_ninja', score);
          if (score > highScore) setHighScore(score);
      }
  };

  // --- SMART SPAWN SYSTEM (The Bag) ---
  const getNextSpawnType = (): 'TP' | 'GOLDEN_TP' | 'POOP' | 'MEGA_TP' | 'ICE_TP' | 'BOMB' | 'RAINBOW_TP' => {
      if (spawnBagRef.current.length === 0) {
          // Bag Logic: Controlled Randomness
          const bag: string[] = ['TP', 'TP', 'TP'];
          
          const rand = Math.random();
          
          // --- UPDATED PROBABILITIES ---
          // Mega: 15% (0.85+)
          // Ice: 15% (0.70 - 0.85)
          // Bomb: 15% (0.55 - 0.70)
          // Rainbow: 5% (0.50 - 0.55)
          // Golden: 25% (0.25 - 0.50)
          // Normal: 25% (< 0.25)
          
          if (rand > 0.85) {
              bag.push('MEGA_TP'); 
          } else if (rand > 0.70) {
              bag.push('ICE_TP'); 
          } else if (rand > 0.55) {
              bag.push('BOMB');
          } else if (rand > 0.50) {
              bag.push('RAINBOW_TP');
          } else if (rand > 0.25) {
              bag.push('GOLDEN_TP'); 
          } else {
              bag.push('TP'); 
          }

          // Hazards - REDUCED to 1 to lower late game difficulty
          bag.push('POOP'); 
          
          // Fill remaining space with TP to ensure action
          bag.push('TP');
          
          // Shuffle
          spawnBagRef.current = bag.sort(() => Math.random() - 0.5);
      }
      return spawnBagRef.current.pop() as any;
  };

  const spawnObject = (forceType?: 'TP' | 'GOLDEN_TP' | 'MEGA_TP', count: number = 1) => {
      // Reduced max objects slightly to improve performance on mobile
      const maxObjects = isFrenzy ? 25 : 18; 
      if (objectsRef.current.filter(o => o.active).length >= maxObjects) return;

      for (let i = 0; i < count; i++) {
        let type: 'TP' | 'GOLDEN_TP' | 'POOP' | 'MEGA_TP' | 'ICE_TP' | 'BOMB' | 'RAINBOW_TP' = 'TP';
        
        if (forceType) {
            type = forceType;
        } else if (isFrenzy) {
            // Frenzy mode: Mostly points, fewer hazards
            const roll = Math.random();
            if (roll > 0.95) type = 'MEGA_TP';  
            else if (roll > 0.7) type = 'GOLDEN_TP';
            else type = 'TP';
        } else {
            type = getNextSpawnType();
        }

        let size = 70;
        let hp = 1;
        
        if (type === 'POOP' || type === 'BOMB') size = 60;
        if (type === 'RAINBOW_TP') size = 65;
        if (type === 'MEGA_TP') {
            size = 150; 
            hp = 5; 
        }

        // Position logic - Spread them out if spawning multiple
        // Adjust offset to fan out nicer
        const offset = (i - (count-1)/2) * 120; 
        const x = Math.max(80, Math.min(CANVAS_WIDTH - 80, 60 + Math.random() * (CANVAS_WIDTH - 120) + offset));
        
        // Stagger Y slightly so they don't overlap perfectly
        const y = CANVAS_HEIGHT + 100 + (Math.abs(offset) * 0.5) + (Math.random() * 50);
        
        const centerBias = (CANVAS_WIDTH / 2 - x) * 0.015;
        const vx = centerBias + (Math.random() - 0.5) * 4;
        
        let launchPower = 18 + Math.random() * 12; 
        if (type === 'MEGA_TP') {
            launchPower = 23 + Math.random() * 4; 
        }
        if (type === 'RAINBOW_TP') {
            launchPower = 26 + Math.random() * 5; // Fast!
        }
        if (isFrenzy) launchPower *= 1.2;

        const vy = -launchPower; 

        objectsRef.current.push({
            id: objectIdCounter.current++,
            x,
            y,
            vx,
            vy,
            rotation: Math.random() * Math.PI * 2,
            vRotation: (Math.random() - 0.5) * 0.3,
            type,
            size,
            active: true,
            hp,
            maxHp: hp,
            hitFlash: 0
        });
      }
  };

  const createExplosion = (x: number, y: number, color: string, count: number = 10, speedMult: number = 1) => {
      for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (Math.random() * 10 + 5) * speedMult;
          particlesRef.current.push({
              x,
              y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 1.0,
              color: color,
              size: Math.random() * 8 + 4,
              type: 'SPARK'
          });
      }
      for (let i=0; i< count/2; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (Math.random() * 15 + 10) * speedMult;
          particlesRef.current.push({
              x, 
              y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 0.8,
              color: 'white',
              size: Math.random() * 4 + 2,
              type: 'LINE'
          });
      }
  };

  const addFloatingText = (x: number, y: number, text: string, color: string, scale: number = 1) => {
      floatingTextsRef.current.push({
          id: Math.random(),
          x,
          y,
          text,
          color,
          life: 1.0,
          scale
      });
  };

  const handleInputMove = (x: number, y: number) => {
      if (gameState !== 'PLAYING') return;
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;
      const cx = (x - rect.left) * scaleX;
      const cy = (y - rect.top) * scaleY;

      swipePointsRef.current.push({x: cx, y: cy, age: 0});
      if (swipePointsRef.current.length > 8) swipePointsRef.current.shift();
      lastSwipeTimeRef.current = Date.now();

      checkSlices(cx, cy);
  };

  const checkSlices = (cx: number, cy: number) => {
      if (swipePointsRef.current.length < 2) return;
      
      const p1 = swipePointsRef.current[swipePointsRef.current.length-1];
      const p2 = swipePointsRef.current[swipePointsRef.current.length-2];
      const speed = Math.sqrt(Math.pow(p1.x-p2.x, 2) + Math.pow(p1.y-p2.y, 2));

      objectsRef.current.forEach(obj => {
          if (!obj.active) return;
          const dx = cx - obj.x;
          const dy = cy - obj.y;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (dist < obj.size / 1.0) { 
              sliceObject(obj, speed);
          }
      });
  };

  const sliceObject = (obj: GameObject, swipeSpeed: number) => {
      // BLITZ COMBO LOGIC
      const now = Date.now();
      if (now - lastHitTimeRef.current < 250) { 
          blitzCountRef.current++;
      } else {
          blitzCountRef.current = 1;
      }
      lastHitTimeRef.current = now;

      // ---

      let freezeFrames = 3;
      if (obj.type === 'MEGA_TP') freezeFrames = 8;
      else if (obj.type === 'GOLDEN_TP' || obj.type === 'ICE_TP' || obj.type === 'BOMB') freezeFrames = 5;
      
      hitStopRef.current = freezeFrames;
      shakeRef.current = obj.type === 'MEGA_TP' ? 20 : 5;

      // Handle Mega TP HP
      if (obj.type === 'MEGA_TP' && obj.hp && obj.hp > 1) {
          obj.hp--;
          obj.hitFlash = 5; 
          obj.vy = -12; 
          obj.vx = (Math.random() - 0.5) * 8;
          obj.vRotation += 0.2; 
          
          playSound('WHACK');
          createExplosion(obj.x, obj.y, '#FFF', 8, 0.5);
          addFloatingText(obj.x + (Math.random()*60-30), obj.y, `${obj.hp}`, "#FFF", 1.5);
          setScore(s => s + 5);
          
          if (!isFrenzy) {
              setFrenzyMeter(prev => Math.min(100, prev + 2)); 
          }
          return; 
      }

      // Destroy Object
      obj.active = false;
      
      if (obj.type === 'POOP') {
          if (!isFrenzy) {
              playSound('EXPLOSION');
              createExplosion(obj.x, obj.y, '#5D4037', 50);
              setLives(l => {
                  const newLives = l - 1;
                  if (newLives <= 0) endGame();
                  return newLives;
              });
              setCombo(0);
              blitzCountRef.current = 0;
              setFrenzyMeter(0); 
              setPoopSplatterOpacity(1); 
              setTimeout(() => setPoopSplatterOpacity(0), 1000);
          }
      } else if (obj.type === 'BOMB') {
          // BOMB LOGIC: Screen Clear (Except Poop)
          playSound('EXPLOSION');
          createExplosion(obj.x, obj.y, 'orange', 60, 2);
          setShakeIntensity(25);
          addFloatingText(obj.x, obj.y, "BOOM!", "red", 3.0);
          
          let bombScore = 0;
          
          objectsRef.current.forEach(other => {
             if (other.active && other.type !== 'POOP' && other.id !== obj.id) {
                 other.active = false;
                 createExplosion(other.x, other.y, '#FFF', 10);
                 bombScore += 10;
             }
          });
          
          setScore(s => s + bombScore);
          
      } else {
          // GOOD HIT
          playSound('SLICE');
          let basePoints = 1;
          let color = '#FFF';
          let text = "";
          let isCritical = Math.random() > 0.85;

          if (obj.type === 'GOLDEN_TP') {
              basePoints = 5;
              color = '#FFD700';
              text = "GOLDEN!";
              playSound('SCORE');
          } else if (obj.type === 'RAINBOW_TP') {
              basePoints = 50;
              color = '#FF69B4'; // Hot Pink
              text = "UNICORN!";
              playSound('SCORE');
              createExplosion(obj.x, obj.y, '#FF00FF', 40, 2);
              createExplosion(obj.x, obj.y, '#00FFFF', 40, 2);
              createExplosion(obj.x, obj.y, '#FFFF00', 40, 2);
          } else if (obj.type === 'MEGA_TP') {
              basePoints = 50;
              color = '#FF00FF';
              text = "MEGA CRUSH!";
              createExplosion(obj.x, obj.y, '#FFD700', 80, 2);
              playSound('EXPLOSION');
          } else if (obj.type === 'ICE_TP') {
              basePoints = 10;
              color = '#00FFFF';
              text = "FREEZE!";
              startFreeze();
              createExplosion(obj.x, obj.y, '#00FFFF', 40, 1.5);
              playSound('LASER');
          }

          if (isCritical) {
              basePoints *= 2;
              text = "CRITICAL!";
              color = '#FF4500';
              shakeRef.current += 10;
          }

          const comboBonus = Math.floor(combo / 5);
          const points = basePoints + comboBonus;
          
          setScore(s => s + points);
          setCombo(c => c + 1);
          
          // BLITZ BONUS CHECK
          if (blitzCountRef.current >= 3) {
              const blitzBonus = blitzCountRef.current * 5;
              setScore(s => s + blitzBonus);
              
              let blitzText = "COMBO!";
              if (blitzCountRef.current === 3) blitzText = "TRIPLE!";
              if (blitzCountRef.current === 4) blitzText = "RAMPAGE!";
              if (blitzCountRef.current >= 5) blitzText = "GODLIKE!";
              
              addFloatingText(obj.x, obj.y - 60, `${blitzText} +${blitzBonus}`, "#FFD700", 1.5 + (blitzCountRef.current * 0.1));
              playSound('SCORE'); // Satisfying sound on blitz
              shakeRef.current += 5;
          }
          
          // FRENZY METER LOGIC
          if (!isFrenzy) {
              setFrenzyMeter(prev => {
                  let gain = 5;
                  if (obj.type === 'GOLDEN_TP') gain = 12;
                  if (obj.type === 'MEGA_TP') gain = 20;
                  if (obj.type === 'ICE_TP') gain = 20;
                  if (obj.type === 'RAINBOW_TP') gain = 50; // Huge boost
                  
                  const next = prev + gain;
                  if (next >= 100) startFrenzy();
                  return Math.min(100, next);
              });
          }

          if (obj.type !== 'MEGA_TP' && obj.type !== 'RAINBOW_TP') {
              createExplosion(obj.x, obj.y, color, 20);
          }
          
          if (!text) text = `+${points}`;
          addFloatingText(obj.x, obj.y - 20, text, color, obj.type === 'MEGA_TP' ? 2.5 : 1.2);
      }
  };

  const startFreeze = () => {
      setIsFrozen(true);
      freezeTimerRef.current = 180; // 3 seconds at 60fps
      timeScaleRef.current = 0.3; // Slow down everything
  };

  const startFrenzy = () => {
      setIsFrenzy(true);
      frenzyTimerRef.current = FRENZY_DURATION;
      setIsFrozen(false); 
      timeScaleRef.current = 1.0; // Reset speed for frenzy
      // Clear hazards
      objectsRef.current.forEach(o => {
          if (o.type === 'POOP') o.active = false;
      });
      shakeRef.current = 10;
      playSound('SCORE');
  };

  const setShakeIntensity = (val: number) => {
      shakeRef.current = val;
  }

  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const loop = () => {
          if (hitStopRef.current > 0) {
              hitStopRef.current--;
              draw(ctx);
              requestRef.current = requestAnimationFrame(loop);
              return;
          }

          if (gameState === 'PLAYING' && !isPaused) {
              update();
          }
          draw(ctx);
          requestRef.current = requestAnimationFrame(loop);
      };

      const update = () => {
          frameCount.current++;
          const ts = timeScaleRef.current;
          
          if (shakeRef.current > 0) shakeRef.current *= 0.9;
          if (shakeRef.current < 0.5) shakeRef.current = 0;

          // Freeze Timer Logic
          if (isFrozen) {
              freezeTimerRef.current--;
              if (freezeTimerRef.current <= 0) {
                  setIsFrozen(false);
                  timeScaleRef.current = 1.0;
              }
          }

          if (isFrenzy) {
              frenzyTimerRef.current--;
              setFrenzyMeter((frenzyTimerRef.current / FRENZY_DURATION) * 100);
              if (frenzyTimerRef.current <= 0) {
                  setIsFrenzy(false);
                  setFrenzyMeter(0);
              }
          }

          // SPAWN RATE LOGIC - REBALANCED for better early game
          // Slower ramp up based on score
          const scoreDifficulty = Math.floor(score / 100); // Slower scaling
          
          // Slower ramp up based on time
          const timeDifficulty = Math.min(15, Math.floor(frameCount.current / 1000)); 

          // Base 30 (increased from 40), Min 15 (decreased from 22) for more frequent spawning early game
          let spawnInterval = Math.max(15, 30 - scoreDifficulty - timeDifficulty);
          
          if (isFrenzy) spawnInterval = 10; 
          
          if (isFrozen) spawnInterval = Math.floor(spawnInterval / 0.3); // Scale interval up for slow mo

          if (frameCount.current % spawnInterval === 0) {
              // BURST SPAWN LOGIC: 2-4 Objects
              // Default chance is now 50% instead of 30% to make it denser
              const burstChance = isFrenzy ? 0.95 : 0.5 + (score / 2000);
              let spawnCount = 1;
              
              if (Math.random() < burstChance) {
                  // Randomly choose 2, 3, or 4
                  spawnCount = 2 + Math.floor(Math.random() * 3);
              }

              spawnObject(undefined, spawnCount);
          }

          objectsRef.current.forEach(obj => {
              if (!obj.active) return;
              
              // Physics affected by Time Scale
              obj.x += obj.vx * ts;
              obj.y += obj.vy * ts;
              obj.vy += GRAVITY * ts;
              obj.rotation += obj.vRotation * ts;
              
              if (obj.hitFlash && obj.hitFlash > 0) obj.hitFlash--;

              if (obj.y > CANVAS_HEIGHT + 150) {
                  obj.active = false;
                  if (obj.type !== 'POOP' && !isFrenzy) {
                      setCombo(0);
                      blitzCountRef.current = 0;
                  }
              }
          });

          particlesRef.current.forEach(p => {
              p.x += p.vx * ts;
              p.y += p.vy * ts;
              if (p.type !== 'LINE') p.vy += 0.5 * ts; 
              p.life -= 0.03 * ts;
          });
          particlesRef.current = particlesRef.current.filter(p => p.life > 0);

          floatingTextsRef.current.forEach(t => {
              t.y -= 2 * ts;
              t.life -= 0.02 * ts;
          });
          floatingTextsRef.current = floatingTextsRef.current.filter(t => t.life > 0);

          if (Date.now() - lastSwipeTimeRef.current > 50) {
              swipePointsRef.current.shift();
          }
      };

      const draw = (ctx: CanvasRenderingContext2D) => {
          ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          
          ctx.save();
          if (shakeRef.current > 0) {
              const dx = (Math.random() - 0.5) * shakeRef.current;
              const dy = (Math.random() - 0.5) * shakeRef.current;
              ctx.translate(dx, dy);
          }

          // BACKGROUND
          if (isFrenzy) {
              const pulse = (Math.sin(frameCount.current * 0.2) + 1) / 2;
              const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
              g.addColorStop(0, `rgba(255, 215, 0, ${0.2 + pulse * 0.3})`);
              g.addColorStop(1, `rgba(255, 100, 0, ${0.2 + pulse * 0.3})`);
              ctx.fillStyle = g;
              ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
              
              // Sunburst
              ctx.strokeStyle = 'rgba(255,255,255,0.6)';
              ctx.beginPath();
              for(let i=0; i<8; i++) {
                  const x = (frameCount.current * 20 + i * 100) % CANVAS_WIDTH;
                  ctx.moveTo(x, 0); ctx.lineTo(x - 50, CANVAS_HEIGHT);
              }
              ctx.stroke();
          } else if (isFrozen) {
              // Ice Background
              const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
              g.addColorStop(0, '#E0F7FA');
              g.addColorStop(1, '#00BCD4');
              ctx.fillStyle = g;
              ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
              
              // Snowflakes
              ctx.fillStyle = 'white';
              for(let i=0; i<20; i++) {
                  const x = (frameCount.current * 5 + i * 50) % CANVAS_WIDTH;
                  const y = (frameCount.current * 2 + i * 30) % CANVAS_HEIGHT;
                  ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI*2); ctx.fill();
              }
          } else {
              // Normal Background
              ctx.fillStyle = '#E0F7FA';
              ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
              ctx.strokeStyle = '#B2EBF2';
              ctx.lineWidth = 2;
              ctx.beginPath();
              for(let i=0; i<CANVAS_WIDTH; i+=60) { ctx.moveTo(i,0); ctx.lineTo(i, CANVAS_HEIGHT); }
              for(let i=0; i<CANVAS_HEIGHT; i+=60) { ctx.moveTo(0,i); ctx.lineTo(CANVAS_WIDTH, i); }
              ctx.stroke();
          }

          objectsRef.current.forEach(obj => {
              if (!obj.active) return;
              ctx.save();
              ctx.translate(obj.x, obj.y);
              ctx.rotate(obj.rotation);
              
              if (obj.hitFlash && obj.hitFlash > 0) {
                  ctx.globalCompositeOperation = 'source-over';
                  ctx.fillStyle = 'white';
                  ctx.beginPath();
                  ctx.arc(0, 0, obj.size/1.5, 0, Math.PI*2);
                  ctx.fill();
              }

              ctx.font = `${obj.size}px Fredoka`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              let sprite = '🧻';
              if (obj.type === 'POOP') sprite = '💩';
              if (obj.type === 'GOLDEN_TP') sprite = '✨';
              if (obj.type === 'MEGA_TP') sprite = '📦'; 
              if (obj.type === 'ICE_TP') sprite = '❄️';
              if (obj.type === 'BOMB') sprite = '💣';
              if (obj.type === 'RAINBOW_TP') sprite = '🌈';

              if (obj.type === 'MEGA_TP' && obj.hp && obj.hp < (obj.maxHp || 5)) {
                  ctx.translate((Math.random()-0.5)*5, (Math.random()-0.5)*5);
              }
              
              // Shadow
              ctx.fillStyle = 'rgba(0,0,0,0.2)';
              ctx.fillText(sprite, 5, 5);
              
              ctx.fillStyle = '#000';
              ctx.fillText(sprite, 0, 0);

              // Item specific overlays
              if (obj.type === 'GOLDEN_TP') ctx.fillText('🧻', 0, 0); 
              if (obj.type === 'ICE_TP') ctx.fillText('🧻', 0, 0);
              if (obj.type === 'RAINBOW_TP') ctx.fillText('🦄', 0, 0); 
              
              if (obj.type === 'MEGA_TP') {
                  ctx.fillStyle = 'white';
                  ctx.font = 'bold 30px Arial';
                  ctx.strokeStyle = 'black';
                  ctx.lineWidth = 4;
                  ctx.strokeText(`${obj.hp}`, 0, 10);
                  ctx.fillText(`${obj.hp}`, 0, 10);
                  
                  ctx.globalCompositeOperation = 'destination-over';
                  ctx.shadowColor = 'gold';
                  ctx.shadowBlur = 20;
                  ctx.fillStyle = 'rgba(255,215,0,0.3)';
                  ctx.beginPath();
                  ctx.arc(0,0, obj.size/2 + 10, 0, Math.PI*2);
                  ctx.fill();
              }
              
              ctx.restore();
          });

          particlesRef.current.forEach(p => {
              ctx.save();
              ctx.globalAlpha = p.life;
              ctx.fillStyle = p.color;
              
              if (p.type === 'LINE') {
                  ctx.translate(p.x, p.y);
                  ctx.rotate(Math.atan2(p.vy, p.vx));
                  ctx.fillRect(0, -2, p.size * 5, 4); 
              } else {
                  ctx.beginPath();
                  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                  ctx.fill();
              }
              ctx.restore();
          });

          // Draw Swipe Trail
          if (swipePointsRef.current.length > 1) {
              ctx.beginPath();
              ctx.moveTo(swipePointsRef.current[0].x, swipePointsRef.current[0].y);
              for (let i = 1; i < swipePointsRef.current.length; i++) {
                  const p1 = swipePointsRef.current[i];
                  const p0 = swipePointsRef.current[i-1];
                  const midX = (p0.x + p1.x) / 2;
                  const midY = (p0.y + p1.y) / 2;
                  ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
              }
              
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.lineWidth = 10;
              
              if (combo > 10 || isFrenzy || blitzCountRef.current >= 3) {
                  const hue = (frameCount.current * 10) % 360;
                  ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
                  ctx.shadowColor = `hsl(${hue}, 100%, 80%)`;
                  ctx.shadowBlur = 20;
              } else if (isFrozen) {
                  ctx.strokeStyle = '#00FFFF';
                  ctx.shadowColor = 'white';
                  ctx.shadowBlur = 15;
              } else {
                  ctx.strokeStyle = 'white';
                  ctx.shadowColor = 'cyan';
                  ctx.shadowBlur = 10;
              }
              ctx.stroke();
          }

          floatingTextsRef.current.forEach(t => {
              ctx.save();
              ctx.globalAlpha = t.life;
              ctx.translate(t.x, t.y);
              const scale = t.scale * (1 + (1 - t.life) * 1.5); 
              ctx.scale(scale, scale);
              
              ctx.font = "900 40px Fredoka";
              ctx.lineWidth = 4;
              ctx.strokeStyle = 'black';
              ctx.fillStyle = t.color;
              ctx.textAlign = 'center';
              
              ctx.strokeText(t.text, 0, 0);
              ctx.fillText(t.text, 0, 0);
              ctx.restore();
          });
          
          ctx.restore(); 
      };
      
      requestRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(requestRef.current);
  }, [gameState, score, isFrenzy, combo, isFrozen]);

  const handleTouchStart = (e: React.TouchEvent) => handleInputMove(e.touches[0].clientX, e.touches[0].clientY);
  const handleTouchMove = (e: React.TouchEvent) => handleInputMove(e.touches[0].clientX, e.touches[0].clientY);
  const handleMouseDown = (e: React.MouseEvent) => handleInputMove(e.clientX, e.clientY);
  const handleMouseMove = (e: React.MouseEvent) => {
      if (e.buttons === 1) handleInputMove(e.clientX, e.clientY);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-brand-cream rounded-2xl w-full max-w-md border-4 border-black relative overflow-hidden h-[90vh] flex flex-col shadow-2xl">
         <div className="absolute top-2 right-2 flex gap-2 z-30">
           {gameState === 'PLAYING' && (
             <button onClick={() => setIsPaused(!isPaused)} className="bg-yellow-500 text-white rounded-full p-2 border-2 border-black font-bold">
               {isPaused ? '▶' : '⏸'}
             </button>
           )}
           <button onClick={onClose} className="bg-red-500 text-white rounded-full p-2 border-2 border-black font-bold">X</button>
         </div>
         
         {/* Splatter Overlays */}
         <div 
            className="absolute inset-0 z-20 pointer-events-none transition-opacity duration-300"
            style={{
                backgroundColor: '#5D4037',
                opacity: poopSplatterOpacity,
                maskImage: 'radial-gradient(circle, transparent 40%, black 100%)'
            }}
         >
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-9xl">💩</div>
         </div>

         <div className="flex flex-col p-4 bg-white/90 border-b-2 border-black z-10 relative">
             <div className="flex justify-between items-start mb-2">
                <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Score</div>
                    <div className="flex items-baseline gap-2">
                        <div className="text-4xl font-black text-brand-blue leading-none drop-shadow-sm">{score}</div>
                        <div className="text-xs font-bold text-gray-400">BEST: {highScore}</div>
                    </div>
                </div>
                <div className="flex gap-1 text-2xl">
                    {Array.from({length: 3}).map((_, i) => (
                        <span key={i} className={`transition-all ${i < lives ? 'scale-100' : 'scale-75 opacity-20 grayscale'}`}>❤️</span>
                    ))}
                </div>
             </div>
             
             <div className="w-full h-4 bg-gray-200 rounded-full border border-black overflow-hidden relative">
                 <div 
                    className={`h-full transition-all duration-300 ${isFrenzy ? 'bg-gradient-to-r from-yellow-300 via-red-500 to-yellow-300 animate-pulse' : 'bg-yellow-400'}`}
                    style={{ width: `${isFrenzy ? (frenzyMeter) : frenzyMeter}%` }}
                 ></div>
                 <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black tracking-widest text-black/50">
                     {isFrenzy ? '🔥 FRENZY MODE 🔥' : 'FRENZY METER'}
                 </div>
             </div>
         </div>

         <div 
            className="flex-1 relative bg-gray-100 cursor-crosshair touch-none overflow-hidden"
            style={{
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTapHighlightColor: 'transparent'
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onContextMenu={(e) => e.preventDefault()}
            onSelectStart={(e) => e.preventDefault()}
         >
             <canvas 
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="w-full h-full block object-cover"
             />

             {combo > 1 && (
                 <div className="absolute top-24 left-1/2 -translate-x-1/2 text-center pointer-events-none z-10">
                     <div className="text-yellow-400 font-black text-6xl animate-bounce drop-shadow-[2px_2px_0px_rgba(0,0,0,1)] stroke-black" style={{ textShadow: '2px 2px 0 #000' }}>
                         {combo}
                     </div>
                     <div className="text-white font-bold text-xl uppercase tracking-widest bg-black/50 px-2 rounded">Combo</div>
                 </div>
             )}

             {isFrozen && (
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 opacity-30">
                     <div className="text-9xl text-cyan-300">❄️</div>
                 </div>
             )}

             {gameState !== 'PLAYING' && (
                 <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none z-30">
                     <div className="bg-white p-6 rounded-2xl border-4 border-black text-center animate-bounce pointer-events-auto shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-[80%]">
                         <div className="text-6xl mb-2">{gameState === 'START' ? '🥷' : '💀'}</div>
                         <h2 className="text-3xl font-black text-brand-brown mb-2">{gameState === 'START' ? 'TP NINJA' : 'GAME OVER'}</h2>
                         
                         {gameState === 'GAME_OVER' && (
                             <div className="mb-4 space-y-1">
                                 <div className="text-xl font-bold">Score: {score}</div>
                                 {score >= highScore && score > 0 && <div className="text-sm font-bold text-yellow-500 animate-pulse">✨ New High Score! ✨</div>}
                             </div>
                         )}

                         <button onClick={startGame} className="bg-brand-yellow px-8 py-4 text-xl rounded-xl border-2 border-black font-black hover:scale-105 transition-transform w-full">
                             {gameState === 'START' ? 'START SLICING' : 'TRY AGAIN'}
                         </button>
                         <div className="mt-4 flex justify-center gap-4 text-sm font-bold text-gray-500">
                             <div className="flex flex-col items-center"><span>❄️</span><span>Slow</span></div>
                             <div className="flex flex-col items-center"><span>💣</span><span>TNT</span></div>
                             <div className="flex flex-col items-center"><span>🦄</span><span>Rare</span></div>
                             <div className="flex flex-col items-center"><span>📦</span><span>Lots</span></div>
                         </div>
                     </div>
                 </div>
             )}
         </div>
      </div>
    </div>
  );
};