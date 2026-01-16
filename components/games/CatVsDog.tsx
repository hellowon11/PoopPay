import React, { useEffect, useRef, useState } from 'react';
import { gameService } from '../../services/supabaseClient';
import { Button } from '../Button';
import { playSound } from '../../utils/audio';

interface CatVsDogProps {
  onClose: () => void;
  userId?: string;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const GRAVITY = 0.4;
const GROUND_Y = 400;
const WIND_FACTOR = 0.06;

type Character = 'CAT' | 'DOG';
type Difficulty = 'EASY' | 'NORMAL' | 'HARD';
type ItemType = 'DOUBLE_SHOT' | 'BIG_BOMB' | 'HEAL';

interface Projectile {
    id: number;
    x: number; 
    y: number; 
    vx: number; 
    vy: number; 
    type: 'TRASH' | 'BONE';
    owner: 'PLAYER' | 'CPU'; 
    isBigBomb?: boolean;
    trail: {x: number, y: number}[]; 
    active: boolean;
}

interface HitEffect {
    id: number;
    x: number;
    y: number;
    text: string;
    color: string;
    age: number;
    scale?: number;
    type?: 'EXPLOSION' | 'CRIT' | 'NORMAL';
}

export const CatVsDog: React.FC<CatVsDogProps> = ({ onClose, userId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // --- Game Flow ---
  const [phase, setPhase] = useState<'SELECT_DIFFICULTY' | 'SELECT_CHAR' | 'PLAYING'>('SELECT_DIFFICULTY');
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');
  const [playerChar, setPlayerChar] = useState<Character>('CAT');
  
  // --- Gameplay ---
  const [gameState, setGameState] = useState<'IDLE'|'AIMING'|'PROJECTILE_FLYING'|'CPU_AIMING'|'GAME_OVER'>('IDLE');
  const [isPaused, setIsPaused] = useState(false);
  const [turn, setTurn] = useState<'PLAYER'|'CPU'>('PLAYER');
  const [wind, setWind] = useState(0); 
  const [playerHP, setPlayerHP] = useState(100);
  const [cpuHP, setCpuHP] = useState(100);
  const [winner, setWinner] = useState<'PLAYER'|'CPU'|null>(null);

  // --- Visuals ---
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [playerHurt, setPlayerHurt] = useState(false);
  const [cpuHurt, setCpuHurt] = useState(false);
  
  // --- Items ---
  const [items, setItems] = useState<Record<ItemType, number>>({ 'DOUBLE_SHOT': 2, 'BIG_BOMB': 2, 'HEAL': 1 });
  const [activePowerUp, setActivePowerUp] = useState<{doubleShot: boolean, bomb: boolean}>({ doubleShot: false, bomb: false });

  // --- Refs ---
  const projectilesRef = useRef<Projectile[]>([]);
  const requestRef = useRef<number>(0);
  const effectIdCounter = useRef(0);
  const projectileIdCounter = useRef(0);
  
  // Camera
  const cameraScale = useRef(1);
  const cameraOffset = useRef({ x: 0, y: 0 });

  // Controls
  const dragStart = useRef<{x: number, y: number}|null>(null);
  const dragCurrent = useRef<{x: number, y: number}|null>(null);

  const PLAYER_POS = { x: 100, y: 400 }; 
  const CPU_POS = { x: 700, y: 400 }; 
  const WALL_POS = { x: 400, y: 400, w: 30, h: 160 };

  useEffect(() => {
    if (phase === 'PLAYING') {
        resetRound();
    }
  }, [phase]);

  const selectDifficulty = (diff: Difficulty) => {
      setDifficulty(diff);
      setPhase('SELECT_CHAR');
      playSound('SCORE');
  };

  const startGame = (char: Character) => {
      setPlayerChar(char);
      setPhase('PLAYING');
      playSound('SCORE');
  };

  const resetRound = () => {
    setPlayerHP(100);
    setCpuHP(100);
    setWinner(null);
    setTurn('PLAYER');
    setGameState('IDLE');
    setItems({ 'DOUBLE_SHOT': 2, 'BIG_BOMB': 2, 'HEAL': 1 });
    setActivePowerUp({ doubleShot: false, bomb: false });
    changeWind();
    cameraScale.current = 1;
    cameraOffset.current = { x: 0, y: 0 };
    setHitEffects([]);
    setShakeIntensity(0);
    setPlayerHurt(false);
    setCpuHurt(false);
    projectilesRef.current = [];
  };

  const changeWind = () => {
    const range = difficulty === 'HARD' ? 3.5 : 2.0;
    const w = (Math.random() * range) - (range/2);
    setWind(w);
  };

  const useItem = (type: ItemType) => {
      if (turn !== 'PLAYER' || gameState !== 'IDLE' || items[type] <= 0) return;

      const newItems = { ...items };
      newItems[type]--;
      setItems(newItems);

      if (type === 'HEAL') {
          const healAmount = 30;
          setPlayerHP(prev => Math.min(100, prev + healAmount));
          addHitEffect(PLAYER_POS.x, PLAYER_POS.y - 50, `+${healAmount} HP`, 'green');
          playSound('HEAL');
      } else if (type === 'DOUBLE_SHOT') {
          setActivePowerUp(prev => ({ ...prev, doubleShot: true }));
          playSound('SCORE');
      } else if (type === 'BIG_BOMB') {
          setActivePowerUp(prev => ({ ...prev, bomb: true }));
          playSound('SCORE');
      }
  };

  const addHitEffect = (x: number, y: number, text: string, color: string, scale: number = 1, type: 'EXPLOSION' | 'CRIT' | 'NORMAL' = 'NORMAL') => {
      const id = effectIdCounter.current++;
      setHitEffects(prev => [...prev, { id, x, y, text, color, age: 0, scale, type }]);
  };

  // --- CONTROLS ---
  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return {x:0, y:0};
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'IDLE' || turn !== 'PLAYER') return;
    const pos = getCanvasPos(e);
    dragStart.current = pos;
    dragCurrent.current = pos;
    setGameState('AIMING');
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'AIMING' || !dragStart.current) return;
    dragCurrent.current = getCanvasPos(e);
  };

  const handlePointerUp = () => {
    if (gameState !== 'AIMING' || !dragStart.current || !dragCurrent.current) return;
    
    const start = dragStart.current;
    const current = dragCurrent.current;
    
    const dx = start.x - current.x;
    const dy = start.y - current.y;
    
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        setGameState('IDLE');
        dragStart.current = null;
        return;
    }

    const POWER_SCALE = 0.13; 
    const vx = dx * POWER_SCALE;
    const vy = dy * POWER_SCALE; 
    
    fireWeapon(
        PLAYER_POS.x + 20, 
        PLAYER_POS.y - 60, 
        vx, 
        vy, 
        playerChar === 'CAT' ? 'TRASH' : 'BONE', 
        'PLAYER', 
        activePowerUp
    );
    
    dragStart.current = null;
    dragCurrent.current = null;
  };

  const fireWeapon = (
      x: number, y: number, vx: number, vy: number, 
      type: 'TRASH'|'BONE', owner: 'PLAYER'|'CPU', 
      powerups: {doubleShot: boolean, bomb: boolean}
  ) => {
      projectilesRef.current = [];

      const addProj = (offsetX = 0, offsetY = 0, velXMod = 0, velYMod = 0) => {
          projectilesRef.current.push({
              id: projectileIdCounter.current++,
              x: x + offsetX,
              y: y + offsetY,
              vx: vx + velXMod,
              vy: vy + velYMod,
              type,
              owner,
              isBigBomb: powerups.bomb,
              trail: [],
              active: true
          });
      };

      addProj();
      playSound('THROW');

      if (powerups.doubleShot) {
          setTimeout(() => {
              const spread = owner === 'CPU' && difficulty === 'HARD' ? 0.2 : 1.5;
              addProj(0, 0, (Math.random()-0.5)*spread, (Math.random()-0.5)*spread);
              playSound('THROW');
          }, 150);
      }

      if (owner === 'PLAYER') {
          setActivePowerUp({ doubleShot: false, bomb: false });
      }

      setGameState('PROJECTILE_FLYING');
  };

  // --- CPU LOGIC ---
  
  // Analytically calculate the velocity needed to hit the player
  // This replaces the "simulate and guess" method which caused weird high arcs.
  const calculateStandardShot = (startX: number, startY: number, targetX: number, windVal: number) => {
      // 1. Determine a "Standard" flight time. 
      // A typical shot in this game takes about 60 to 90 frames to land.
      let flightTime = 80; 

      // If wind is blowing AGAINST the shot (Wind > 0, since CPU shoots Left which is negative),
      // we might need a bit more power/time, or less time to slice through.
      // Actually, standard physics logic:
      // x(t) = x0 + vx*t + 0.5 * windAcc * t^2
      // y(t) = y0 + vy*t + 0.5 * g * t^2
      
      // We want y(flightTime) = startY (approx, landing on ground).
      // vy = - (0.5 * g * t^2) / t = -0.5 * g * t
      let vy = -0.5 * GRAVITY * flightTime;

      // We want x(flightTime) = targetX.
      // targetX - startX = vx*t + 0.5 * windAcc * t^2
      // vx = (targetX - startX - 0.5 * windAcc * t^2) / t
      const windAcc = windVal * WIND_FACTOR;
      let vx = (targetX - startX - 0.5 * windAcc * flightTime * flightTime) / flightTime;

      // Sanity Check: If the wind is helping excessively (tailwind), 
      // the math might say "just drop it lightly". But that looks like a weak floaty toss.
      // CPU shoots Left, so VX should be negative.
      // If VX is too close to 0 (e.g. > -5), reduce flight time to force a harder, flatter throw.
      if (vx > -6) {
          flightTime = 50; // Faster shot
          vy = -0.5 * GRAVITY * flightTime;
          vx = (targetX - startX - 0.5 * windAcc * flightTime * flightTime) / flightTime;
      }

      // If VX is insanely fast (e.g. < -25) because of headwind, maybe arc it higher?
      // For now, let's just cap it so it doesn't break the game visuals.
      
      return { vx, vy };
  };

  const triggerCpuTurn = () => {
      setGameState('CPU_AIMING'); 
      
      const thinkTime = difficulty === 'HARD' ? 600 : 1200;

      setTimeout(() => {
          let useDouble = false;
          let useBomb = false;
          let didHeal = false;
          
          let itemChance = 0;
          if (difficulty === 'EASY') itemChance = 0.0;
          if (difficulty === 'NORMAL') itemChance = 0.15;
          if (difficulty === 'HARD') itemChance = 0.35; 

          if (cpuHP < 40 && Math.random() < itemChance) {
               setCpuHP(h => Math.min(100, h + 30));
               addHitEffect(CPU_POS.x, CPU_POS.y - 50, "+30 HP", "green");
               playSound('HEAL');
               didHeal = true;
          }

          if (!didHeal && Math.random() < itemChance) {
             if (difficulty === 'HARD') {
                 if (playerHP < 30) useDouble = true; 
                 else useBomb = true; 
             } else {
                 if (Math.random() > 0.5) useDouble = true;
                 else useBomb = true;
             }
          }

          const startX = CPU_POS.x - 20; 
          const startY = CPU_POS.y - 60;
          
          // Use the analytic solver for a "Normal" arc
          const perfectShot = calculateStandardShot(startX, startY, PLAYER_POS.x, wind);
          
          let finalVx = perfectShot.vx;
          let finalVy = perfectShot.vy;

          // Apply Human Error based on Difficulty
          if (difficulty === 'EASY') {
              // Big error
              finalVx += (Math.random() - 0.5) * 8; 
              finalVy += (Math.random() - 0.5) * 5;
          } else if (difficulty === 'NORMAL') {
              // Small error
              finalVx += (Math.random() - 0.5) * 3;
              finalVy += (Math.random() - 0.5) * 3;
          } else {
              // HARD: Tiny error (sniper)
              finalVx += (Math.random() - 0.5) * 0.5;
              finalVy += (Math.random() - 0.5) * 0.5;
          }

          if (useDouble) addHitEffect(CPU_POS.x, CPU_POS.y - 90, "DOUBLE SHOT!", "yellow", 1.2);
          if (useBomb) addHitEffect(CPU_POS.x, CPU_POS.y - 90, "BIG BOMB!", "red", 1.2);

          fireWeapon(startX, startY, finalVx, finalVy, playerChar === 'CAT' ? 'BONE' : 'TRASH', 'CPU', {doubleShot: useDouble, bomb: useBomb});

      }, thinkTime);
  };

  // --- GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || phase !== 'PLAYING') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = () => {
        if (isPaused) {
            requestRef.current = requestAnimationFrame(loop);
            return;
        }
        if (shakeIntensity > 0) setShakeIntensity(prev => Math.max(0, prev - 1));
        setHitEffects(prev => prev.filter(e => e.age < 90).map(e => ({...e, age: e.age + 1, y: e.y - 0.5})));

        if (gameState === 'PROJECTILE_FLYING') {
            let activeCount = 0;
            projectilesRef.current.forEach(p => {
                if (!p.active) return;
                activeCount++;
                p.vx += wind * WIND_FACTOR; 
                p.vy += GRAVITY;
                p.x += p.vx;
                p.y += p.vy;
                if (requestRef.current % 3 === 0) {
                     p.trail.push({x: p.x, y: p.y});
                     if (p.trail.length > 20) p.trail.shift();
                }
                checkCollision(p);
            });

            const focusProj = projectilesRef.current.find(p => p.active);
            if (focusProj) {
                const targetX = -focusProj.x + CANVAS_WIDTH / 2;
                const targetY = -focusProj.y + CANVAS_HEIGHT / 2;
                
                let targetScale = 1;
                if (focusProj.y < 0) targetScale = Math.max(0.6, 1 + (focusProj.y / 800));
                cameraScale.current += (targetScale - cameraScale.current) * 0.1;
                
                let desiredOffsetY = 0;
                if (focusProj.y < 100) desiredOffsetY = 150 - focusProj.y * 0.5;
                cameraOffset.current.y += (desiredOffsetY - cameraOffset.current.y) * 0.1;
                
                const desiredOffsetX = (CANVAS_WIDTH/2) - focusProj.x;
                const maxOffsetX = 200;
                const clampedOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, desiredOffsetX));
                cameraOffset.current.x += (clampedOffsetX - cameraOffset.current.x) * 0.1;
            }

            if (activeCount === 0 && projectilesRef.current.length > 0) {
                setTimeout(() => {
                    if (projectilesRef.current.every(p => !p.active)) switchTurn();
                }, 500);
            }
        } else {
            cameraScale.current += (1 - cameraScale.current) * 0.05;
            cameraOffset.current.x += (0 - cameraOffset.current.x) * 0.05;
            cameraOffset.current.y += (0 - cameraOffset.current.y) * 0.05;
        }

        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.save();
        if (shakeIntensity > 0) {
            ctx.translate((Math.random() - 0.5) * shakeIntensity, (Math.random() - 0.5) * shakeIntensity);
        }
        ctx.translate(CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
        ctx.scale(cameraScale.current, cameraScale.current);
        ctx.translate(-CANVAS_WIDTH/2, -CANVAS_HEIGHT/2);
        ctx.translate(cameraOffset.current.x, cameraOffset.current.y);

        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(-2000, -5000, 5000, 6000); 

        for(let i=0; i<20; i++) {
            const time = Date.now() / 1000;
            const speed = wind * 200; 
            const x = ((time * speed + i * 200) % 3000) - 1500;
            const y = 50 + Math.sin(x/150 + i) * 100;
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (wind * 30), y);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, 3 + Math.random()*2, 0, Math.PI*2);
            ctx.fill();
        }

        ctx.fillStyle = '#90EE90';
        ctx.fillRect(-2000, GROUND_Y, 5000, 2000);
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(WALL_POS.x - WALL_POS.w/2, GROUND_Y - WALL_POS.h, WALL_POS.w, WALL_POS.h);
        
        ctx.font = '60px Arial';
        ctx.textAlign = 'center';
        let pSprite = playerChar === 'CAT' ? '🐱' : '🐶';
        if (playerHurt) pSprite = playerChar === 'CAT' ? '😿' : '🤕';
        ctx.fillText(pSprite, PLAYER_POS.x, PLAYER_POS.y);
        
        let cSprite = playerChar === 'CAT' ? '🐶' : '🐱';
        if (cpuHurt) cSprite = playerChar === 'CAT' ? '🤕' : '😿';
        ctx.fillText(cSprite, CPU_POS.x, CPU_POS.y);

        if (activePowerUp.doubleShot) {
             ctx.font = 'bold 20px Fredoka';
             ctx.fillStyle = 'yellow';
             ctx.strokeStyle = 'black';
             ctx.lineWidth = 3;
             ctx.strokeText('⚡x2 SHOT', PLAYER_POS.x, PLAYER_POS.y - 70);
             ctx.fillText('⚡x2 SHOT', PLAYER_POS.x, PLAYER_POS.y - 70);
        }
        if (activePowerUp.bomb) {
             ctx.font = 'bold 20px Fredoka';
             ctx.fillStyle = 'red';
             ctx.strokeStyle = 'black';
             ctx.lineWidth = 3;
             ctx.strokeText('💣 BIG BOMB', PLAYER_POS.x, PLAYER_POS.y - 90);
             ctx.fillText('💣 BIG BOMB', PLAYER_POS.x, PLAYER_POS.y - 90);
        }

        projectilesRef.current.forEach(p => {
            if (!p.active) return;
            if (p.trail.length > 1) {
                ctx.beginPath();
                ctx.moveTo(p.trail[0].x, p.trail[0].y);
                for (let i = 1; i < p.trail.length; i++) ctx.lineTo(p.trail[i].x, p.trail[i].y);
                ctx.lineTo(p.x, p.y);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 4;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.atan2(p.vy, p.vx));
            ctx.font = p.isBigBomb ? '60px Arial' : '45px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let sprite = p.type === 'TRASH' ? '🥫' : '🦴';
            if (p.isBigBomb) sprite = '💣';
            ctx.fillText(sprite, 0, 0);
            ctx.restore();
        });

        hitEffects.forEach(effect => {
            ctx.save();
            const life = 1 - (effect.age / 90);
            let scale = (effect.scale || 1) * (1 + (1-life)*0.5);
            if (effect.type === 'EXPLOSION') { scale *= 1.5; ctx.shadowColor = 'orange'; ctx.shadowBlur = 20; }
            else if (effect.type === 'CRIT') { ctx.shadowColor = 'red'; ctx.shadowBlur = 10; ctx.translate((Math.random()-0.5)*5, (Math.random()-0.5)*5); }
            ctx.globalAlpha = life;
            ctx.translate(effect.x, effect.y);
            ctx.scale(scale, scale);
            ctx.fillStyle = effect.color;
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 4;
            ctx.font = '900 40px Fredoka';
            ctx.textAlign = 'center';
            ctx.lineJoin = 'round';
            ctx.strokeText(effect.text, 0, 0);
            ctx.fillText(effect.text, 0, 0);
            ctx.restore();
        });

        if (gameState === 'AIMING' && dragStart.current && dragCurrent.current) {
            const start = dragStart.current;
            const current = dragCurrent.current;
            const dx = start.x - current.x;
            const dy = start.y - current.y;
            const vx = dx * 0.13;
            const vy = dy * 0.13;
            ctx.beginPath();
            let simX = PLAYER_POS.x + 20;
            let simY = PLAYER_POS.y - 60;
            let simVx = vx;
            let simVy = vy;
            ctx.moveTo(simX, simY);
            for (let i = 0; i < 15; i++) {
                simX += simVx;
                simY += simVy;
                simVy += GRAVITY;
                simVx += wind * WIND_FACTOR; 
                ctx.lineTo(simX, simY);
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 10]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore(); 
        requestRef.current = requestAnimationFrame(loop);
    };
    requestRef.current = requestAnimationFrame(loop);
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, turn, wind, activePowerUp, hitEffects, shakeIntensity, playerHurt, cpuHurt, isPaused]);

  const checkCollision = (p: Projectile) => {
      let impact = false;
      let hitTarget: 'PLAYER' | 'CPU' | null = null;
      let hitGround = false;
      if (p.y > GROUND_Y) { impact = true; hitGround = true; }
      if (p.x > WALL_POS.x - WALL_POS.w/2 && p.x < WALL_POS.x + WALL_POS.w/2 && p.y > GROUND_Y - WALL_POS.h) { impact = true; }
      if (p.x < -400 || p.x > CANVAS_WIDTH + 400) { impact = true; }

      const hitRadius = p.isBigBomb ? 90 : 50; 
      const distCpu = Math.hypot(p.x - CPU_POS.x, p.y - (CPU_POS.y - 30));
      if (distCpu < hitRadius && p.owner !== 'CPU') { impact = true; hitTarget = 'CPU'; }
      const distPlayer = Math.hypot(p.x - PLAYER_POS.x, p.y - (PLAYER_POS.y - 30));
      if (distPlayer < hitRadius && p.owner !== 'PLAYER') { impact = true; hitTarget = 'PLAYER'; }

      if (hitGround && p.isBigBomb) {
           if (distCpu < 160 && p.owner !== 'CPU') { impact = true; hitTarget = 'CPU'; }
           if (distPlayer < 160 && p.owner !== 'PLAYER') { impact = true; hitTarget = 'PLAYER'; }
      }
      if (impact) handleImpact(hitTarget, p);
  };

  const handleImpact = (target: 'PLAYER'|'CPU'|null, p: Projectile) => {
      p.active = false; 
      setShakeIntensity(p.isBigBomb ? 25 : 12);
      let dmg = 15 + Math.floor(Math.random() * 5); 
      if (p.isBigBomb) dmg = Math.floor(dmg * 1.5);
      
      const effectType = p.isBigBomb ? 'EXPLOSION' : 'NORMAL';
      if (p.isBigBomb) playSound('EXPLOSION');
      else playSound('WHACK');

      if (target === 'CPU') {
          setCpuHurt(true);
          setTimeout(() => setCpuHurt(false), 1000);
          addHitEffect(CPU_POS.x, CPU_POS.y - 80, `-${dmg}`, 'red', 1, effectType);
          setCpuHP(prev => { const next = prev - dmg; if (next <= 0) setTimeout(() => handleWin('PLAYER'), 100); return next; });
      } else if (target === 'PLAYER') {
          setPlayerHurt(true);
          setTimeout(() => setPlayerHurt(false), 1000);
          addHitEffect(PLAYER_POS.x, PLAYER_POS.y - 80, `-${dmg}`, 'red', 1, effectType);
          setPlayerHP(prev => { const next = prev - dmg; if (next <= 0) setTimeout(() => handleWin('CPU'), 100); return next; });
      } else {
          addHitEffect(p.x, p.y - 20, "MISS", "gray", 0.8, 'NORMAL');
          playSound('BOUNCE');
      }
  };

  const switchTurn = () => {
      if (winner) return; 
      if (playerHP <= 0 || cpuHP <= 0) return;
      changeWind();
      if (turn === 'PLAYER') {
          setTurn('CPU');
          triggerCpuTurn();
      } else {
          setTurn('PLAYER');
          setGameState('IDLE');
      }
  };

  const handleWin = (who: 'PLAYER'|'CPU') => {
      setWinner(who);
      setGameState('GAME_OVER');
      if (who === 'PLAYER') {
          playSound('SCORE');
          if (userId) gameService.saveScore(userId, 'cat_vs_dog', 1);
      } else {
          playSound('BAD');
      }
  };

  // --- RENDER PHASES ---

  if (phase === 'SELECT_DIFFICULTY') {
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
           <div className="bg-brand-cream border-4 border-black rounded-2xl p-6 w-full max-w-md text-center space-y-6">
               <h2 className="text-3xl font-black text-brand-brown">Select Difficulty</h2>
               <div className="flex flex-col gap-4">
                   <button onClick={() => selectDifficulty('EASY')} className="bg-green-100 border-4 border-green-500 rounded-xl p-4 hover:scale-105 transition-transform flex items-center gap-4">
                       <div className="text-4xl">👶</div>
                       <div className="text-left">
                           <div className="font-black text-green-800 text-xl">EASY</div>
                           <div className="text-xs font-bold text-gray-500">Opponent is bad at aiming.</div>
                       </div>
                   </button>
                   <button onClick={() => selectDifficulty('NORMAL')} className="bg-blue-100 border-4 border-blue-500 rounded-xl p-4 hover:scale-105 transition-transform flex items-center gap-4">
                       <div className="text-4xl">🧑‍🎓</div>
                       <div className="text-left">
                           <div className="font-black text-blue-800 text-xl">NORMAL</div>
                           <div className="text-xs font-bold text-gray-500">Standard challenge.</div>
                       </div>
                   </button>
                   <button onClick={() => selectDifficulty('HARD')} className="bg-red-100 border-4 border-red-500 rounded-xl p-4 hover:scale-105 transition-transform flex items-center gap-4">
                       <div className="text-4xl">🤖</div>
                       <div className="text-left">
                           <div className="font-black text-red-800 text-xl">HARD</div>
                           <div className="text-xs font-bold text-gray-500">Super Smart AI. Physics God.</div>
                       </div>
                   </button>
               </div>
               <button onClick={onClose} className="text-gray-500 font-bold underline">Cancel</button>
           </div>
      </div>
    )
  }

  if (phase === 'SELECT_CHAR') {
      return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
             <div className="bg-brand-cream border-4 border-black rounded-2xl p-6 w-full max-w-md text-center space-y-6">
                 <h2 className="text-3xl font-black text-brand-brown">Choose Your Fighter</h2>
                 <div className="flex gap-4 justify-center">
                     <button onClick={() => startGame('CAT')} className="flex-1 bg-blue-100 border-4 border-blue-500 rounded-xl p-4 hover:scale-105 transition-transform">
                         <div className="text-6xl mb-2">🐱</div>
                         <div className="font-black text-blue-800">THE CAT</div>
                     </button>
                     <button onClick={() => startGame('DOG')} className="flex-1 bg-red-100 border-4 border-red-500 rounded-xl p-4 hover:scale-105 transition-transform">
                         <div className="text-6xl mb-2">🐶</div>
                         <div className="font-black text-red-800">THE DOG</div>
                     </button>
                 </div>
                 <button onClick={() => setPhase('SELECT_DIFFICULTY')} className="text-gray-500 font-bold underline">Back</button>
             </div>
        </div>
      )
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-2 w-full max-w-3xl border-4 border-black relative overflow-hidden flex flex-col">
        <button onClick={onClose} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 border-2 border-black font-bold z-20 w-8 h-8 flex items-center justify-center">X</button>

        {/* HUD */}
        <div className="flex justify-between items-center p-2 z-10 bg-white/50 backdrop-blur-sm border-b-2 border-gray-200">
             {/* Player */}
             <div className="flex flex-col w-1/3">
                 <div className="flex justify-between text-xs font-bold mb-1">
                     <span>YOU ({playerChar === 'CAT' ? '🐱' : '🐶'})</span>
                     <span>{playerHP} HP</span>
                 </div>
                 <div className="h-4 w-full bg-gray-300 rounded-full border border-black overflow-hidden">
                     <div className="h-full bg-green-500 transition-all duration-300" style={{width: `${playerHP}%`}}></div>
                 </div>
             </div>

             {/* Wind */}
             <div className="flex flex-col items-center w-1/3">
                 <div className="text-xs font-black text-gray-500 tracking-widest">WIND</div>
                 <div className="flex items-center gap-1 font-bold">
                     <span className="text-xl">{wind < 0 ? '⬅️' : '➡️'}</span>
                     <span>{Math.abs(Math.round(wind * 30))}</span>
                 </div>
                 <div className="text-[10px] font-bold text-gray-400 mt-1">{difficulty} MODE</div>
             </div>

             {/* CPU */}
             <div className="flex flex-col w-1/3 items-end">
                 <div className="flex justify-between w-full text-xs font-bold mb-1">
                     <span>{cpuHP} HP</span>
                     <span>CPU ({playerChar === 'CAT' ? '🐶' : '🐱'})</span>
                 </div>
                 <div className="h-4 w-full bg-gray-300 rounded-full border border-black overflow-hidden">
                     <div className="h-full bg-red-500 transition-all duration-300" style={{width: `${cpuHP}%`}}></div>
                 </div>
             </div>
        </div>
        
        <div 
            className="w-full flex-1 relative bg-[#87CEEB] touch-none select-none cursor-crosshair overflow-hidden"
            style={{
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTapHighlightColor: 'transparent'
            }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            onSelectStart={(e) => e.preventDefault()}
        >
             <canvas 
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="w-full h-full block object-contain"
             />

             {gameState !== 'GAME_OVER' && (
                 <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none transition-opacity duration-300" 
                      style={{ opacity: gameState === 'IDLE' || gameState === 'CPU_AIMING' ? 1 : 0 }}>
                    <div className={`px-4 py-1 rounded-full font-black text-white text-sm shadow border border-white ${turn === 'PLAYER' ? 'bg-blue-500' : 'bg-red-500'}`}>
                        {turn === 'PLAYER' ? "YOUR TURN" : "OPPONENT'S TURN"}
                    </div>
                 </div>
             )}
             
             {gameState === 'IDLE' && turn === 'PLAYER' && (
                 <div className="absolute bottom-10 left-10 pointer-events-none text-white/90 text-sm font-bold animate-pulse text-shadow-md">
                     Draft & Release to Shoot ↗
                 </div>
             )}
        </div>

        {/* Item Bar */}
        <div className="bg-gray-100 p-2 border-t-2 border-black flex justify-around items-center h-16 z-10">
            {turn === 'PLAYER' ? (
                <>
                <button onClick={() => useItem('DOUBLE_SHOT')} disabled={items['DOUBLE_SHOT'] === 0 || activePowerUp.doubleShot} className={`relative flex items-center gap-2 px-3 py-1 rounded-lg border-2 border-black font-bold text-xs ${activePowerUp.doubleShot ? 'bg-yellow-300' : 'bg-white hover:bg-yellow-50'} ${items['DOUBLE_SHOT'] === 0 && 'opacity-50 grayscale'}`}>
                    <span className="text-xl">⚡</span>
                    <div className="flex flex-col items-start leading-none">
                        <span>Double Shot</span>
                        <span className="text-[10px] text-gray-500">x{items['DOUBLE_SHOT']}</span>
                    </div>
                </button>
                <button onClick={() => useItem('BIG_BOMB')} disabled={items['BIG_BOMB'] === 0 || activePowerUp.bomb} className={`relative flex items-center gap-2 px-3 py-1 rounded-lg border-2 border-black font-bold text-xs ${activePowerUp.bomb ? 'bg-red-300' : 'bg-white hover:bg-red-50'} ${items['BIG_BOMB'] === 0 && 'opacity-50 grayscale'}`}>
                    <span className="text-xl">💣</span>
                    <div className="flex flex-col items-start leading-none">
                        <span>BigBomb</span>
                        <span className="text-[10px] text-gray-500">x{items['BIG_BOMB']}</span>
                    </div>
                </button>
                <button onClick={() => useItem('HEAL')} disabled={items['HEAL'] === 0} className={`relative flex items-center gap-2 px-3 py-1 rounded-lg border-2 border-black font-bold text-xs bg-white hover:bg-green-50 ${items['HEAL'] === 0 && 'opacity-50 grayscale'}`}>
                    <span className="text-xl">💊</span>
                    <div className="flex flex-col items-start leading-none">
                        <span>Heal</span>
                        <span className="text-[10px] text-gray-500">x{items['HEAL']}</span>
                    </div>
                </button>
                </>
            ) : (
                <div className="text-gray-400 font-bold italic text-sm">Thinking...</div>
            )}
        </div>

        {gameState === 'GAME_OVER' && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-2xl border-4 border-black text-center animate-bounce shadow-lg w-3/4">
                    <div className="text-6xl mb-2">{winner === 'PLAYER' ? '🏆' : '💀'}</div>
                    <h2 className="text-3xl font-black mb-2">{winner === 'PLAYER' ? 'YOU WON!' : 'YOU LOST!'}</h2>
                    <Button fullWidth onClick={resetRound}>REMATCH</Button>
                    <div className="h-2"></div>
                    <Button fullWidth variant="ghost" onClick={() => setPhase('SELECT_DIFFICULTY')}>CHANGE SETTINGS</Button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};