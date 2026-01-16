import React, { useEffect, useRef, useState } from 'react';
import { gameService } from '../../services/supabaseClient';
import { Button } from '../Button';
import { playSound } from '../../utils/audio';

interface PoopBreakerProps {
  onClose: () => void;
  userId?: string;
}

const CANVAS_WIDTH = 350;
const CANVAS_HEIGHT = 500;
const DEFAULT_PADDLE_WIDTH = 80;
const PADDLE_HEIGHT = 15;
const BALL_RADIUS = 10; // Increased from 6 for better visibility and gameplay
const BRICK_ROWS = 6;
const BRICK_COLS = 6;

// DIFFICULTY TWEAKS
const BASE_SPEED = 4.2; // Increased for faster poop speed
const LEVEL_SPEED_INC = 0.05; 

interface Ball {
    x: number;
    y: number;
    dx: number;
    dy: number;
    active: boolean;
    attached?: boolean; // For sticky powerup
    attachedOffset?: number;
    isBig?: boolean; // For big ball powerup
}

interface Bullet {
    x: number;
    y: number;
    dy: number;
    active: boolean;
}

interface Brick {
    x: number;
    y: number;
    w: number;
    h: number;
    active: boolean;
    type: 'TOILET' | 'PAPER' | 'EXPLOSIVE' | 'GOLDEN' | 'STONE';
    hp: number;
    maxHp: number;
}

interface Particle {
    x: number;
    y: number;
    dx: number;
    dy: number;
    life: number;
    color: string;
    size: number;
}

interface PowerUp {
    x: number;
    y: number;
    dy: number;
    active: boolean;
    type: 'MULTI' | 'GROW' | 'LASER' | 'STICKY' | 'BIG' | 'SPEED_UP';
}

