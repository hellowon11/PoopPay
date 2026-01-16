import React, { useEffect, useRef, useState } from 'react';
import { gameService } from '../../services/supabaseClient';
import { playSound } from '../../utils/audio';

interface DoodlePoopProps {
  onClose: () => void;
  userId?: string;
}

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 500;

// PHYSICS TWEAKS: Faster, snappier feel
const GRAVITY = 0.4; // Was 0.25
const JUMP_FORCE = -11; // Was -8.5
const SPRING_FORCE = -18;
const ROCKET_FORCE = -14; 
const PROPELLER_FORCE = -6;
const MOVE_ACCEL = 0.6;
const MAX_H_SPEED = 8;
const FRICTION = 0.90;

interface Platform {
    id: number;
    x: number;
    y: number;
    w: number;
    h: number;
    type: 'NORMAL' | 'MOVING' | 'SPRING' | 'FRAGILE';
    vx?: number; 
    broken?: boolean;
    hasItem?: 'CHILI' | 'PROPELLER' | 'SHIELD';
}

interface Enemy {
    id: number;
    x: number;
    y: number;
    startY: number; // For vertical movement
    type: 'FLY' | 'BLACK_HOLE' | 'PLUNGER';
    vx: number;
    vy: number;
    w: number;
    h: number;
}

interface Projectile {
    id: number;
    x: number;
    y: number;
    vy: number;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
    size: number;
}