export const PoopBreaker: React.FC<PoopBreakerProps> = ({ onClose, userId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'LEVEL_COMPLETE' | 'GAME_OVER'>('START');
  const [isPaused, setIsPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);
  
  // Game Entities Refs (Mutated for performance)
  const paddleX = useRef(CANVAS_WIDTH / 2 - DEFAULT_PADDLE_WIDTH / 2);
  const paddleWidthRef = useRef(DEFAULT_PADDLE_WIDTH);
  const paddleTimerRef = useRef(0);
  const laserTimerRef = useRef(0);
  const stickyTimerRef = useRef(0);
  const bigBallTimerRef = useRef(0);
  const speedUpTimerRef = useRef(0);
  
  const balls = useRef<Ball[]>([]);
  const bullets = useRef<Bullet[]>([]);
  const bricks = useRef<Brick[]>([]);
  const particles = useRef<Particle[]>([]);
  const powerUps = useRef<PowerUp[]>([]);
  const animationRef = useRef<number>(0);
  const shakeRef = useRef(0);
  const frameRef = useRef(0);
  const speedMultiplierRef = useRef(1.0);
  
  // BUG FIX: Lock to prevent multiple level completions
  const isLevelCompleting = useRef(false);
  // Lock to prevent multiple life loss handling
  const isLosingLife = useRef(false);

  useEffect(() => {
    if (userId) {
      gameService.getHighScore(userId, 'poop_breaker').then(setHighScore);
    }
  }, [userId]);

  const startGame = () => {
      setScore(0);
      setLevel(1);
      setLives(3);
      isLosingLife.current = false; // Reset life loss flag
      startLevel(1);
  };

  const startLevel = (lvl: number) => {
      setGameState('PLAYING');
      paddleWidthRef.current = DEFAULT_PADDLE_WIDTH;
      paddleX.current = CANVAS_WIDTH / 2 - DEFAULT_PADDLE_WIDTH / 2;
      shakeRef.current = 0;
      paddleTimerRef.current = 0;
      laserTimerRef.current = 0;
      stickyTimerRef.current = 0;
      bigBallTimerRef.current = 0;
      speedUpTimerRef.current = 0;
      frameRef.current = 0;
      isLevelCompleting.current = false;
      isLosingLife.current = false; // Reset life loss flag
      
      speedMultiplierRef.current = 1.0 + ((lvl - 1) * LEVEL_SPEED_INC);

      playSound('JUMP');
      
      // Init Balls - Start attached to paddle, need to tap to launch
      const ballRadius = BALL_RADIUS;
      balls.current = [{
          x: paddleX.current + paddleWidthRef.current / 2,
          y: CANVAS_HEIGHT - PADDLE_HEIGHT - 10 - ballRadius,
          dx: 0,
          dy: 0,
          active: true,
          attached: true,
          attachedOffset: paddleWidthRef.current / 2, // Center of paddle
          isBig: false
      }];

      bullets.current = [];
      particles.current = [];
      powerUps.current = [];

      // Init Bricks based on Level
      const newBricks: Brick[] = [];
      const brickWidth = (CANVAS_WIDTH - 20) / BRICK_COLS;
      const brickHeight = 25;
      const padding = 3;
      const offsetTop = 50;
      const offsetLeft = 10;

      for(let c=0; c<BRICK_COLS; c++) {
          for(let r=0; r<BRICK_ROWS + (lvl > 2 ? 1 : 0); r++) {
              if (lvl === 2 && (c + r) % 2 === 0) continue; 
              if (lvl === 3 && c % 2 !== 0) continue; 
              if (lvl === 4 && r % 2 === 0) continue; 
              if (lvl > 5 && Math.random() > 0.8) continue; 
              
              let type: 'TOILET' | 'PAPER' | 'EXPLOSIVE' | 'GOLDEN' | 'STONE' = (r + c) % 3 === 0 ? 'PAPER' : 'TOILET';
              let hp = 1;
              const rand = Math.random();
              
              if (lvl >= 2 && rand > 0.92) { type = 'STONE'; hp = 999; }
              else if (rand > 0.94) { type = 'EXPLOSIVE'; }
              else if (rand > 0.88) { type = 'GOLDEN'; hp = 2 + Math.floor(lvl / 3); }

              newBricks.push({
                  x: (c * (brickWidth + padding)) + offsetLeft,
                  y: (r * (brickHeight + padding)) + offsetTop,
                  w: brickWidth,
                  h: brickHeight,
                  active: true,
                  type,
                  hp,
                  maxHp: hp
              });
          }
      }
      bricks.current = newBricks;
  };

  const createParticles = (x: number, y: number, color: string, count: number = 8) => {
      for(let i=0; i<count; i++) {
          particles.current.push({
              x, y,
              dx: (Math.random() - 0.5) * 8,
              dy: (Math.random() - 0.5) * 8,
              life: 1.0,
              color,
              size: Math.random() * 4 + 1
          });
      }
  };

  const handleLevelComplete = () => {
      if (isLevelCompleting.current) return;
      isLevelCompleting.current = true;
      playSound('SCORE');
      setGameState('LEVEL_COMPLETE');
  };

  const goToNextLevel = () => {
      setLevel(prev => {
          const next = prev + 1;
          startLevel(next);
          return next;
      });
  };

  const endGame = () => {
      playSound('BAD');
      setGameState('GAME_OVER');
      if (userId && score > 0) {
          gameService.saveScore(userId, 'poop_breaker', score);
          if (score > highScore) setHighScore(score);
      }
  };

  const touchStartRef = useRef<{x: number, y: number} | null>(null);
  const lastTouchXRef = useRef<number | null>(null);
  const hasMovedRef = useRef(false);
  const TAP_THRESHOLD = 5; // Reduced threshold for better responsiveness
  const MOVE_THRESHOLD = 3; // Lower threshold for smoother movement
  
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
      // Don't handle touch events if game is not playing (to allow button clicks)
      if (gameState !== 'PLAYING') return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      e.preventDefault(); // Prevent default touch behaviors for smoother experience
      
      let clientX, clientY;
      if ('touches' in e) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
      } else {
          clientX = (e as React.MouseEvent).clientX;
          clientY = (e as React.MouseEvent).clientY;
      }
      
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const relativeX = (clientX - rect.left) * scaleX;
      
      touchStartRef.current = { x: clientX, y: clientY };
      lastTouchXRef.current = relativeX;
      hasMovedRef.current = false;
      
      // Immediately update paddle position on touch start for instant response
      let newPaddleX = relativeX - paddleWidthRef.current / 2;
      newPaddleX = Math.max(0, Math.min(CANVAS_WIDTH - paddleWidthRef.current, newPaddleX));
      paddleX.current = newPaddleX;
  };
  
  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
      if (gameState !== 'PLAYING') return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      e.preventDefault(); // Prevent scrolling and other default behaviors
      
      let clientX, clientY;
      if ('touches' in e) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
      } else {
          clientX = (e as React.MouseEvent).clientX;
          clientY = (e as React.MouseEvent).clientY;
      }
      
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const relativeX = (clientX - rect.left) * scaleX;
      
      // Calculate movement distance
      const dx = touchStartRef.current ? clientX - touchStartRef.current.x : 0;
      const absDx = Math.abs(dx);
      
      // If there's any horizontal movement, update paddle position immediately
      // This makes the paddle follow the finger smoothly
      if (lastTouchXRef.current !== null) {
          const moveDistance = Math.abs(relativeX - lastTouchXRef.current);
          
          // Update paddle position directly to finger position for instant response
          let newPaddleX = relativeX - paddleWidthRef.current / 2;
          newPaddleX = Math.max(0, Math.min(CANVAS_WIDTH - paddleWidthRef.current, newPaddleX));
          paddleX.current = newPaddleX;
          
          // Mark as moved if movement exceeds threshold
          if (moveDistance > MOVE_THRESHOLD || absDx > TAP_THRESHOLD) {
              hasMovedRef.current = true;
          }
      }
      
      lastTouchXRef.current = relativeX;
  };
  
  const handleTouchEnd = (e?: React.TouchEvent | React.MouseEvent) => {
      if (e) {
          e.preventDefault();
      }
      
      // Release Sticky Ball Logic (Only on explicit tap, not on drag)
      // If user didn't move much (it was a tap), release any attached balls
      if (!hasMovedRef.current && touchStartRef.current) {
          let released = false;
          balls.current.forEach(b => {
              if (b.attached && b.active) {
                  b.attached = false;
                  b.dy = -BASE_SPEED * speedMultiplierRef.current;
                  b.dx = (Math.random() - 0.5) * 4;
                  released = true;
              }
          });
          if (released) playSound('THROW');
      }
      
      touchStartRef.current = null;
      lastTouchXRef.current = null;
      hasMovedRef.current = false;
  };

  const explodeBrick = (index: number, force: boolean = false) => {
      const b = bricks.current[index];
      if (!b || !b.active) return;
      
      if (b.type === 'STONE' && !force) {
          playSound('BOUNCE'); 
          return;
      }

      if (b.type === 'GOLDEN' && b.hp > 1 && !force) {
          b.hp--;
          playSound('BOUNCE');
          createParticles(b.x + b.w/2, b.y + b.h/2, '#FFD700', 3);
          return;
      }

      b.active = false;
      let points = 10;
      if (b.type === 'EXPLOSIVE') points = 50;
      if (b.type === 'GOLDEN') points = 100;
      if (b.type === 'STONE') points = 200; 
      
      setScore(s => s + points);
      
      if (b.type === 'EXPLOSIVE') {
          shakeRef.current = 15;
          playSound('EXPLOSION');
          createParticles(b.x + b.w/2, b.y + b.h/2, '#FF4500', 20); 
          
          const centerX = b.x + b.w/2;
          const centerY = b.y + b.h/2;
          const radius = b.w * 1.5;

          bricks.current.forEach((nb, i) => {
              if (!nb.active) return;
              const dist = Math.hypot((nb.x+nb.w/2) - centerX, (nb.y+nb.h/2) - centerY);
              if (dist < radius) explodeBrick(i, true); 
          });
      } else {
          shakeRef.current = 3;
          createParticles(b.x + b.w/2, b.y + b.h/2, b.type === 'TOILET' ? '#AAA' : (b.type === 'GOLDEN' ? '#FFD700' : '#FFF'));
          playSound('SLICE'); 
          
          // Powerup Drop (15%)
          if (Math.random() > 0.85) {
              const types: ('MULTI' | 'GROW' | 'LASER' | 'STICKY' | 'BIG' | 'SPEED_UP')[] = ['MULTI', 'GROW', 'LASER', 'STICKY', 'BIG', 'SPEED_UP'];
              const type = types[Math.floor(Math.random() * types.length)];
              
              powerUps.current.push({
                  x: b.x + b.w/2,
                  y: b.y + b.h/2,
                  dy: 3,
                  active: true,
                  type
              });
          }
      }
  };

  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const loop = () => {
          if (gameState !== 'PLAYING' || isPaused) return;
          frameRef.current++;

          ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          
          if (shakeRef.current > 0) {
              const dx = (Math.random() - 0.5) * shakeRef.current;
              const dy = (Math.random() - 0.5) * shakeRef.current;
              ctx.save();
              ctx.translate(dx, dy);
              shakeRef.current *= 0.9;
              if(shakeRef.current < 0.5) shakeRef.current = 0;
          }

          // Timers
          if (paddleTimerRef.current > 0) {
              paddleTimerRef.current--;
              if (paddleTimerRef.current <= 0) {
                  paddleWidthRef.current = DEFAULT_PADDLE_WIDTH;
                  playSound('BAD');
              }
          }
          if (laserTimerRef.current > 0) laserTimerRef.current--;
          if (stickyTimerRef.current > 0) {
              stickyTimerRef.current--;
              if (stickyTimerRef.current <= 0) {
                  balls.current.forEach(b => {
                      if(b.attached) {
                          b.attached = false;
                          b.dy = -BASE_SPEED * speedMultiplierRef.current;
                      }
                  });
              }
          }
          if (bigBallTimerRef.current > 0) {
              bigBallTimerRef.current--;
              if (bigBallTimerRef.current <= 0) {
                  balls.current.forEach(b => b.isBig = false);
              }
          }
          if (speedUpTimerRef.current > 0) {
              speedUpTimerRef.current--;
          }

          // Lasers
          if (laserTimerRef.current > 0 && frameRef.current % 20 === 0) {
              const pX = paddleX.current;
              const pW = paddleWidthRef.current;
              bullets.current.push({ x: pX, y: CANVAS_HEIGHT - PADDLE_HEIGHT - 10, dy: -8, active: true });
              bullets.current.push({ x: pX + pW, y: CANVAS_HEIGHT - PADDLE_HEIGHT - 10, dy: -8, active: true });
              playSound('THROW');
          }

          // Paddle
          const currentPaddleWidth = paddleWidthRef.current;
          let paddleColor = '#8B4513';
          if (paddleTimerRef.current > 0) paddleColor = '#4CAF50'; 
          else if (laserTimerRef.current > 0) paddleColor = '#FF0000'; 
          else if (stickyTimerRef.current > 0) paddleColor = '#9C27B0';
          else if (bigBallTimerRef.current > 0) paddleColor = '#FFD700';
          else if (speedUpTimerRef.current > 0) paddleColor = '#FF6B00'; // Orange for speed up

          ctx.fillStyle = paddleColor;
          ctx.beginPath();
          ctx.roundRect(paddleX.current, CANVAS_HEIGHT - PADDLE_HEIGHT - 10, currentPaddleWidth, PADDLE_HEIGHT, 5);
          ctx.fill();
          
          if (laserTimerRef.current > 0) {
              ctx.fillStyle = 'black';
              ctx.fillRect(paddleX.current - 5, CANVAS_HEIGHT - PADDLE_HEIGHT - 5, 5, 15);
              ctx.fillRect(paddleX.current + currentPaddleWidth, CANVAS_HEIGHT - PADDLE_HEIGHT - 5, 5, 15);
          }
          if (stickyTimerRef.current > 0) {
              ctx.fillStyle = 'rgba(255,255,255,0.5)';
              ctx.fillRect(paddleX.current, CANVAS_HEIGHT - PADDLE_HEIGHT - 15, currentPaddleWidth, 5);
          }
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(paddleX.current + 5, CANVAS_HEIGHT - PADDLE_HEIGHT - 10 + 3, currentPaddleWidth - 10, PADDLE_HEIGHT - 6);

          // Bricks
          let activeBricks = 0;
          let breakableBricks = 0;
          
          bricks.current.forEach(b => {
              if (!b.active) return;
              activeBricks++;
              if (b.type !== 'STONE') breakableBricks++;
              
              if (b.type === 'STONE') {
                  ctx.fillStyle = '#666'; ctx.fillRect(b.x, b.y, b.w, b.h);
                  ctx.fillStyle = '#444'; ctx.font = '14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🗿', b.x + b.w/2, b.y + b.h/2);
              } else if (b.type === 'EXPLOSIVE') {
                  ctx.fillStyle = '#FF4500'; ctx.fillRect(b.x, b.y, b.w, b.h);
                  ctx.fillStyle = '#FFF'; ctx.font = '14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🧨', b.x + b.w/2, b.y + b.h/2);
              } else if (b.type === 'GOLDEN') {
                  ctx.fillStyle = b.hp === 3 ? '#FFD700' : (b.hp === 2 ? '#C0C000' : '#8B8000');
                  ctx.fillRect(b.x, b.y, b.w, b.h);
                  ctx.fillStyle = '#000'; ctx.font = '14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('👑', b.x + b.w/2, b.y + b.h/2);
              } else {
                  ctx.fillStyle = b.type === 'TOILET' ? '#FFF' : '#EEE';
                  ctx.fillRect(b.x, b.y, b.w, b.h);
                  ctx.font = '16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'black';
                  ctx.fillText(b.type === 'TOILET' ? '🚽' : '🧻', b.x + b.w/2, b.y + b.h/2);
              }
          });

          // Correct Level Complete Check
          if (breakableBricks === 0 && activeBricks >= 0 && !isLevelCompleting.current) {
              handleLevelComplete();
          }

          // Bullets
          ctx.fillStyle = 'red';
          bullets.current.forEach(b => {
              if (!b.active) return;
              b.y += b.dy;
              ctx.fillRect(b.x - 2, b.y - 5, 4, 10);
              if (b.y < 0) b.active = false;
              
              for (let i = 0; i < bricks.current.length; i++) {
                  const brick = bricks.current[i];
                  if (!brick.active) continue;
                  if (b.x > brick.x && b.x < brick.x + brick.w && b.y > brick.y && b.y < brick.y + brick.h) {
                      b.active = false;
                      explodeBrick(i, true);
                      break;
                  }
              }
          });
          bullets.current = bullets.current.filter(b => b.active);

          // PowerUps
          powerUps.current.forEach(p => {
              if (!p.active) return;
              p.y += p.dy;
              ctx.font = '24px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              
              if (p.type === 'MULTI') { ctx.fillText('✨', p.x, p.y); }
              else if (p.type === 'LASER') { ctx.fillText('🔫', p.x, p.y); }
              else if (p.type === 'STICKY') { ctx.fillText('🧲', p.x, p.y); }
              else if (p.type === 'BIG') { ctx.fillText('🎈', p.x, p.y); }
              else if (p.type === 'SPEED_UP') { ctx.fillText('⚡', p.x, p.y); }
              else { ctx.fillText('🧪', p.x, p.y); }

              const pTop = CANVAS_HEIGHT - PADDLE_HEIGHT - 10;
              const pLeft = paddleX.current;
              const pRight = paddleX.current + currentPaddleWidth;

              if (p.y > pTop && p.y < CANVAS_HEIGHT - 10 && p.x > pLeft && p.x < pRight) {
                  p.active = false;
                  playSound('SCORE');
                  if (p.type === 'MULTI') {
                      const mainBall = balls.current.find(b => b.active) || { x: p.x, y: p.y - 20, dx: 4, dy: -4, active: true };
                      balls.current.push({ x: mainBall.x, y: mainBall.y, dx: -4, dy: -5, active: true, isBig: mainBall.isBig });
                      balls.current.push({ x: mainBall.x, y: mainBall.y, dx: 4, dy: -5, active: true, isBig: mainBall.isBig });
                  } else if (p.type === 'GROW') {
                      paddleWidthRef.current = Math.min(CANVAS_WIDTH - 20, DEFAULT_PADDLE_WIDTH * 1.5);
                      paddleTimerRef.current = 600;
                  } else if (p.type === 'LASER') {
                      laserTimerRef.current = 600;
                  } else if (p.type === 'STICKY') {
                      stickyTimerRef.current = 600;
                  } else if (p.type === 'BIG') {
                      bigBallTimerRef.current = 600;
                      balls.current.forEach(b => b.isBig = true);
                  } else if (p.type === 'SPEED_UP') {
                      speedUpTimerRef.current = 600; // 10 seconds at 60fps
                      playSound('SCORE');
                  }
              }
              if (p.y > CANVAS_HEIGHT) p.active = false;
          });
          powerUps.current = powerUps.current.filter(p => p.active);

          // Balls
          let activeBalls = 0;
          balls.current.forEach(ball => {
              if (!ball.active) return;
              activeBalls++;
              const radius = ball.isBig ? BALL_RADIUS * 2.5 : BALL_RADIUS;

              if (ball.attached) {
                  // Always center the ball on the paddle
                  const currentPaddleWidth = paddleWidthRef.current;
                  ball.x = paddleX.current + currentPaddleWidth / 2;
                  ball.y = CANVAS_HEIGHT - PADDLE_HEIGHT - 10 - radius;
                  // Update attachedOffset to match current paddle width
                  ball.attachedOffset = currentPaddleWidth / 2;
              } else {
                  // Apply speed up multiplier
                  const speedMultiplier = speedUpTimerRef.current > 0 ? 1.5 : 1.0;
                  ball.x += ball.dx * speedMultiplier;
                  ball.y += ball.dy * speedMultiplier;

                  // Wall Collision - Improved to prevent getting stuck
                  // Left/Right walls
                  if (ball.x - radius < 0) {
                      ball.x = radius; // Push ball away from wall
                      ball.dx = Math.abs(ball.dx); // Ensure positive direction
                      playSound('BOUNCE');
                  } else if (ball.x + radius > CANVAS_WIDTH) {
                      ball.x = CANVAS_WIDTH - radius; // Push ball away from wall
                      ball.dx = -Math.abs(ball.dx); // Ensure negative direction
                      playSound('BOUNCE');
                  }
                  
                  // Top/Bottom walls
                  if (ball.y - radius < 0) {
                      ball.y = radius; // Push ball away from wall
                      ball.dy = Math.abs(ball.dy); // Ensure positive direction
                      playSound('BOUNCE');
                  } else if (ball.y + radius > CANVAS_HEIGHT) {
                      ball.active = false;
                      playSound('BAD');
                  }

                  // Paddle
                  const pTop = CANVAS_HEIGHT - PADDLE_HEIGHT - 10;
                  const pLeft = paddleX.current;
                  const pRight = paddleX.current + currentPaddleWidth;

                  if (ball.y + radius > pTop && ball.y - radius < CANVAS_HEIGHT - 10 && ball.x > pLeft && ball.x < pRight) {
                      if (stickyTimerRef.current > 0) {
                          ball.attached = true;
                          ball.attachedOffset = ball.x - paddleX.current;
                          ball.dx = 0; ball.dy = 0;
                          ball.y = pTop - radius;
                      } else {
                          ball.dy = -Math.abs(ball.dy);
                          const hitPoint = ball.x - (pLeft + currentPaddleWidth/2);
                          ball.dx = hitPoint * 0.15; 
                          ball.dx *= 1.02; ball.dy *= 1.02;
                          playSound('BOUNCE');
                      }
                  }

                  // Brick
                  for (let i = 0; i < bricks.current.length; i++) {
                      const b = bricks.current[i];
                      if (!b.active) continue;
                      
                      if (ball.x > b.x && ball.x < b.x + b.w && ball.y > b.y && ball.y < b.y + b.h) {
                          if (!ball.isBig) ball.dy = -ball.dy;
                          explodeBrick(i, ball.isBig); // Big ball force breaks
                          break; 
                      }
                  }
              }

              ctx.font = `${radius * 2.5}px Arial`;
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText('💩', ball.x, ball.y);
          });

          // Handle ball loss - lose life instead of immediate game over
          if (activeBalls === 0 && !isLosingLife.current && gameState === 'PLAYING') {
              isLosingLife.current = true; // Prevent multiple triggers
              setLives(prevLives => {
                  const newLives = prevLives - 1;
                  if (newLives <= 0) {
                      endGame();
                      isLosingLife.current = false;
                      return 0;
                  } else {
                      // Respawn ball after losing a life - Attached to paddle, need to tap to launch
                      setTimeout(() => {
                          if (gameState === 'PLAYING') {
                              const ballRadius = bigBallTimerRef.current > 0 ? BALL_RADIUS * 2.5 : BALL_RADIUS;
                              balls.current = [{
                                  x: paddleX.current + paddleWidthRef.current / 2,
                                  y: CANVAS_HEIGHT - PADDLE_HEIGHT - 10 - ballRadius,
                                  dx: 0,
                                  dy: 0,
                                  active: true,
                                  attached: true,
                                  attachedOffset: paddleWidthRef.current / 2, // Center of paddle
                                  isBig: bigBallTimerRef.current > 0
                              }];
                              playSound('JUMP');
                              isLosingLife.current = false; // Reset flag after respawn
                          }
                      }, 500); // Brief pause before respawn
                      return newLives;
                  }
              });
          }

          particles.current.forEach(p => {
              p.x += p.dx; p.y += p.dy; p.dy += 0.2; p.life -= 0.05;
              ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
              ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
              ctx.globalAlpha = 1;
          });
          particles.current = particles.current.filter(p => p.life > 0);

          if (shakeRef.current > 0) ctx.restore();
          animationRef.current = requestAnimationFrame(loop);
      };

      if (gameState === 'PLAYING' && !isPaused) {
          animationRef.current = requestAnimationFrame(loop);
      } else {
          if (animationRef.current) cancelAnimationFrame(animationRef.current);
      }
      return () => {
          if (animationRef.current) cancelAnimationFrame(animationRef.current);
      };
  }, [gameState, isPaused]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-brand-cream rounded-2xl p-4 w-full max-w-sm border-4 border-black relative">
        <div className="absolute -top-4 right-0 flex gap-2 z-10">
          {gameState === 'PLAYING' && (
            <button onClick={() => setIsPaused(!isPaused)} className="bg-yellow-500 text-white rounded-full p-2 border-2 border-black font-bold">
              {isPaused ? '▶' : '⏸'}
            </button>
          )}
          <button onClick={onClose} className="bg-red-500 text-white rounded-full p-2 border-2 border-black font-bold">X</button>
        </div>
        
        <div className="flex justify-between items-center mb-4">
            <div>
                 <h2 className="font-black text-2xl text-brand-brown">Poop Breaker</h2>
                 <div className="text-xs font-bold text-gray-500">LEVEL {level}</div>
            </div>
            <div className="text-right leading-tight">
                 <div className="text-xs text-gray-500 font-bold">HIGH: {highScore}</div>
                 <div className="font-black text-xl text-brand-blue">SCORE: {score}</div>
                 <div className="flex items-center justify-end gap-1 mt-1">
                     {Array.from({length: 3}).map((_, i) => (
                         <span key={i} className={`text-lg transition-all ${i < lives ? 'scale-100' : 'scale-75 opacity-30 grayscale'}`}>
                             ❤️
                         </span>
                     ))}
                 </div>
            </div>
        </div>

        <div 
            className="relative bg-blue-100 border-4 border-black rounded-lg overflow-hidden mx-auto touch-none"
            style={{ 
                width: `${CANVAS_WIDTH}px`, 
                height: `${CANVAS_HEIGHT}px`, 
                maxWidth: '100%',
                touchAction: gameState === 'PLAYING' ? 'none' : 'auto',
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent'
            }}
            onTouchStart={gameState === 'PLAYING' ? handleTouchStart : undefined}
            onTouchMove={gameState === 'PLAYING' ? handleTouchMove : undefined}
            onTouchEnd={gameState === 'PLAYING' ? handleTouchEnd : undefined}
            onMouseDown={gameState === 'PLAYING' ? handleTouchStart : undefined}
            onMouseMove={gameState === 'PLAYING' ? handleTouchMove : undefined}
            onMouseUp={gameState === 'PLAYING' ? handleTouchEnd : undefined}
            onMouseLeave={gameState === 'PLAYING' ? handleTouchEnd : undefined}
            onContextMenu={(e) => e.preventDefault()}
            onSelectStart={(e) => e.preventDefault()}
        >
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="w-full h-full block" />
            
            {gameState !== 'PLAYING' && (
                <div 
                    className="absolute inset-0 bg-black/50 flex items-center justify-center"
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    style={{ pointerEvents: 'auto' }}
                >
                     <div 
                         className="bg-white p-6 rounded-xl border-4 border-black text-center shadow-lg w-3/4"
                         onTouchStart={(e) => e.stopPropagation()}
                         onTouchMove={(e) => e.stopPropagation()}
                         onTouchEnd={(e) => e.stopPropagation()}
                         onClick={(e) => e.stopPropagation()}
                     >
                         <div className="text-5xl mb-2">
                             {gameState === 'GAME_OVER' ? '🚽' : (gameState === 'LEVEL_COMPLETE' ? '🏆' : '💩')}
                         </div>
                         <h2 className="font-black text-2xl mb-2">
                             {gameState === 'START' ? 'READY?' : (gameState === 'LEVEL_COMPLETE' ? 'CLEARED!' : 'GAME OVER')}
                         </h2>
                         
                         {gameState === 'START' && (
                             <div className="text-xs font-bold text-gray-500 mb-4 flex flex-col gap-1">
                                 <div>💥 Break the walls</div>
                                 <div>🧲 New: Sticky Paddle</div>
                                 <div>🎈 New: Big Ball</div>
                                 <div>⚡ New: Speed Up</div>
                             </div>
                         )}
                         
                         {gameState === 'LEVEL_COMPLETE' && (
                             <div className="mb-4">
                                 <div className="text-sm font-bold text-green-600">Level {level} Complete</div>
                                 <div className="text-xs text-gray-500">Great Job!</div>
                             </div>
                         )}

                         <Button 
                             onClick={gameState === 'LEVEL_COMPLETE' ? goToNextLevel : startGame} 
                             fullWidth
                             onTouchStart={(e) => e.stopPropagation()}
                             onTouchEnd={(e) => e.stopPropagation()}
                             style={{ touchAction: 'manipulation' }}
                         >
                             {gameState === 'START' ? 'LAUNCH POOP' : (gameState === 'LEVEL_COMPLETE' ? 'NEXT LEVEL' : 'TRY AGAIN')}
                         </Button>
                     </div>
                </div>
            )}
        </div>
        <p className="text-center text-xs text-gray-400 mt-2 font-bold">Swipe left/right to move. Tap to release sticky ball.</p>
      </div>
    </div>
  );
};