export const DoodlePoop: React.FC<DoodlePoopProps> = ({ onClose, userId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAME_OVER'>('START');
  const [isPaused, setIsPaused] = useState(false);

  // Physics Refs
  const player = useRef({ 
      x: CANVAS_WIDTH/2, 
      y: 300, 
      vx: 0, 
      vy: 0, 
      w: 30, 
      h: 30, 
      faceRight: true, 
      rocketTimer: 0,
      propellerTimer: 0,
      hasShield: false
  });
  
  const platforms = useRef<Platform[]>([]);
  const enemies = useRef<Enemy[]>([]);
  const particles = useRef<Particle[]>([]);
  const projectiles = useRef<Projectile[]>([]);
  
  const cameraY = useRef(0);
  const maxScore = useRef(0);
  const platformIdCounter = useRef(0);
  const projectileIdCounter = useRef(0);
  
  // Input Refs
  const inputState = useRef({ left: false, right: false });

  const rafRef = useRef(0);

  useEffect(() => {
    if (userId) {
      gameService.getHighScore(userId, 'doodle_poop').then(setHighScore);
    }
  }, [userId]);

  const initGame = () => {
      setScore(0);
      maxScore.current = 0;
      cameraY.current = 0;
      setGameState('PLAYING');
      
      player.current = { 
          x: CANVAS_WIDTH/2 - 15, 
          y: 400, 
          vx: 0, 
          vy: JUMP_FORCE, 
          w: 30, 
          h: 30, 
          faceRight: true, 
          rocketTimer: 0, 
          propellerTimer: 0,
          hasShield: false 
      };
      particles.current = [];
      enemies.current = [];
      projectiles.current = [];
      
      // Generate Initial Platforms
      const p: Platform[] = [];
      p.push({ id: platformIdCounter.current++, x: CANVAS_WIDTH/2 - 40, y: 480, w: 80, h: 15, type: 'NORMAL' }); 
      
      let currentY = 480;
      for(let i=0; i<10; i++) {
          currentY -= 60 + Math.random() * 40; 
          addPlatform(p, currentY);
      }
      platforms.current = p;
      playSound('JUMP');
  };

  const addPlatform = (list: Platform[], yPos: number) => {
      const w = 60 + Math.random() * 20;
      const x = Math.random() * (CANVAS_WIDTH - w);
      
      let type: 'NORMAL' | 'MOVING' | 'SPRING' | 'FRAGILE' = 'NORMAL';
      let hasItem: 'CHILI' | 'PROPELLER' | 'SHIELD' | undefined = undefined;

      const difficulty = Math.abs(yPos);

      // Difficulty Scaling
      if (difficulty > 1000 && Math.random() > 0.8) type = 'MOVING';
      if (difficulty > 500 && Math.random() > 0.85) type = 'FRAGILE';
      if (Math.random() > 0.9) type = 'SPRING';

      // Item Spawning
      if (type === 'NORMAL') {
          const rand = Math.random();
          if (rand > 0.97) hasItem = 'CHILI';
          else if (rand > 0.95) hasItem = 'PROPELLER';
          else if (rand > 0.93) hasItem = 'SHIELD';
      }

      // Enemy Spawning - Improved logic for better gameplay with increased frequency at higher difficulty
      // Base spawn chance increases with difficulty
      let spawnChance = 0.93;
      if (difficulty > 2000) spawnChance = 0.88; // More frequent at high difficulty
      if (difficulty > 3000) spawnChance = 0.83; // Even more frequent at very high difficulty
      if (difficulty > 4000) spawnChance = 0.78; // Very frequent at extreme difficulty
      
      if (difficulty > 800 && Math.random() > spawnChance) {
          // Reduced black hole spawn rate and only at very high difficulty
          const isBlackHole = difficulty > 2500 && Math.random() > 0.85; // Only spawn at very high difficulty, less frequent
          const isPlunger = difficulty > 1500 && Math.random() > 0.6; // Vertical moving enemy
          
          let enemyType: 'FLY' | 'BLACK_HOLE' | 'PLUNGER' = 'FLY';
          if (isBlackHole) enemyType = 'BLACK_HOLE';
          else if (isPlunger) enemyType = 'PLUNGER';

          const platformCenterX = x + w / 2;
          const platformLeft = x;
          const platformRight = x + w;
          let enemyX = Math.random() * (CANVAS_WIDTH - 40);
          let enemyY = yPos - 80 - Math.random() * 50;
          
          // For black holes, ensure they spawn in safe positions
          if (enemyType === 'BLACK_HOLE') {
              // Always spawn black holes on the sides, never blocking the platform directly
              // Spawn on left side (20% of screen width) or right side (20% of screen width)
              const side = Math.random() > 0.5;
              if (side) {
                  // Left side
                  enemyX = Math.random() * (CANVAS_WIDTH * 0.2);
              } else {
                  // Right side
                  enemyX = CANVAS_WIDTH * 0.8 + Math.random() * (CANVAS_WIDTH * 0.2 - 40);
              }
              
              // Ensure minimum distance from platform edges
              const minDistance = 80;
              if (enemyX < platformRight + minDistance && enemyX + 40 > platformLeft - minDistance) {
                  // Too close to platform, move to opposite side
                  if (enemyX < CANVAS_WIDTH / 2) {
                      enemyX = CANVAS_WIDTH * 0.8 + Math.random() * (CANVAS_WIDTH * 0.2 - 40);
                  } else {
                      enemyX = Math.random() * (CANVAS_WIDTH * 0.2);
                  }
              }
          } else if (enemyType === 'FLY' || enemyType === 'PLUNGER') {
              // For flies and plungers, spawn them in positions that don't directly block the platform
              // Prefer spawning on the sides or above the platform, but not directly on it
              const spawnZone = Math.random();
              
              if (spawnZone < 0.3) {
                  // Left side (30% chance)
                  enemyX = Math.random() * Math.max(0, platformLeft - 40);
              } else if (spawnZone < 0.6) {
                  // Right side (30% chance)
                  enemyX = Math.min(CANVAS_WIDTH - 40, platformRight + 20) + Math.random() * (CANVAS_WIDTH - Math.min(CANVAS_WIDTH - 40, platformRight + 20) - 40);
              } else {
                  // Above platform but offset (40% chance)
                  const offset = (Math.random() - 0.5) * 60; // Random offset from center
                  enemyX = platformCenterX + offset;
                  // Clamp to screen bounds
                  enemyX = Math.max(20, Math.min(CANVAS_WIDTH - 60, enemyX));
                  
                  // Ensure it's not directly on the platform
                  if (enemyX >= platformLeft - 20 && enemyX <= platformRight + 20) {
                      // Too close, move to side
                      if (enemyX < platformCenterX) {
                          enemyX = Math.max(20, platformLeft - 40 - Math.random() * 20);
                      } else {
                          enemyX = Math.min(CANVAS_WIDTH - 60, platformRight + 20 + Math.random() * 20);
                      }
                  }
              }
          }

          enemies.current.push({
              id: Math.random(),
              x: enemyX,
              y: enemyY,
              startY: enemyY,
              type: enemyType,
              vx: enemyType === 'BLACK_HOLE' ? 0 : (Math.random() > 0.5 ? 1.5 : -1.5),
              vy: enemyType === 'PLUNGER' ? 2 : 0,
              w: enemyType === 'BLACK_HOLE' ? 40 : 30,
              h: enemyType === 'BLACK_HOLE' ? 40 : 30
          });
      }

      list.push({ 
          id: platformIdCounter.current++,
          x, 
          y: yPos, 
          w, 
          h: 15, 
          type,
          vx: type === 'MOVING' ? (Math.random() > 0.5 ? 2 : -2) : 0,
          hasItem
      });
  };

  const createParticles = (x: number, y: number, color: string, count: number = 5, speed: number = 4) => {
      for(let i=0; i<count; i++) {
          particles.current.push({
              x, y,
              vx: (Math.random() - 0.5) * speed,
              vy: (Math.random() - 0.5) * speed,
              life: 1.0,
              color,
              size: Math.random() * 4 + 2
          });
      }
  };

  const gameOver = () => {
      setGameState('GAME_OVER');
      playSound('CRASH');
      if (userId && maxScore.current > 0) {
          gameService.saveScore(userId, 'doodle_poop', Math.floor(maxScore.current));
          if (maxScore.current > highScore) setHighScore(Math.floor(maxScore.current));
      }
  };

  // Input Handling - Mobile swipe for one-handed control
  const touchStartRef = useRef<{x: number, y: number} | null>(null);
  
  const handleTouchStart = (e: React.TouchEvent) => {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      e.preventDefault();
      
      const t = e.touches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      
      // Swipe up = shoot
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 30 && dy < 0) {
          // Upward swipe detected - shoot
          shootProjectile();
          touchStartRef.current = { x: t.clientX, y: t.clientY }; // Reset start position to prevent multiple shots
          return;
      }
      
      // Swipe right = jump right, Swipe left = jump left
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20) {
          if (dx > 0) {
              // Swipe right - jump right
              inputState.current.right = true;
              inputState.current.left = false;
          } else {
              // Swipe left - jump left
              inputState.current.left = true;
              inputState.current.right = false;
          }
      }
  };
  
  const handleTouchEnd = () => {
      touchStartRef.current = null;
      inputState.current.left = false;
      inputState.current.right = false;
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Movement Zones (Full screen for mouse - no shooting zone)
      if (x < rect.width / 2) {
          inputState.current.left = true;
          inputState.current.right = false;
      } else {
          inputState.current.right = true;
          inputState.current.left = false;
      }
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
      // For desktop, we can detect upward mouse movement for shooting
      if (e.buttons === 1) {
          const rect = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - rect.top;
          // If mouse is in top 30% and moving up, shoot
          if (y < rect.height * 0.3) {
              shootProjectile();
          }
      }
  };
  
  const clearInput = () => {
      inputState.current.left = false;
      inputState.current.right = false;
  };

  const shootProjectile = () => {
      if (gameState !== 'PLAYING') return;
      // Limit fire rate slightly? Nah, let 'em spam.
      projectiles.current.push({
          id: projectileIdCounter.current++,
          x: player.current.x + 15,
          y: player.current.y,
          vy: -12
      });
      playSound('THROW');
  };

  // Helper to ensure a safe landing platform exists
  const ensureSafetyPlatform = () => {
      const safeY = player.current.y + 120; // Spawn reasonably below the player
      // Center the platform under player, but clamp to screen edges
      let safeX = player.current.x - 25; 
      if (safeX < 0) safeX = 0;
      if (safeX > CANVAS_WIDTH - 80) safeX = CANVAS_WIDTH - 80;

      platforms.current.push({
          id: platformIdCounter.current++,
          x: safeX,
          y: safeY,
          w: 80, // Wide, safe platform
          h: 15,
          type: 'NORMAL', // Guaranteed normal
          vx: 0
      });
  };

  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const loop = () => {
          if (gameState !== 'PLAYING' || isPaused) return;

          // 1. Player Physics
          if (inputState.current.left) {
              player.current.vx -= MOVE_ACCEL;
              player.current.faceRight = false;
          }
          if (inputState.current.right) {
              player.current.vx += MOVE_ACCEL;
              player.current.faceRight = true;
          }
          
          player.current.vx *= FRICTION;
          if (player.current.vx > MAX_H_SPEED) player.current.vx = MAX_H_SPEED;
          if (player.current.vx < -MAX_H_SPEED) player.current.vx = -MAX_H_SPEED;

          // FLYING LOGIC (Rocket / Propeller)
          if (player.current.rocketTimer > 0) {
              player.current.rocketTimer--;
              player.current.vy = ROCKET_FORCE;
              // Rocket flames
              if (Math.random() > 0.5) {
                  createParticles(player.current.x + 15, player.current.y + 30, '#FF4500', 2, 2);
                  createParticles(player.current.x + 15, player.current.y + 30, '#FFFF00', 1, 2);
              }
              
              // FORCE SPAWN SAFE PLATFORM WHEN ENDING
              if (player.current.rocketTimer === 1) {
                  player.current.vy = -5;
                  player.current.vx = 0; // Stop horizontal movement so they drop straight down
                  ensureSafetyPlatform();
              }
          } 
          else if (player.current.propellerTimer > 0) {
              player.current.propellerTimer--;
              player.current.vy = PROPELLER_FORCE; // Slower ascent
              
              // FORCE SPAWN SAFE PLATFORM WHEN ENDING
              if (player.current.propellerTimer === 1) {
                  player.current.vy = -3;
                  player.current.vx = 0; // Stop horizontal movement
                  ensureSafetyPlatform();
              }
          } 
          else {
              player.current.vy += GRAVITY;
          }
          
          player.current.x += player.current.vx;
          player.current.y += player.current.vy;

          // SCREEN WRAPPING
          if (player.current.x < -player.current.w/2) {
              player.current.x = CANVAS_WIDTH - player.current.w/2;
          } else if (player.current.x > CANVAS_WIDTH - player.current.w/2) {
              player.current.x = -player.current.w/2;
          }

          // 2. Camera Logic
          const targetCamY = player.current.y - 250;
          if (targetCamY < cameraY.current) {
              cameraY.current += (targetCamY - cameraY.current) * 0.1; // Smooth camera
              const heightScore = Math.floor(Math.abs(cameraY.current / 10));
              if (heightScore > maxScore.current) {
                  maxScore.current = heightScore;
                  setScore(heightScore);
              }
          }

          // 3. Projectiles
          projectiles.current.forEach(p => p.y += p.vy);
          projectiles.current = projectiles.current.filter(p => p.y > cameraY.current - 100);

          // 4. Entity Logic
          const playerBottom = player.current.y + player.current.h;
          const playerCenterX = player.current.x + player.current.w/2;
          const playerCenterY = player.current.y + player.current.h/2;
          const isFlying = player.current.rocketTimer > 0 || player.current.propellerTimer > 0;

          // Platforms
          platforms.current.forEach(p => {
              if (p.broken) return;

              // Move
              if (p.type === 'MOVING') {
                  p.x += (p.vx || 0);
                  if (p.x < 0 || p.x + p.w > CANVAS_WIDTH) p.vx = -(p.vx || 0);
              }

              // Landing Logic
              if (player.current.vy > 0 && !isFlying) {
                  const withinX = player.current.x + player.current.w > p.x + 5 && player.current.x < p.x + p.w - 5;
                  const withinY = playerBottom > p.y && playerBottom < p.y + p.h + 20; // Forgiving hitbox

                  if (withinX && withinY) {
                      if (p.type === 'SPRING') {
                          player.current.vy = SPRING_FORCE;
                          playSound('BOUNCE');
                          createParticles(p.x + p.w/2, p.y, '#FFD700', 8);
                      } else if (p.type === 'FRAGILE') {
                          player.current.vy = JUMP_FORCE;
                          playSound('CRASH'); 
                          p.broken = true; 
                          createParticles(p.x + p.w/2, p.y, '#EEE', 6);
                      } else {
                          player.current.vy = JUMP_FORCE;
                          playSound('JUMP');
                          createParticles(player.current.x + 15, playerBottom, '#fff', 2);
                      }
                  }
              }

              // Item Collision
              if (p.hasItem && !p.broken) {
                   const itemX = p.x + p.w/2;
                   const itemY = p.y - 15;
                   const dist = Math.hypot(playerCenterX - itemX, playerCenterY - itemY);
                   if (dist < 35) {
                       if (p.hasItem === 'CHILI') {
                           player.current.rocketTimer = 180; 
                           playSound('EXPLOSION'); 
                           createParticles(itemX, itemY, 'red', 10, 5);
                       } else if (p.hasItem === 'PROPELLER') {
                           player.current.propellerTimer = 300; // 5 seconds
                           playSound('SCORE');
                           createParticles(itemX, itemY, 'blue', 10, 3);
                       } else if (p.hasItem === 'SHIELD') {
                           player.current.hasShield = true;
                           playSound('HEAL');
                           createParticles(itemX, itemY, 'cyan', 15, 4);
                       }
                       p.hasItem = undefined;
                   }
              }
          });

          // Enemies
          enemies.current.forEach(e => {
              // Move enemies
              if (e.type === 'FLY') {
                  e.x += e.vx;
                  if (e.x < 0 || e.x > CANVAS_WIDTH - e.w) e.vx *= -1;
              } else if (e.type === 'PLUNGER') {
                  e.y += e.vy;
                  if (Math.abs(e.y - e.startY) > 100) e.vy *= -1; // Bob up and down 100px
              }

              // Projectile Collision
              projectiles.current.forEach(proj => {
                  const dx = proj.x - (e.x + e.w/2);
                  const dy = proj.y - (e.y + e.h/2);
                  if (Math.hypot(dx, dy) < e.w) {
                      // Kill enemy
                      enemies.current = enemies.current.filter(en => en.id !== e.id);
                      projectiles.current = projectiles.current.filter(pr => pr.id !== proj.id);
                      playSound('WHACK');
                      createParticles(e.x + e.w/2, e.y + e.h/2, e.type === 'BLACK_HOLE' ? 'purple' : 'green', 15);
                  }
              });

              // Player Collision
              const dist = Math.hypot(playerCenterX - (e.x + e.w/2), playerCenterY - (e.y + e.h/2));
              if (dist < (e.w/2 + 15)) {
                  if (isFlying) {
                      // Kill enemy if flying
                      enemies.current = enemies.current.filter(en => en.id !== e.id);
                      playSound('WHACK');
                      createParticles(e.x + e.w/2, e.y + e.h/2, 'black', 10);
                  } else if (player.current.vy > 0 && playerBottom < e.y + e.h/2 && e.type !== 'BLACK_HOLE') {
                       // Jump on head (Except black hole)
                       player.current.vy = JUMP_FORCE;
                       enemies.current = enemies.current.filter(en => en.id !== e.id);
                       playSound('WHACK');
                       createParticles(e.x + e.w/2, e.y + e.h/2, 'green', 10);
                  } else {
                      // Check Shield
                      if (player.current.hasShield && e.type !== 'BLACK_HOLE') {
                           player.current.hasShield = false; // Lose shield
                           player.current.vy = JUMP_FORCE; // Bounce away
                           playSound('BOUNCE'); // Shield pop sound
                           createParticles(playerCenterX, playerCenterY, 'cyan', 20, 8); // Shield break effect
                           // Knockback enemy? Nah, just bounce player.
                      } else {
                           // Die
                           gameOver();
                      }
                  }
              }
          });

          // Recycle
          platforms.current = platforms.current.filter(p => !p.broken && p.y < cameraY.current + CANVAS_HEIGHT + 50);
          enemies.current = enemies.current.filter(e => e.y < cameraY.current + CANVAS_HEIGHT + 50);

          // Generate
          const highestPlatform = platforms.current.reduce((prev, curr) => (curr.y < prev.y ? curr : prev), platforms.current[0]);
          if (highestPlatform && highestPlatform.y > cameraY.current - 100) {
              const gap = 70 + Math.random() * 60; 
              addPlatform(platforms.current, highestPlatform.y - gap);
          }

          if (player.current.y > cameraY.current + CANVAS_HEIGHT) {
              gameOver();
          }

          // 5. Drawing
          
          // FIX FLICKERING: Force reset alpha state
          ctx.globalAlpha = 1.0;
          ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          
          // Background
          ctx.fillStyle = '#f0f8ff';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          
          // Grid
          ctx.strokeStyle = '#e0efff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for(let i=0; i<CANVAS_WIDTH; i+=40) { ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); }
          for(let i=0; i<CANVAS_HEIGHT; i+=40) { ctx.moveTo(0, i); ctx.lineTo(CANVAS_WIDTH, i); }
          ctx.stroke();

          ctx.save();
          ctx.translate(0, -cameraY.current);

          // Draw Platforms
          platforms.current.forEach(p => {
              if (p.broken) return;

              if (p.type === 'FRAGILE') {
                   ctx.fillStyle = '#FFF';
                   ctx.fillRect(p.x, p.y, p.w, p.h);
                   ctx.strokeStyle = '#CCC';
                   ctx.beginPath(); 
                   ctx.moveTo(p.x + 5, p.y); ctx.lineTo(p.x + 10, p.y+15);
                   ctx.moveTo(p.x + p.w - 5, p.y); ctx.lineTo(p.x + p.w - 10, p.y+15);
                   ctx.stroke();
              } else {
                  ctx.fillStyle = p.type === 'MOVING' ? '#4682B4' : '#8B4513';
                  ctx.fillRect(p.x, p.y, p.w, p.h);
                  ctx.fillStyle = 'rgba(255,255,255,0.2)'; 
                  ctx.fillRect(p.x, p.y, p.w, 4);
              }

              if (p.type === 'SPRING') {
                  ctx.fillStyle = 'red';
                  ctx.fillRect(p.x + p.w/2 - 10, p.y - 10, 20, 10);
              }

              if (p.hasItem) {
                  ctx.font = '24px Arial';
                  ctx.textAlign = 'center';
                  let itemEmoji = '❓';
                  if (p.hasItem === 'CHILI') itemEmoji = '🌶️';
                  if (p.hasItem === 'PROPELLER') itemEmoji = '🚁';
                  if (p.hasItem === 'SHIELD') itemEmoji = '🧼';
                  ctx.fillText(itemEmoji, p.x + p.w/2, p.y - 5);
              }
          });

          // Draw Enemies
          enemies.current.forEach(e => {
              ctx.font = e.type === 'BLACK_HOLE' ? '40px Arial' : '30px Arial';
              ctx.textAlign = 'center';
              let sprite = '🪰';
              if (e.type === 'BLACK_HOLE') sprite = '⚫';
              if (e.type === 'PLUNGER') sprite = '🪠';
              
              // Spin effect for black hole
              if (e.type === 'BLACK_HOLE') {
                  ctx.save();
                  ctx.translate(e.x + e.w/2, e.y + e.h/2);
                  ctx.rotate(Date.now() / 200);
                  ctx.fillText(sprite, 0, 0);
                  ctx.restore();
              } else {
                  ctx.fillText(sprite, e.x + e.w/2, e.y + e.h/2);
              }
          });

          // Draw Projectiles
          ctx.fillStyle = '#8B4513';
          projectiles.current.forEach(p => {
              ctx.beginPath();
              ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
              ctx.fill();
          });

          // Draw Particles
          particles.current.forEach(p => {
              p.life -= 0.05;
              p.x += p.vx;
              p.y += p.vy;
              
              ctx.save();
              ctx.globalAlpha = Math.max(0, p.life);
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
              ctx.fill();
              ctx.restore();
          });
          particles.current = particles.current.filter(p => p.life > 0);

          // Draw Player
          // Force reset alpha again just in case
          ctx.globalAlpha = 1.0; 
          
          const px = player.current.x;
          const py = player.current.y;
          
          ctx.save();
          ctx.translate(px + 15, py + 15);
          if (!player.current.faceRight) ctx.scale(-1, 1);
          
          // Jitter if powered up
          if (isFlying) {
              ctx.translate((Math.random()-0.5)*2, (Math.random()-0.5)*2);
          }

          const stretch = 1 + Math.abs(player.current.vy) * 0.02;
          const squash = 1 / stretch;
          ctx.scale(squash, stretch);

          ctx.font = '30px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Visuals
          if (player.current.rocketTimer > 0) {
              ctx.fillText('💩', 0, 0);
              ctx.font = '20px Arial';
              ctx.fillText('🔥', 0, 20); 
          } else if (player.current.propellerTimer > 0) {
              ctx.fillText('💩', 0, 0);
              ctx.font = '24px Arial';
              // Rotating propeller
              ctx.save();
              ctx.translate(0, -25);
              if (Date.now() % 100 < 50) ctx.scale(-1, 1); // Cheesy spin animation
              ctx.fillText('🚁', 0, 0);
              ctx.restore();
          } else {
              ctx.fillText('💩', 0, 0);
          }
          
          // Draw Shield
          if (player.current.hasShield) {
              ctx.beginPath();
              ctx.arc(0, 0, 25, 0, Math.PI*2);
              ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
              ctx.fill();
              ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
              ctx.lineWidth = 2;
              ctx.stroke();
          }
          
          ctx.restore();

          // Screen Wrap Hint (Fixed flickering logic)
          // Instead of changing globalAlpha which can be buggy if not restored,
          // we just draw a lighter color or use safe restore.
          ctx.save();
          ctx.globalAlpha = 0.5; // Safe here because of restore()
          if (px < 0) {
              ctx.font = '30px Arial';
              ctx.fillText('💩', px + CANVAS_WIDTH + 15, py + 15);
          } else if (px + 30 > CANVAS_WIDTH) {
              ctx.font = '30px Arial';
              ctx.fillText('💩', px - CANVAS_WIDTH + 15, py + 15);
          }
          ctx.restore();

          ctx.restore(); // End camera transform

          // HUD - Moved right for mobile visibility
          ctx.fillStyle = 'black';
          ctx.font = '900 24px Fredoka';
          ctx.fillText(`${Math.floor(maxScore.current)}`, CANVAS_WIDTH - 100, 30);
          
          if (player.current.rocketTimer > 0) {
              ctx.fillStyle = 'red';
              ctx.font = 'bold 20px Fredoka';
              ctx.fillText("FART TURBO!", CANVAS_WIDTH - 120, 60);
          }
          if (player.current.propellerTimer > 0) {
              ctx.fillStyle = 'blue';
              ctx.font = 'bold 20px Fredoka';
              ctx.fillText("PROPELLER", CANVAS_WIDTH - 120, 60);
          }
          if (player.current.hasShield) {
              ctx.fillStyle = 'cyan';
              ctx.font = 'bold 20px Fredoka';
              ctx.fillText("SHIELD", CANVAS_WIDTH - 100, player.current.rocketTimer > 0 || player.current.propellerTimer > 0 ? 85 : 60);
          }

          rafRef.current = requestAnimationFrame(loop);
      };

      if (gameState === 'PLAYING' && !isPaused) {
          rafRef.current = requestAnimationFrame(loop);
      } else {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
      }
      return () => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
  }, [gameState, isPaused]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-brand-cream rounded-2xl w-full max-w-sm border-4 border-black relative overflow-hidden flex flex-col p-4 h-[85vh]">
         <div className="absolute top-2 right-2 flex gap-2 z-30">
           {gameState === 'PLAYING' && (
             <button onClick={() => setIsPaused(!isPaused)} className="bg-yellow-500 text-white rounded-full p-2 border-2 border-black font-bold">
               {isPaused ? '▶' : '⏸'}
             </button>
           )}
           <button onClick={onClose} className="bg-red-500 text-white rounded-full p-2 border-2 border-black font-bold">X</button>
         </div>
         
         <div className="flex justify-between items-center mb-2">
             <h2 className="text-2xl font-black text-brand-brown">Doodle Poop</h2>
             <div className="text-xs font-bold text-gray-500">BEST: {highScore}</div>
         </div>

         <div 
            className="flex-1 bg-[#f0f8ff] border-4 border-black relative rounded-lg overflow-hidden touch-none select-none"
            style={{
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTapHighlightColor: 'transparent'
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={clearInput}
            onMouseLeave={clearInput}
            onContextMenu={(e) => e.preventDefault()}
            onSelectStart={(e) => e.preventDefault()}
         >
             <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="w-full h-full block object-cover" />
             
             {gameState !== 'PLAYING' && (
                 <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm">
                     <div className="bg-white p-6 text-center rounded-xl border-4 border-black animate-bounce shadow-xl">
                         <div className="text-6xl mb-2">{gameState === 'START' ? '🚀' : '🚽'}</div>
                         <div className="font-black text-xl mb-4">{gameState === 'START' ? 'READY TO CLIMB?' : 'FLUSHED!'}</div>
                         {gameState === 'GAME_OVER' && <div className="text-3xl font-black mb-4 text-brand-blue">{Math.floor(maxScore.current)}</div>}
                         <button onClick={initGame} className="bg-brand-yellow px-8 py-3 rounded-xl border-2 border-black font-black text-lg hover:scale-105 transition-transform">
                             {gameState === 'START' ? 'PLAY' : 'RETRY'}
                         </button>
                     </div>
                 </div>
             )}
             
             {/* Controls Overlay Hint */}
             {gameState === 'PLAYING' && (
                 <>
                    {/* Shoot Zone Hint */}
                    <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none opacity-30">
                         <span className="bg-black text-white px-2 py-1 rounded text-[10px] font-bold">SWIPE UP TO SHOOT</span>
                    </div>
                    {/* Move Zone Hint */}
                    {maxScore.current < 20 && (
                        <div className="absolute bottom-10 left-0 right-0 flex justify-between px-8 pointer-events-none opacity-50">
                            <div className="animate-pulse text-4xl">👈</div>
                            <div className="animate-pulse text-4xl">👉</div>
                        </div>
                    )}
                 </>
             )}
         </div>
      </div>
    </div>
  );
};