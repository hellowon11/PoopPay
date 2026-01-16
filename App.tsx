import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppView, UserSettings, PoopSession, EntertainmentType, User, BRISTOL_SCALE, POOP_COLORS, POOP_CONDITIONS, LeaderboardEntry, Achievement } from './types';
import { userService, sessionService, settingsService } from './services/supabaseClient';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { FlappyPoop } from './components/games/FlappyPoop';
import { SnakeGame } from './components/games/SnakeGame';
import { WhackATurd } from './components/games/WhackATurd';
import { ToiletPaperNinja } from './components/games/ToiletPaperNinja';
import { PoopBreaker } from './components/games/PoopBreaker';
import { CatVsDog } from './components/games/CatVsDog';
import { SpeedRoll } from './components/games/SpeedRoll';
import { DoodlePoop } from './components/games/DoodlePoop';
import { playSound } from './utils/audio';
import { 
  Square, 
  Settings, 
  Home, 
  Trophy, 
  Gamepad2, 
  LogOut, 
  Check, 
  VolumeX, 
  Globe, 
  Users, 
  X, 
  Wind, 
  Award,
  ArrowRight,
  Edit2,
  Copy,
  AlertTriangle,
  History,
  Clock,
  Calendar as CalendarIcon,
  List as ListIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart2,
  Activity,
  Flame,
  Hash,
  Timer
} from 'lucide-react';

const DEFAULT_SETTINGS: UserSettings = {
  monthlySalary: 0,
  currencySymbol: 'RM',
  workingDaysPerMonth: 21.75,
  hoursPerDay: 8
};

// --- ACHIEVEMENTS CONFIGURATION ---
const ACHIEVEMENTS_LIST: Achievement[] = [
  { id: 'first_drop', title: 'First Drop', description: 'Logged your very first session.', icon: '👶', condition: (history) => history.length >= 1 },
  { id: 'regular', title: 'The Regular', description: 'Logged 5 sessions.', icon: '📅', condition: (history) => history.length >= 5 },
  { id: 'veteran', title: 'Veteran Pooper', description: 'Logged 20 sessions.', icon: '🎖️', condition: (history) => history.length >= 20 },
  { id: 'master', title: 'Master Pooper', description: 'Logged 50 sessions.', icon: '👑', condition: (history) => history.length >= 50 },
  { id: 'legend', title: 'Legend', description: 'Logged 100 sessions.', icon: '🌟', condition: (history) => history.length >= 100 },
  { id: 'speed_demon', title: 'Speed Demon', description: 'Finished in under 2 mins.', icon: '⚡', condition: (history) => history.some(s => s.durationSeconds < 120 && s.durationSeconds > 10) },
  { id: 'the_thinker', title: 'The Thinker', description: 'Spent over 20 mins.', icon: '🤔', condition: (history) => history.some(s => s.durationSeconds > 1200) },
  { id: 'marathon', title: 'Marathon', description: 'Total time > 5 hours.', icon: '⏳', condition: (history) => history.reduce((acc, curr) => acc + curr.durationSeconds, 0) > 18000 },
  { id: 'snake_charmer', title: 'Snake Charmer', description: 'Logged a "Perfect Snake".', icon: '🐍', condition: (history) => history.some(s => s.poop_type === 4) },
  { id: 'liquid_assets', title: 'Liquid Assets', description: 'Logged a "The Soup".', icon: '🌊', condition: (history) => history.some(s => s.poop_type === 7) },
  { id: 'hard_worker', title: 'Hard Worker', description: 'Logged a "Hard" type.', icon: '⚫', condition: (history) => history.some(s => s.poop_type === 1) },
  { id: 'soft_chicken', title: 'Soft Chicken', description: 'Logged a "Soft" type.', icon: '🐥', condition: (history) => history.some(s => s.poop_type === 5) },
  { id: 'morning_glory', title: 'Morning Glory', description: 'Pooped before 9 AM.', icon: '🌅', condition: (history) => history.some(s => { const d = new Date(s.startTime); return d.getHours() < 9 && d.getHours() >= 4; }) },
  { id: 'night_owl', title: 'Night Owl', description: 'Pooped after 8 PM.', icon: '🦉', condition: (history) => history.some(s => { const d = new Date(s.startTime); return d.getHours() >= 20; }) },
  { id: 'lunch_break', title: 'Lunch Break', description: 'Pooped between 12-2 PM.', icon: '🍽️', condition: (history) => history.some(s => { const d = new Date(s.startTime); return d.getHours() >= 12 && d.getHours() < 14; }) },
  { id: 'rich_pooper', title: 'Rich Pooper', description: 'Earned over 100 in one session.', icon: '💰', condition: (history) => history.some(s => s.earnings >= 100) },
  { id: 'consistency', title: 'Consistency King', description: '7 day streak.', icon: '🔥', condition: (history) => {
    const days = Array.from(new Set(history.map(s => new Date(s.startTime).toDateString()))).sort();
    if (days.length < 7) return false;
    let streak = 1;
    for (let i = days.length - 2; i >= 0; i--) {
      const curr = new Date(days[i]);
      const next = new Date(days[i+1]);
      const diff = (next.getTime() - curr.getTime()) / (1000 * 3600 * 24);
      if (diff >= 0.9 && diff <= 1.1) streak++;
      else break;
    }
    return streak >= 7;
  }},
  { id: 'weekend_warrior', title: 'Weekend Warrior', description: 'Pooped on weekend.', icon: '🎮', condition: (history) => history.some(s => { const d = new Date(s.startTime); return d.getDay() === 0 || d.getDay() === 6; }) }
];

// --- HARDCODED "AI" LOGIC ---
const getFinancialWisdom = (earnings: number, durationMinutes: number) => {
    if (earnings < 0.5) return "Basically unpaid labor.";
    if (durationMinutes > 20) return "Legs numb, wallet full.";
    if (durationMinutes < 2) return "Speed racer profit!";
    if (earnings > 10) return "Lunch money secured! 🍔";
    return "The boss makes a dollar, I make a dime.";
};

const safeParse = <T,>(key: string): T | null => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        localStorage.removeItem(key);
        return null;
    }
}

// POOP HIT ANIMATION COMPONENT - Funny multiple poops falling with screen crack effect
const PoopHitAnimation = ({ visible }: { visible: boolean }) => {
    const [showCrack, setShowCrack] = useState(false);
    
    useEffect(() => {
        if (visible) {
            // Show crack effect after poops start hitting
            const crackTimer = setTimeout(() => {
                setShowCrack(true);
            }, 800);
            return () => clearTimeout(crackTimer);
        } else {
            setShowCrack(false);
        }
    }, [visible]);
    
    if (!visible) return null;
    
    const poops = Array.from({ length: 35 }, (_, i) => ({
        id: i,
        delay: i * 0.04,
        x: Math.random() * 100,
        size: Math.random() * 100 + 70,
        rotation: Math.random() * 720,
        speed: Math.random() * 0.3 + 0.7,
        impactX: Math.random() * 100,
        impactY: 40 + Math.random() * 40 // Impact around middle of screen
    }));
    
    // Generate crack lines
    const cracks = Array.from({ length: 12 }, (_, i) => ({
        id: i,
        startX: 50 + (Math.random() - 0.5) * 20,
        startY: 50 + (Math.random() - 0.5) * 20,
        angle: Math.random() * 360,
        length: 20 + Math.random() * 30,
        delay: 0.8 + i * 0.05
    }));
    
    return (
        <div className="fixed inset-0 z-[200] pointer-events-none overflow-hidden">
            {/* Poops falling and hitting screen */}
            {poops.map((poop) => (
                <div
                    key={poop.id}
                    className="absolute"
                    style={{
                        left: `${poop.x}%`,
                        top: '-100px',
                        animationDelay: `${poop.delay}s`,
                        animation: `poopFall${poop.id} ${1.5 * poop.speed}s cubic-bezier(0.4, 0, 0.2, 1) forwards`
                    }}
                >
                    <div
                        className="text-7xl"
                        style={{
                            fontSize: `${poop.size}px`,
                            animation: `poopSpin${poop.id} ${1.5 * poop.speed}s linear forwards`
                        }}
                    >
                        💩
                    </div>
                    {/* Impact splatter effect */}
                    <div
                        className="absolute text-8xl opacity-0"
                        style={{
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            animationDelay: `${poop.delay + 0.5 * poop.speed}s`,
                            animation: `splatter${poop.id} 0.3s ease-out forwards`
                        }}
                    >
                        💥
                    </div>
                </div>
            ))}
            
            {/* Screen crack effect */}
            {showCrack && (
                <div className="absolute inset-0">
                    {cracks.map((crack) => (
                        <div
                            key={crack.id}
                            className="absolute"
                            style={{
                                left: `${crack.startX}%`,
                                top: `${crack.startY}%`,
                                width: '2px',
                                height: `${crack.length}%`,
                                background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.3))',
                                transformOrigin: 'top center',
                                transform: `rotate(${crack.angle}deg)`,
                                animationDelay: `${crack.delay}s`,
                                animation: `crackExpand${crack.id} 0.5s ease-out forwards`,
                                boxShadow: '0 0 10px rgba(0,0,0,0.5)'
                            }}
                        />
                    ))}
                    {/* Screen shake effect */}
                    <div 
                        className="absolute inset-0"
                        style={{
                            animation: 'screenShake 0.5s ease-out',
                            animationDelay: '0.8s'
                        }}
                    />
                </div>
            )}
            
            <style>{`
                ${poops.map((poop, i) => `
                    @keyframes poopFall${i} {
                        0% {
                            transform: translateY(0) translateX(0) rotate(0deg) scale(0.3);
                            opacity: 1;
                        }
                        30% {
                            transform: translateY(${poop.impactY * 0.3}vh) translateX(${(Math.random() - 0.5) * 50}px) rotate(${poop.rotation * 0.2}deg) scale(1.1);
                            opacity: 1;
                        }
                        60% {
                            transform: translateY(${poop.impactY * 0.6}vh) translateX(${(Math.random() - 0.5) * 30}px) rotate(${poop.rotation * 0.4}deg) scale(1.3);
                            opacity: 1;
                        }
                        85% {
                            transform: translateY(${poop.impactY}vh) translateX(${(Math.random() - 0.5) * 20}px) rotate(${poop.rotation * 0.7}deg) scale(1.5);
                            opacity: 1;
                        }
                        90% {
                            transform: translateY(${poop.impactY}vh) translateX(${(Math.random() - 0.5) * 10}px) rotate(${poop.rotation}deg) scale(1.2);
                            opacity: 0.9;
                        }
                        100% {
                            transform: translateY(${poop.impactY + 10}vh) translateX(${(Math.random() - 0.5) * 5}px) rotate(${poop.rotation}deg) scale(0.8);
                            opacity: 0.3;
                        }
                    }
                    @keyframes poopSpin${i} {
                        0% { transform: rotate(0deg) scale(0.3); }
                        15% { transform: rotate(180deg) scale(1.1); }
                        30% { transform: rotate(360deg) scale(1.2); }
                        60% { transform: rotate(540deg) scale(1.4); }
                        85% { transform: rotate(720deg) scale(1.5); }
                        90% { transform: rotate(${poop.rotation}deg) scale(1.2); }
                        100% { transform: rotate(${poop.rotation}deg) scale(0.8); }
                    }
                    @keyframes splatter${i} {
                        0% {
                            transform: translate(-50%, -50%) scale(0) rotate(0deg);
                            opacity: 0;
                        }
                        50% {
                            transform: translate(-50%, -50%) scale(2) rotate(180deg);
                            opacity: 1;
                        }
                        100% {
                            transform: translate(-50%, -50%) scale(3) rotate(360deg);
                            opacity: 0;
                        }
                    }
                `).join('')}
                ${cracks.map((crack, i) => `
                    @keyframes crackExpand${i} {
                        0% {
                            height: 0%;
                            opacity: 0;
                        }
                        50% {
                            opacity: 1;
                        }
                        100% {
                            height: ${crack.length}%;
                            opacity: 0.8;
                        }
                    }
                `).join('')}
                @keyframes screenShake {
                    0%, 100% { transform: translate(0, 0); }
                    10% { transform: translate(-5px, -3px) rotate(-0.5deg); }
                    20% { transform: translate(5px, 3px) rotate(0.5deg); }
                    30% { transform: translate(-4px, 2px) rotate(-0.3deg); }
                    40% { transform: translate(4px, -2px) rotate(0.3deg); }
                    50% { transform: translate(-3px, -1px) rotate(-0.2deg); }
                    60% { transform: translate(3px, 1px) rotate(0.2deg); }
                    70% { transform: translate(-2px, 0) rotate(-0.1deg); }
                    80% { transform: translate(2px, 0) rotate(0.1deg); }
                    90% { transform: translate(-1px, 0); }
                }
            `}</style>
        </div>
    );
};

// TOAST COMPONENT - Enhanced for better achievement feedback
const ToastNotification = ({ message, icon, visible }: { message: string, icon: string, visible: boolean }) => {
    if (!visible) return null;
    return (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] animate-bounce">
            <div className="bg-gradient-to-r from-brand-brown to-orange-700 text-white px-8 py-4 rounded-2xl shadow-2xl border-4 border-brand-yellow flex items-center gap-4 transform scale-110 animate-pulse">
                <span className="text-4xl animate-spin-slow">{icon}</span>
                <div>
                    <div className="text-xs font-black text-brand-yellow uppercase tracking-widest mb-1">🏆 ACHIEVEMENT UNLOCKED! 🏆</div>
                    <div className="font-black text-lg">{message}</div>
                </div>
            </div>
        </div>
    );
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authInput, setAuthInput] = useState('');
  const [isRegistering, setIsRegistering] = useState(true);
  const [isVerifying, setIsVerifying] = useState(true); 

  const [view, setView] = useState<AppView>(AppView.AUTH);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<PoopSession[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'weekly'|'monthly'|'all'>('weekly');
  
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // Game State
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [showGameMenu, setShowGameMenu] = useState(false);

  // New Session Data
  const [lastSessionData, setLastSessionData] = useState<{duration: number, earnings: number} | null>(null);
  
  // --- NEW INPUT STATES ---
  const [selectedPoopType, setSelectedPoopType] = useState<number | null>(null);
  const [selectedPoopColor, setSelectedPoopColor] = useState<string | null>(null);
  const [selectedVolume, setSelectedVolume] = useState<'Small'|'Normal'|'Huge'|'Gigantic'|null>(null);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  
  const [financialAnalysis, setFinancialAnalysis] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  
  // NEW: State to hold random advice for current session
  const [currentAdvice, setCurrentAdvice] = useState<any>(null);

  const [isPrivacyNoiseOn, setIsPrivacyNoiseOn] = useState(false);
  
  const [onlinePoopers, setOnlinePoopers] = useState(0);
  const [toast, setToast] = useState<{ visible: boolean, message: string, icon: string }>({ visible: false, message: '', icon: '' });
  const [poopHitVisible, setPoopHitVisible] = useState(false);
  const [viewedAchievements, setViewedAchievements] = useState<Set<string>>(new Set());

  // Settings: Username Edit
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  // History View Mode
  const [historyViewMode, setHistoryViewMode] = useState<'LIST' | 'CALENDAR'>('LIST');
  const [calendarCursor, setCalendarCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [historyDisplayLimit, setHistoryDisplayLimit] = useState(5);
  const [calendarDisplayLimit, setCalendarDisplayLimit] = useState(5);

  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const noiseNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  const calculateRatePerSecond = useCallback(() => {
    if (settings.monthlySalary <= 0) return 0;
    const secondsPerMonth = settings.workingDaysPerMonth * settings.hoursPerDay * 3600;
    return settings.monthlySalary / secondsPerMonth;
  }, [settings]);

  const currentEarnings = calculateRatePerSecond() * elapsedSeconds;

  // --- Effects ---
  useEffect(() => {
    const initApp = async () => {
        setIsVerifying(true);

        // Only store user ID in localStorage, not full user object
        const storedUserId = localStorage.getItem('poopPay_user_id');
        
        if (storedUserId) {
            const validUser = await userService.login(storedUserId);
            if (validUser) {
                setUser(validUser);
                await loadUserData(validUser.id);
                
                // Load viewed achievements from localStorage
                const viewed = safeParse<string[]>(`poopPay_viewed_achievements_${validUser.id}`);
                if (viewed) {
                    setViewedAchievements(new Set(viewed));
                }
                
                // Load settings from Supabase
                const userSettings = await settingsService.getSettings(validUser.id);
                if (userSettings) {
                    setSettings(userSettings);
                    
                    // Check for active timer session
                    const savedSessionStartTime = localStorage.getItem('poopPay_active_session_start');
                    if (savedSessionStartTime) {
                        const startTime = parseInt(savedSessionStartTime, 10);
                        const now = Date.now();
                        const elapsed = Math.floor((now - startTime) / 1000);
                        
                        // Only restore if session is less than 24 hours old
                        if (elapsed < 86400) {
                            setSessionStartTime(startTime);
                            setElapsedSeconds(elapsed);
                            setIsTimerRunning(true);
                            setView(AppView.ACTIVE_SESSION);
                        } else {
                            // Session too old, clear it
                            localStorage.removeItem('poopPay_active_session_start');
                        }
                    } else {
                        setView(AppView.HOME);
                    }
                } else {
                    setView(AppView.ONBOARDING);
                }
            } else {
                // Invalid user ID, clear it
                localStorage.removeItem('poopPay_user_id');
                localStorage.removeItem('poopPay_active_session_start');
                setView(AppView.AUTH);
            }
        } else {
            setView(AppView.AUTH);
        }
        setIsVerifying(false);
    };
    initApp();
  }, []);

  useEffect(() => {
    // Get real online count from database
    const fetchOnlineCount = async () => {
      try {
        // Get count of users who have sessions in the last 24 hours
        const leaderboardData = await sessionService.getLeaderboard('all');
        if (leaderboardData && leaderboardData.length > 0) {
          // Count unique users from leaderboard
          const uniqueUsers = new Set(leaderboardData.map(entry => entry.username));
          setOnlinePoopers(uniqueUsers.size || Math.floor(Math.random() * 5000) + 3000);
        } else {
          // Fallback to realistic random number
          setOnlinePoopers(Math.floor(Math.random() * 5000) + 3000);
        }
      } catch (e) {
        // Fallback to realistic random number
        setOnlinePoopers(Math.floor(Math.random() * 5000) + 3000);
      }
    };
    
    fetchOnlineCount();
    // Update every 30 seconds
    const interval = setInterval(fetchOnlineCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (view === AppView.ACHIEVEMENTS && user && history) {
        loadUserData(user.id);
        // Automatically mark all unlocked achievements as viewed when entering achievements page
        const unlockedIds = ACHIEVEMENTS_LIST.filter(a => a.condition(history)).map(a => a.id);
        const newViewed = new Set(unlockedIds);
        setViewedAchievements(newViewed);
        localStorage.setItem(`poopPay_viewed_achievements_${user.id}`, JSON.stringify(Array.from(newViewed)));
    }
  }, [view, user?.id, history?.length]);

  const loadUserData = async (userId: string) => {
    try {
        const hist = await sessionService.getHistory(userId);
        setHistory(hist);
        
        // Load settings from Supabase
        const userSettings = await settingsService.getSettings(userId);
        if (userSettings) {
            setSettings(userSettings);
        }
    } catch(e) { console.error(e); }
  };

  // Track when page becomes hidden/visible for mobile background support
  const lastVisibleTimeRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isTimerRunning) {
      // Initialize accumulated time
      if (sessionStartTime) {
        accumulatedTimeRef.current = Math.floor((Date.now() - sessionStartTime) / 1000);
      }

      const handleVisibilityChange = () => {
        if (document.hidden) {
          // Page is hidden, save current time
          if (sessionStartTime) {
            lastVisibleTimeRef.current = Date.now();
            accumulatedTimeRef.current = Math.floor((Date.now() - sessionStartTime) / 1000);
          }
        } else {
          // Page is visible again, adjust for time spent in background
          if (lastVisibleTimeRef.current && sessionStartTime) {
            const timeHidden = Date.now() - lastVisibleTimeRef.current;
            // Adjust session start time to account for hidden time
            const newStartTime = sessionStartTime + timeHidden;
            setSessionStartTime(newStartTime);
            lastVisibleTimeRef.current = null;
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      timerRef.current = window.setInterval(() => {
        if (sessionStartTime) {
          setElapsedSeconds(Math.floor((Date.now() - sessionStartTime) / 1000));
        }
      }, 200);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      lastVisibleTimeRef.current = null;
      accumulatedTimeRef.current = 0;
    }
  }, [isTimerRunning, sessionStartTime]);

  useEffect(() => {
    return () => {
        // Clean up music
        if (musicAudioRef.current) {
            musicAudioRef.current.pause();
            musicAudioRef.current = null;
        }
        // Clean up old noise node if exists
        if (noiseNodeRef.current) {
            try { 
                if (typeof noiseNodeRef.current.stop === 'function') {
                    noiseNodeRef.current.stop(); 
                } else if (noiseNodeRef.current.stop) {
                    noiseNodeRef.current.stop();
                }
            } catch(e){}
            noiseNodeRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
    }
  }, []);

  const showToast = (message: string, icon: string, duration: number = 5000) => {
      setToast({ visible: true, message, icon });
      setTimeout(() => setToast(prev => ({ ...prev, visible: false })), duration);
  };

  const handleAuth = async () => {
    if (!authInput.trim()) return;
    
    if (isRegistering) {
      const newUser = await userService.register(authInput);
      if (newUser) {
        setUser(newUser);
        // Only store user ID in localStorage
        localStorage.setItem('poopPay_user_id', newUser.id);
        setView(AppView.ONBOARDING);
      }
    } else {
      const existingUser = await userService.login(authInput);
      if (existingUser) {
        setUser(existingUser);
        // Only store user ID in localStorage
        localStorage.setItem('poopPay_user_id', existingUser.id);
        await loadUserData(existingUser.id);
        
        // Check if settings exist in Supabase
        const userSettings = await settingsService.getSettings(existingUser.id);
        setView(userSettings?.monthlySalary ? AppView.HOME : AppView.ONBOARDING);
      } else {
        alert("User ID not found or invalid!");
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('poopPay_user_id');
    setUser(null);
    setHistory([]);
    setView(AppView.AUTH);
  };

  const handleUpdateUsername = async () => {
      if (!user || !newUsername.trim()) return;
      
      const success = await userService.updateUsername(user.id, newUsername);
      if (success) {
          const updatedUser = { ...user, username: newUsername };
          setUser(updatedUser);
          // User ID remains the same, no need to update localStorage
          setEditingUsername(false);
          showToast('Username Updated!', '👤');
      } else {
          alert("Failed to update username.");
      }
  };

  const handleStartTimer = () => {
    const startTime = Date.now();
    setSessionStartTime(startTime);
    setElapsedSeconds(0);
    setIsTimerRunning(true);
    // Save session start time to localStorage for page refresh recovery
    localStorage.setItem('poopPay_active_session_start', startTime.toString());
    setView(AppView.ACTIVE_SESSION);
  };

  const handleStopTimer = async () => {
    setIsTimerRunning(false);
    // Clear saved session start time
    localStorage.removeItem('poopPay_active_session_start');
    if (isPrivacyNoiseOn) togglePrivacyNoise();

    const duration = elapsedSeconds;
    const earnings = currentEarnings;
    setLastSessionData({ duration, earnings });

    // FAST: Synchronous logic
    const wisdom = getFinancialWisdom(earnings, duration / 60);
    setFinancialAnalysis(wisdom);
    
    // Reset selections
    setSelectedPoopType(null);
    setSelectedPoopColor(null);
    setSelectedVolume(null);
    setSelectedConditions([]);

    setView(AppView.POOP_CHECK);
  };

  const togglePrivacyNoise = () => {
      try {
        if (isPrivacyNoiseOn) {
            // Stop music
            if (musicAudioRef.current) {
                musicAudioRef.current.pause();
                musicAudioRef.current.currentTime = 0;
                musicAudioRef.current = null;
            }
            setIsPrivacyNoiseOn(false);
        } else {
            // === CHILL MUSIC from MP3 file ===
            const audio = new Audio('/music/sound-relax-music.mp3');
            audio.loop = true;
            audio.volume = 0.5; // Comfortable volume
            audio.play().catch(e => {
                console.error("Failed to play music:", e);
            });
            musicAudioRef.current = audio;

            setIsPrivacyNoiseOn(true);
        }
      } catch (e) {
          console.error("Audio error", e);
      }
  };

  const handleSkip = async () => {
        if (!lastSessionData || !user) return;
        setIsSaving(true);

        setCurrentAdvice(null);

        const newSession: PoopSession = {
            startTime: Date.now() - (lastSessionData.duration * 1000), 
            endTime: Date.now(),
            durationSeconds: lastSessionData.duration,
            earnings: lastSessionData.earnings,
            // Skip details
            ai_health_advice: "Details skipped."
        };

        await sessionService.saveSession(newSession, user.id);
        
        const currentHistory = [...history, newSession]; 
        const previousUnlocked = ACHIEVEMENTS_LIST.filter(a => a.condition(history));
        const currentUnlocked = ACHIEVEMENTS_LIST.filter(a => a.condition(currentHistory));
        const newAchievements = currentUnlocked.filter(a => !previousUnlocked.find(p => p.id === a.id));

        if (newAchievements.length > 0) {
            // Show poop hit animation - longer and funnier
            setPoopHitVisible(true);
            setTimeout(() => setPoopHitVisible(false), 3000);
            
            // Enhanced feedback for first achievement unlock
            showToast(newAchievements[0].title, newAchievements[0].icon, 6000);
            // Play sound if available
            playSound('SCORE');
            
            // IMPORTANT: Don't mark new achievements as viewed yet - they should show notification on home page
            // The new achievements will remain unviewed until user clicks on achievements page
        }

        await loadUserData(user.id);
        // After loading data, ensure new achievements are NOT marked as viewed
        // They will show notification count on home page
        setIsSaving(false);
        setView(AppView.SUMMARY);
  };

  const handlePoopCheckSubmit = async () => {
    if (!lastSessionData || !user) return;
    setIsSaving(true);
    // Clear saved session start time when submitting
    localStorage.removeItem('poopPay_active_session_start');
    
    // Hardcoded feedback combinations based on shape + volume + color
    const getFeedback = () => {
      const shape = selectedPoopType;
      const volume = selectedVolume;
      const color = selectedPoopColor;
      
      // Color warnings (highest priority)
      if (color === 'red') {
        const redFeedback = [
          { title: "Code Red! 🚨", desc: "Unless you ate beets, this needs attention. Could be hemorrhoids.", foodEmoji: "👨‍⚕️", foodName: "See Doctor" },
          { title: "Bloody Hell! 😱", desc: "Red alert! Check if it's from food or something more serious.", foodEmoji: "🏥", foodName: "Medical Check" },
          { title: "Crimson Tide 🌊", desc: "If this isn't from dragon fruit, please consult a doctor.", foodEmoji: "🩺", foodName: "Health Check" }
        ];
        return redFeedback[Math.floor(Math.random() * redFeedback.length)];
      }
      
      if (color === 'black') {
        const blackFeedback = [
          { title: "Dark Matter ⚫", desc: "Iron pills? Pepto? If not, could be upper GI bleeding.", foodEmoji: "🏥", foodName: "Medical Check" },
          { title: "Void Poop 🕳️", desc: "Darker than your soul. Check your iron intake or see a doc.", foodEmoji: "👨‍⚕️", foodName: "See Doctor" },
          { title: "Midnight Express 🌑", desc: "This darkness needs investigation unless you ate black licorice.", foodEmoji: "🩺", foodName: "Health Check" }
        ];
        return blackFeedback[Math.floor(Math.random() * blackFeedback.length)];
      }
      
      if (color === 'green') {
        const greenFeedback = [
          { title: "Hulk Mode 💚", desc: "Too much spinach or food moved too fast. Slow down!", foodEmoji: "🥬", foodName: "Less Greens" },
          { title: "Shrek's Gift 🧅", desc: "Your gut is speedrunning digestion. Eat slower!", foodEmoji: "🕰️", foodName: "Slow Eating" },
          { title: "Alien Baby 👽", desc: "Green means go... too fast through your system!", foodEmoji: "🐢", foodName: "Take It Easy" }
        ];
        return greenFeedback[Math.floor(Math.random() * greenFeedback.length)];
      }
      
      // Shape + Volume combinations (brown color)
      // Hard (type 1)
      if (shape === 1) {
        if (volume === 'Small') {
          return { title: "Rabbit Mode 🐰", desc: "Tiny pellets! You need way more water and fiber.", foodEmoji: "💧", foodName: "Hydrate!" };
        } else if (volume === 'Gigantic') {
          return { title: "Boulder Alert 🪨", desc: "That's a lot of hard work. Literally. Drink more water!", foodEmoji: "🥤", foodName: "Water ASAP" };
        }
        const hardFeedback = [
          { title: "Constipation Station 🚂", desc: "Your gut needs a vacation. More fiber, more water!", foodEmoji: "🥗", foodName: "Fiber Up" },
          { title: "Rock Collection 💎", desc: "These shouldn't be this hard. Prune juice is your friend.", foodEmoji: "🍇", foodName: "Prune Juice" }
        ];
        return hardFeedback[Math.floor(Math.random() * hardFeedback.length)];
      }
      
      // Firm (type 3)
      if (shape === 3) {
        if (volume === 'Huge' || volume === 'Gigantic') {
          return { title: "Log Cabin 🏠", desc: "Building a cabin in there? Impressive but maybe eat less.", foodEmoji: "🥗", foodName: "Portion Control" };
        }
        const firmFeedback = [
          { title: "Solid Work 👍", desc: "Not bad! A bit more fiber could make it perfect.", foodEmoji: "🌾", foodName: "Add Oats" },
          { title: "Almost There 🎯", desc: "Close to perfection. Keep up the fiber intake!", foodEmoji: "🥦", foodName: "More Veggies" }
        ];
        return firmFeedback[Math.floor(Math.random() * firmFeedback.length)];
      }
      
      // Smooth (type 4) - Perfect!
      if (shape === 4) {
        if (volume === 'Gigantic') {
          return { title: "Anaconda! 🐍", desc: "Perfect form AND size! Your gut is a champion!", foodEmoji: "🏆", foodName: "Keep It Up!" };
        }
        const smoothFeedback = [
          { title: "Golden Standard 🏆", desc: "Textbook perfect! Your gut is living its best life.", foodEmoji: "⭐", foodName: "Perfect Diet" },
          { title: "Chef's Kiss 👨‍🍳", desc: "Magnifico! This is what peak performance looks like.", foodEmoji: "💯", foodName: "Nailed It!" },
          { title: "S-Tier Poop 🎖️", desc: "Smooth operator! Your digestive system deserves an award.", foodEmoji: "🥇", foodName: "Champion!" }
        ];
        return smoothFeedback[Math.floor(Math.random() * smoothFeedback.length)];
      }
      
      // Soft (type 5)
      if (shape === 5) {
        if (volume === 'Small') {
          return { title: "Soft Nuggets 🍗", desc: "Small and soft. Maybe add some fiber to bulk it up.", foodEmoji: "🌾", foodName: "More Fiber" };
        }
        const softFeedback = [
          { title: "Soft Serve 🍦", desc: "A bit too soft. Cut back on the dairy or greasy food.", foodEmoji: "🥗", foodName: "Light Meals" },
          { title: "Mushy Business 🍮", desc: "Your gut is working overtime. Give it some rest.", foodEmoji: "🍌", foodName: "Bananas" }
        ];
        return softFeedback[Math.floor(Math.random() * softFeedback.length)];
      }
      
      // Mushy (type 6)
      if (shape === 6) {
        if (volume === 'Gigantic') {
          return { title: "Mudslide! 🏔️", desc: "That's a lot of mush. Your gut is not happy.", foodEmoji: "🍚", foodName: "Plain Rice" };
        }
        const mushyFeedback = [
          { title: "Soft Serve Deluxe 🍦", desc: "Too soft! Might be mild inflammation. Eat bland foods.", foodEmoji: "🍞", foodName: "Toast & Rice" },
          { title: "Pudding Problems 🍮", desc: "Your gut needs a break. Stick to simple foods.", foodEmoji: "🥣", foodName: "Light Diet" }
        ];
        return mushyFeedback[Math.floor(Math.random() * mushyFeedback.length)];
      }
      
      // Watery (type 7)
      if (shape === 7) {
        if (volume === 'Gigantic') {
          return { title: "Niagara Falls! 💦", desc: "EMERGENCY HYDRATION NEEDED. Drink electrolytes NOW!", foodEmoji: "🥥", foodName: "Electrolytes!" };
        }
        const wateryFeedback = [
          { title: "Splash Zone 💦", desc: "Houston, we have a problem. Stay hydrated!", foodEmoji: "🥤", foodName: "Fluids!" },
          { title: "Tsunami Warning 🌊", desc: "Your gut is in crisis mode. Rest and hydrate!", foodEmoji: "💧", foodName: "Water & Rest" },
          { title: "Waterfall Mode 🏞️", desc: "This is not ideal. Avoid dairy and spicy food.", foodEmoji: "🍚", foodName: "BRAT Diet" }
        ];
        return wateryFeedback[Math.floor(Math.random() * wateryFeedback.length)];
      }
      
      // Default fallback
      return { title: "Mystery Poop 🔮", desc: "Interesting... Keep tracking for better insights!", foodEmoji: "📊", foodName: "Keep Logging" };
    };
    
    const feedback = getFeedback();
    const adviceTitle = feedback.title;
    const adviceDesc = feedback.desc;
    const foodEmoji = feedback.foodEmoji;
    const foodName = feedback.foodName;

    const finalAdvice = { title: adviceTitle, desc: adviceDesc, foodEmoji, foodName };
    setCurrentAdvice(finalAdvice);

    const newSession: PoopSession = {
        startTime: Date.now() - (lastSessionData.duration * 1000), 
        endTime: Date.now(),
        durationSeconds: lastSessionData.duration,
        earnings: lastSessionData.earnings,
        poop_type: selectedPoopType || undefined,
        poop_color: selectedPoopColor || undefined,
        poop_volume: selectedVolume || undefined,
        conditions: selectedConditions,
        ai_health_advice: adviceDesc
    };

    await sessionService.saveSession(newSession, user.id);
    
    const currentHistory = [...history, newSession]; 
    const previousUnlocked = ACHIEVEMENTS_LIST.filter(a => a.condition(history));
    const currentUnlocked = ACHIEVEMENTS_LIST.filter(a => a.condition(currentHistory));
    const newAchievements = currentUnlocked.filter(a => !previousUnlocked.find(p => p.id === a.id));

    if (newAchievements.length > 0) {
        // Show poop hit animation - longer and funnier
        setPoopHitVisible(true);
        setTimeout(() => setPoopHitVisible(false), 3000);
        
        // Enhanced feedback for first achievement unlock
        showToast(newAchievements[0].title, newAchievements[0].icon, 6000);
        // Play sound if available
        playSound('SCORE');
        
        // Note: New achievements are not marked as viewed yet, so notification will show on home page
    }

    await loadUserData(user.id);
    setIsSaving(false);
    setView(AppView.SUMMARY);
  };

  useEffect(() => {
    if (view === AppView.LEADERBOARD) {
        sessionService.getLeaderboard(leaderboardPeriod).then(setLeaderboard);
    }
  }, [view, leaderboardPeriod]);

  // Reset display limit when switching to history view
  useEffect(() => {
    if (view === AppView.HISTORY) {
      setHistoryDisplayLimit(5);
      setCalendarDisplayLimit(5);
    }
  }, [view]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatTimeVerbose = (totalSeconds: number) => {
      const hours = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${mins}m`;
  };

  const launchGame = (game: string) => {
      setActiveGame(game);
      setShowGameMenu(false);
  }

  const copyToClipboard = async (text: string) => {
      try {
          // Modern clipboard API
          if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(text);
              showToast("ID Copied!", "📋");
          } else {
              // Fallback for older browsers or non-HTTPS
              const textArea = document.createElement('textarea');
              textArea.value = text;
              textArea.style.position = 'fixed';
              textArea.style.left = '-999999px';
              textArea.style.top = '-999999px';
              document.body.appendChild(textArea);
              textArea.focus();
              textArea.select();
              try {
                  const successful = document.execCommand('copy');
                  if (successful) {
                      showToast("ID Copied!", "📋");
                  } else {
                      showToast("Copy failed. ID: " + text, "❌");
                  }
              } catch (err) {
                  showToast("Copy failed. ID: " + text, "❌");
              }
              document.body.removeChild(textArea);
          }
      } catch (err) {
          // Final fallback - show the ID in a toast so user can manually copy
          showToast("ID: " + text, "📋");
      }
  }

  // --- RENDERERS ---

  const renderActiveSession = () => (
    <>
      <style>{`
        @keyframes waveFlow {
          0%, 100% {
            transform: translateY(0px) scale(1);
          }
          25% {
            transform: translateY(-3px) scale(1.05);
          }
          50% {
            transform: translateY(0px) scale(1);
          }
          75% {
            transform: translateY(3px) scale(0.95);
          }
        }
      `}</style>
    <div className="flex flex-col h-[100dvh] bg-brand-cream relative overflow-hidden">
      <div className="absolute top-4 left-0 right-0 flex justify-center z-10">
          <div className="bg-black/80 text-white px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-2 shadow-sm animate-pulse">
            <Globe size={10} className="text-blue-400" /> 
            <span>Call of Doodie: {onlinePoopers.toLocaleString()} online</span>
          </div>
      </div>

      <div className="flex-1 flex flex-col p-6">
          <div className="grid grid-cols-2 gap-3 mt-12 mb-auto">
            <div className="bg-white border-2 border-black rounded-xl p-3 flex flex-col items-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Earned</span>
               <span className="text-2xl font-black text-green-600 truncate max-w-full">{settings.currencySymbol}{currentEarnings.toFixed(2)}</span>
            </div>
            <div className="bg-white border-2 border-black rounded-xl p-3 flex flex-col items-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Time</span>
               <span className="text-2xl font-black text-brand-brown">{formatTime(elapsedSeconds)}</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-6 mb-8">
              <div className="flex flex-col items-center justify-center relative">
                <div className="relative">
                    <div className="text-8xl animate-bounce filter drop-shadow-xl">💩</div>
                </div>
                <div className="mt-4 bg-brand-yellow/30 px-4 py-1 rounded-full">
                    <p className="text-brand-brown font-black animate-pulse text-xs tracking-widest uppercase">Making Money...</p>
                </div>
              </div>
              
              <div className="w-full space-y-3">
                  <div className="flex gap-3">
                        <button onClick={() => setShowGameMenu(true)} className="flex-1 bg-brand-green border-2 border-black py-4 rounded-xl font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all flex flex-col items-center justify-center gap-1">
                            <Gamepad2 size={24} /> 
                            <span className="text-xs">GAMES</span>
                        </button>
                        <button onClick={togglePrivacyNoise} className={`flex-1 border-2 border-black py-4 rounded-xl font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all flex flex-col items-center justify-center gap-1 ${isPrivacyNoiseOn ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {isPrivacyNoiseOn ? (
                                <span className="text-2xl inline-block" style={{
                                    animation: 'waveFlow 2s ease-in-out infinite'
                                }}>🌊</span>
                            ) : <VolumeX size={24} />} 
                            <span className="text-xs">{isPrivacyNoiseOn ? 'SOUND ON' : 'SOUND OFF'}</span>
                        </button>
                  </div>

                  <Button variant="danger" fullWidth onClick={handleStopTimer} className="text-xl py-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none border-2">
                      <Square fill="currentColor" size={24} /> FINISH & WIPE
                  </Button>
              </div>
          </div>
      </div>
    </div>
    </>
  );
  
  const renderSummary = () => {
    const advice = currentAdvice;
    let mainIcon = '❓';
    let bgColor = 'bg-brand-blue';
    if (selectedPoopType) {
        const t = BRISTOL_SCALE.find(b => b.type === selectedPoopType);
        if (t) mainIcon = t.emoji;
    }

    return (
      <div className="max-w-md mx-auto h-screen bg-brand-cream p-6 pt-8 flex flex-col overflow-y-auto">
        <h2 className="text-3xl font-black text-brand-brown mb-6 text-center">Session Report 📊</h2>
        
        <div className="bg-white border-4 border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6 transform -rotate-1">
            <div className="flex justify-between items-end border-b-2 border-dashed border-gray-300 pb-2 mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">EARNINGS</span>
                <span className="text-3xl font-black text-green-600">{settings.currencySymbol}{lastSessionData?.earnings.toFixed(2)}</span>
            </div>
            <p className="text-sm font-bold text-brand-brown italic">"{financialAnalysis}"</p>
        </div>

        <div className={`${bgColor} border-4 border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-4 flex items-center gap-4 transform rotate-1`}>
             <div className="w-16 h-16 bg-white border-2 border-black rounded-full flex items-center justify-center text-4xl shrink-0">
                 {mainIcon}
             </div>
             <div>
                 <div className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-1">YOUR BUTT SAYS:</div>
                 <div className="font-black text-xl leading-none mb-1">{advice ? advice.title : "Mystery Poop"}</div>
                 <div className="text-xs font-bold text-blue-900 leading-tight">{advice ? advice.desc : "Select a shape next time!"}</div>
             </div>
        </div>

        {advice && (
            <div className="bg-brand-pink border-4 border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-4 flex flex-row-reverse items-center gap-4 transform -rotate-1">
                <div className="w-16 h-16 bg-white border-2 border-black rounded-full flex items-center justify-center text-4xl shrink-0">
                    {advice.foodEmoji}
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-black text-pink-900 uppercase tracking-widest mb-1">ADVICE:</div>
                    <div className="font-black text-xl leading-none mb-1">{advice.foodName}</div>
                    <div className="text-xs font-bold text-pink-900 leading-tight">Trust me, it helps.</div>
                </div>
            </div>
        )}

        <div className="space-y-3 mt-4">
             <Button fullWidth onClick={() => setView(AppView.HOME)}>
                 Back to Work (Sadly) <ArrowRight size={20} />
             </Button>
        </div>
      </div>
    );
  };
  if (isVerifying) return <div className="h-screen flex flex-col items-center justify-center bg-brand-cream"><div className="animate-spin text-6xl mb-4">💩</div><span className="font-bold text-brand-brown">Loading...</span></div>;
  const renderOnboarding = () => (
    <div className="max-w-md mx-auto h-screen bg-brand-cream p-6 flex flex-col justify-center space-y-6">
        <div className="flex items-center gap-4 mb-4">
            <button 
                onClick={() => {
                    // Clear user data and return to auth page
                    setUser(null);
                    setAuthInput('');
                    setIsRegistering(true);
                    localStorage.removeItem('poopPay_user_id');
                    setView(AppView.AUTH);
                }} 
                className="p-2 bg-white rounded-full border-2 border-black hover:bg-gray-100"
            >
                <ChevronLeft size={20} />
            </button>
            <h1 className="text-3xl font-black text-brand-brown text-center flex-1">Setup Profile</h1>
            <div className="w-10"></div> {/* Spacer for centering */}
        </div>
        <div className="flex justify-center mb-[-10px]"><div className="text-6xl animate-bounce-slow">💩</div></div>
        <Card title="Salary Info">
            <div className="space-y-4">
                <label className="block text-sm font-bold text-gray-700">Monthly Salary</label>
                <div className="flex gap-2">
                    <select className="border-2 border-black rounded-xl p-3 bg-white font-bold" value={settings.currencySymbol} onChange={(e) => setSettings({...settings, currencySymbol: e.target.value})}><option value="RM">RM (MYR)</option><option value="$">USD ($)</option><option value="SGD">SGD (S$)</option><option value="€">EUR (€)</option><option value="£">GBP (£)</option><option value="¥">JPY/CNY (¥)</option><option value="₩">KRW (₩)</option><option value="NT$">TWD (NT$)</option></select>
                    <input type="number" className="border-2 border-black rounded-xl p-3 w-full font-bold" value={settings.monthlySalary || ''} onChange={(e) => setSettings({...settings, monthlySalary: Number(e.target.value)})} placeholder="0.00" />
                </div>
                <Button fullWidth disabled={!settings.monthlySalary} onClick={async () => { 
                    if (user) {
                        await settingsService.saveSettings(user.id, settings);
                        setView(AppView.HOME);
                    }
                }}>Save & Start</Button>
            </div>
        </Card>
    </div>
  );
  const renderHome = () => {
    const unlockedIds = ACHIEVEMENTS_LIST.filter(a => a.condition(history)).map(a => a.id);
    const unviewedCount = unlockedIds.filter(id => !viewedAchievements.has(id)).length;
    const ratePerSec = calculateRatePerSecond();
    const latestSession = history[0];

    return (
    <div className="flex flex-col h-full p-6 pt-8 items-center overflow-y-auto pb-8">
      {/* Header */}
      <div className="w-full flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2"><div className="w-8 h-8 bg-brand-brown rounded-full flex items-center justify-center text-white font-bold">{(user?.username || '?').charAt(0).toUpperCase()}</div><div className="flex flex-col leading-none"><span className="font-bold text-gray-700">{user?.username || 'Guest'}</span><span className="text-xs text-green-600 font-bold">Online</span></div></div>
        <div className="flex gap-2"><button onClick={() => setView(AppView.ACHIEVEMENTS)} className="p-2 bg-white border-2 border-black rounded-full hover:bg-gray-100 relative"><Award size={20} className="text-brand-brown" />{unviewedCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full border border-black font-black">{unviewedCount}</span>}</button><button onClick={() => setView(AppView.LEADERBOARD)} className="p-2 bg-white border-2 border-black rounded-full hover:bg-gray-100"><Trophy size={20} className="text-yellow-600" /></button><button onClick={() => setView(AppView.SETTINGS)} className="p-2 bg-white border-2 border-black rounded-full hover:bg-gray-100"><Settings size={20} /></button></div>
      </div>
      
      {/* Start Button */}
      <div className="relative group mt-12 mb-10 shrink-0">
          <div className="absolute inset-0 bg-black rounded-full translate-y-2 translate-x-2"></div>
          <button onClick={handleStartTimer} className="relative w-64 h-64 bg-brand-yellow rounded-full border-4 border-black flex flex-col items-center justify-center cursor-pointer active:translate-y-2 active:translate-x-2 active:shadow-none transition-all">
              <span className="text-6xl mb-2 group-hover:animate-wiggle">🚽</span>
              <span className="text-3xl font-black text-brand-brown">START</span>
              <span className="text-sm font-bold text-brand-brown opacity-75">POOPING</span>
          </button>
      </div>

      {/* Stats Grid */}
      <div className="w-full grid grid-cols-2 gap-3 shrink-0">
          <Card className="flex flex-col items-center justify-center p-3 h-24">
              <span className="text-gray-500 text-[10px] font-bold uppercase">Rate / Sec</span>
              <span className="text-xl font-black text-brand-brown truncate max-w-full">{settings.currencySymbol}{ratePerSec.toFixed(4)}</span>
          </Card>
          <Card className="flex flex-col items-center justify-center p-3 h-24">
              <span className="text-gray-500 text-[10px] font-bold uppercase">Total Earned</span>
              <span className="text-lg font-bold text-green-600 truncate max-w-full">{settings.currencySymbol}{history.reduce((acc, curr) => acc + curr.earnings, 0).toFixed(2)}</span>
          </Card>
          
          {/* Arcade Button (Short Card) */}
          <button onClick={() => setShowGameMenu(true)} className="bg-brand-green border-2 border-black rounded-2xl p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all flex flex-col items-center justify-center gap-1 h-24 relative overflow-hidden group">
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
              <Gamepad2 size={24} className="text-green-900" />
              <span className="font-black text-green-900 text-sm">ARCADE</span>
          </button>

          {/* History Button (Short Card) */}
          <button onClick={() => setView(AppView.HISTORY)} className="bg-brand-blue border-2 border-black rounded-2xl p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all flex flex-col items-center justify-center gap-1 h-24 relative overflow-hidden group">
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
              <History size={24} className="text-blue-900" />
              <span className="font-black text-blue-900 text-sm">HISTORY</span>
          </button>
      </div>

      {/* Last Session Detail Card */}
      <div className="w-full mt-4 shrink-0">
          <div className="bg-white border-2 border-black rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center gap-2 mb-2 border-b-2 border-dashed border-gray-200 pb-2">
                   <Clock size={16} className="text-brand-brown" />
                   <h3 className="font-bold text-sm text-brand-brown uppercase">Last Drop</h3>
              </div>
              
              {latestSession ? (
                  <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-gray-100 rounded-lg border-2 border-black flex items-center justify-center text-2xl">
                              {latestSession.poop_type ? BRISTOL_SCALE.find(b => b.type === latestSession.poop_type)?.emoji : '💩'}
                          </div>
                          <div>
                              <div className="text-green-600 font-black text-xl leading-none">+{settings.currencySymbol}{latestSession.earnings.toFixed(2)}</div>
                              <div className="text-xs font-bold text-gray-400 mt-1">{new Date(latestSession.startTime).toLocaleDateString()}</div>
                          </div>
                      </div>
                      <div className="text-right">
                          <div className="font-bold text-gray-700 text-lg">{formatTime(latestSession.durationSeconds)}</div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase">Duration</div>
                      </div>
                  </div>
              ) : (
                  <div className="py-2 text-center text-gray-400 font-bold text-sm">
                      No logs yet. Start pooping!
                  </div>
              )}
          </div>
      </div>
    </div>
    );
  };
  const renderAuth = () => (
    <div className="flex flex-col h-full justify-start p-6 space-y-4 pt-8">
        <div className="flex flex-col items-center mb-2">
            <div className="relative">
                <div className="text-8xl animate-bounce z-10 relative">💩</div>
                <div className="absolute -top-6 -right-4 text-4xl animate-bounce" style={{ animationDelay: '0.1s' }}>👑</div>
                <div className="absolute bottom-2 -left-4 text-4xl animate-bounce" style={{ animationDelay: '0.2s' }}>💵</div>
            </div>
            <h1 className="text-5xl font-black text-brand-brown tracking-tighter drop-shadow-lg mt-2" style={{ textShadow: '3px 3px 0 #FFF, 5px 5px 0 #000' }}>
                Poop<span className="text-brand-green">Pay</span>
            </h1>
            <p className="text-gray-600 font-bold mt-2">Earn while you burn.</p>
        </div>

        <Card className="space-y-4">
            <div className="flex justify-center gap-4 border-b-2 border-gray-100 pb-4">
                <button onClick={() => setIsRegistering(true)} className={`text-sm font-bold pb-1 ${isRegistering ? 'text-brand-brown border-b-2 border-brand-brown' : 'text-gray-400'}`}>NEW USER</button>
                <button onClick={() => setIsRegistering(false)} className={`text-sm font-bold pb-1 ${!isRegistering ? 'text-brand-brown border-b-2 border-brand-brown' : 'text-gray-400'}`}>RECOVER ID</button>
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">{isRegistering ? "Pick a cool Username" : "Enter your Secret ID"}</label>
                <input type="text" className="border-2 border-black rounded-xl p-3 w-full font-bold" placeholder={isRegistering ? "e.g. ToiletKing99" : "UUID..."} value={authInput} onChange={(e) => setAuthInput(e.target.value)} />
            </div>
            <Button fullWidth onClick={handleAuth}>{isRegistering ? "Start Pooping" : "Recover Data"}</Button>
        </Card>
        
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-3 rounded-r shadow-sm">
            <div className="flex items-start gap-2">
                <AlertTriangle className="text-yellow-600 shrink-0 mt-0.5" size={18} />
                <p className="text-sm text-yellow-800 font-bold leading-tight">
                    Please remember your Secret ID at your user profile! You will need it to log in to the same account on a different device.
                </p>
            </div>
        </div>
    </div>
  );
  const renderSettings = () => (
    <div className="max-w-md mx-auto h-screen bg-brand-cream flex flex-col p-6 space-y-6">
        <div className="flex items-center gap-4">
            <button onClick={() => setView(AppView.HOME)} className="p-2 bg-white rounded-full border-2 border-black"><Home size={20} /></button>
            <h2 className="text-2xl font-black text-brand-brown">Settings</h2>
        </div>
        
        <Card title="Profile">
             <div className="mb-4">
                 {editingUsername ? (
                     <div className="flex gap-2">
                         <input 
                            className="border-2 border-black rounded-lg p-2 flex-1 font-bold" 
                            placeholder={user?.username} 
                            value={newUsername} 
                            onChange={e => setNewUsername(e.target.value)}
                         />
                         <button onClick={handleUpdateUsername} className="bg-brand-green border-2 border-black p-2 rounded-lg font-bold"><Check size={20} /></button>
                         <button onClick={() => setEditingUsername(false)} className="bg-gray-200 border-2 border-black p-2 rounded-lg font-bold"><X size={20} /></button>
                     </div>
                 ) : (
                     <div className="flex justify-between items-center">
                         <div className="font-bold text-lg">{user?.username}</div>
                         <button onClick={() => { setEditingUsername(true); setNewUsername(user?.username || ''); }} className="text-brand-brown p-1 hover:bg-gray-100 rounded"><Edit2 size={16} /></button>
                     </div>
                 )}
                 <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded mt-2 flex items-center justify-between">
                     <span className="font-mono truncate mr-2 max-w-[200px]">{user?.id}</span>
                     <button onClick={() => copyToClipboard(user?.id || '')} className="text-brand-brown hover:bg-gray-200 p-1 rounded"><Copy size={14} /></button>
                 </div>
                 <div className="mt-2 text-[10px] text-red-500 font-bold flex items-center gap-1">
                     <AlertTriangle size={12} />
                     <span>Save this ID to login on other devices!</span>
                 </div>
             </div>
        </Card>

        <Card title="Work Config">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Monthly Salary</label>
                    <div className="flex gap-2">
                        <select className="border-2 border-black rounded-xl p-2 bg-white font-bold text-sm flex-shrink-0" style={{ minWidth: '120px' }} value={settings.currencySymbol} onChange={(e) => setSettings({...settings, currencySymbol: e.target.value})}>
                            <option value="RM">RM (MYR)</option>
                            <option value="$">USD ($)</option>
                            <option value="SGD">SGD (S$)</option>
                            <option value="€">EUR (€)</option>
                            <option value="£">GBP (£)</option>
                            <option value="¥">JPY/CNY (¥)</option>
                            <option value="₩">KRW (₩)</option>
                            <option value="NT$">TWD (NT$)</option>
                        </select>
                        <input type="number" className="border-2 border-black rounded-xl p-2 flex-1 font-bold text-sm min-w-0" value={settings.monthlySalary || ''} onChange={(e) => setSettings({...settings, monthlySalary: Number(e.target.value)})} placeholder="0.00" />
                    </div>
                </div>
                <Button fullWidth onClick={async () => { 
                    if (user) {
                        await settingsService.saveSettings(user.id, settings);
                        setView(AppView.HOME);
                    }
                }}>Save Changes</Button>
            </div>
        </Card>
        
        <Button variant="danger" fullWidth onClick={handleLogout}><LogOut size={18} /> Logout</Button>
    </div>
  );
  
  const renderPoopCheck = () => (
      <div className="max-w-md mx-auto h-screen bg-brand-cream p-3 pt-3 flex flex-col overflow-hidden">
          <div className="text-center mb-1.5 shrink-0">
              <h2 className="text-lg font-black text-brand-brown">Describe your Drop</h2>
              <p className="text-gray-500 font-bold text-[9px]">Fine tune every detail.</p>
          </div>
          
          <div className="flex-1 flex flex-col space-y-2 min-h-0">
              {/* COMPOSITION */}
              <div>
                  <h3 className="text-[9px] font-black text-gray-600 mb-1 uppercase tracking-wide px-1">Composition</h3>
                  <div className="grid grid-cols-4 gap-1">
                      {BRISTOL_SCALE.map((item) => { 
                          const isSelected = selectedPoopType === item.type; 
                          return ( 
                              <button key={item.type} onClick={() => setSelectedPoopType(item.type)} className={`aspect-square rounded-lg flex flex-col items-center justify-center p-0.5 transition-all duration-200 border-2 ${isSelected ? 'border-3 border-black bg-brand-yellow shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'border-black bg-white shadow-sm hover:bg-gray-50'} `} > 
                                  <div className="text-base">{item.emoji}</div> 
                                  <div className="text-[7px] font-black text-brand-brown leading-tight">{item.label}</div> 
                              </button> 
                          ) 
                      })}
                  </div>
              </div>

              {/* VOLUME */}
              <div>
                  <h3 className="text-[9px] font-black text-gray-600 mb-1 uppercase tracking-wide px-1">Volume</h3>
                  <div className="grid grid-cols-4 gap-1">
                      {['Small', 'Normal', 'Huge', 'Gigantic'].map((vol) => {
                          const isSelected = selectedVolume === vol;
                          let size = 'text-sm';
                          if (vol === 'Huge') size = 'text-base';
                          if (vol === 'Gigantic') size = 'text-lg';
                          
                          return (
                              <button key={vol} onClick={() => setSelectedVolume(vol as any)} className={`aspect-square rounded-lg flex flex-col items-center justify-center p-0.5 transition-all duration-200 border-2 ${isSelected ? 'border-3 border-black bg-brand-green shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'border-black bg-white shadow-sm'} `}>
                                   <div className={`${size}`}>💩</div>
                                   <div className="text-[7px] font-black uppercase leading-tight">{vol}</div>
                              </button>
                          )
                      })}
                  </div>
              </div>

              {/* COLOUR */}
              <div>
                  <h3 className="text-[9px] font-black text-gray-600 mb-1 uppercase tracking-wide px-1">Colour</h3>
                  <div className="grid grid-cols-4 gap-1">
                      {POOP_COLORS.map((item) => {
                          const isSelected = selectedPoopColor === item.id;
                          return (
                              <button key={item.id} onClick={() => setSelectedPoopColor(item.id)} className={`aspect-square rounded-lg flex flex-col items-center justify-center p-0.5 transition-all duration-200 border-2 ${isSelected ? 'border-3 border-black bg-brand-blue shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'border-black bg-white shadow-sm hover:bg-gray-50'} `}>
                                   <div className={`w-4 h-4 rounded-full border-2 border-black/20 ${item.bg} shadow-inner`}></div>
                                   <div className="text-[7px] font-black text-brand-brown uppercase leading-tight mt-0.5">{item.label}</div>
                              </button>
                          )
                      })}
              </div>
          </div>
          
              {/* BUTTONS - Now part of the same flex container */}
              <div className="mt-auto pt-2 space-y-1.5">
                  <Button fullWidth onClick={handlePoopCheckSubmit} disabled={!selectedPoopType || isSaving} className="text-sm py-2">
                      {isSaving ? "Flushing..." : "💩 Flush It!"}
              </Button>
                  <Button fullWidth variant="ghost" onClick={handleSkip} disabled={isSaving} className="text-sm py-2 text-gray-500">
                  Skip Details
              </Button>
              </div>
          </div>
      </div>
  );
  // Currency conversion rates (simplified - in production, use real-time API)
  const getCurrencyRate = (from: string, to: string): number => {
    // Base currency: RM (MYR)
    const rates: Record<string, number> = {
      'RM': 1.0,
      '$': 0.21, // USD
      'SGD': 0.28,
      '€': 0.19, // EUR
      '£': 0.17, // GBP
      '¥': 31.0, // JPY/CNY
      '₩': 280.0, // KRW
      'NT$': 6.5 // TWD
    };
    
    const fromRate = rates[from] || 1.0;
    const toRate = rates[to] || 1.0;
    return toRate / fromRate;
  };

  const convertCurrency = (amount: number, fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return amount;
    const rate = getCurrencyRate(fromCurrency, toCurrency);
    return amount * rate;
  };

  const renderLeaderboard = () => {
    // Assume all earnings in leaderboard are stored in RM (base currency)
    // Convert to user's selected currency
    const baseCurrency = 'RM';
    const userCurrency = settings.currencySymbol;
    
    return (
      <div className="max-w-md mx-auto h-screen bg-brand-cream p-4 space-y-4">
        <div className="flex items-center gap-4 py-2">
          <button onClick={() => setView(AppView.HOME)} className="p-2 bg-white rounded-full border-2 border-black">
            <Home size={20} />
          </button>
          <h2 className="text-2xl font-black text-brand-brown">Leaderboard</h2>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pb-20">
          {leaderboard.length === 0 && <p className="text-center text-gray-500">No data available.</p>}
          {leaderboard.map((entry, idx) => {
            const convertedEarnings = convertCurrency(entry.total_earnings, baseCurrency, userCurrency);
            return (
              <div key={idx} className="bg-white border-2 border-black rounded-xl p-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="font-bold">{idx + 1}. {entry.username}</div>
                </div>
                <div className="font-black text-green-600">
                  {userCurrency}{convertedEarnings.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const handleAchievementNotificationClick = () => {
    if (!user) return;
    const unlockedIds = ACHIEVEMENTS_LIST.filter(a => a.condition(history)).map(a => a.id);
    const newViewed = new Set(unlockedIds);
    setViewedAchievements(newViewed);
    localStorage.setItem(`poopPay_viewed_achievements_${user.id}`, JSON.stringify(Array.from(newViewed)));
  };

  const renderAchievements = () => {
    const unlockedIds = ACHIEVEMENTS_LIST.filter(a => a.condition(history)).map(a => a.id);
    const earnedCount = unlockedIds.length;
    const unviewedCount = unlockedIds.filter(id => !viewedAchievements.has(id)).length;
    
    return (
        <div className="flex flex-col h-full p-4 space-y-4">
            <div className="flex items-center gap-4 py-2">
                <button onClick={() => setView(AppView.HOME)} className="p-2 bg-white rounded-full border-2 border-black hover:bg-gray-100">
                    <Home size={20} />
                </button>
                <h2 className="text-2xl font-black text-brand-brown">Achievements</h2>
                {unviewedCount > 0 && (
                    <button 
                        onClick={handleAchievementNotificationClick}
                        className="relative bg-red-500 text-white rounded-full px-3 py-1 text-sm font-black border-2 border-black hover:bg-red-600 transition-colors"
                    >
                        {unviewedCount}
                    </button>
                )}
            </div>
            <div className="bg-brand-brown text-brand-yellow p-4 rounded-xl border-2 border-black flex items-center justify-between">
                <div>
                    <div className="text-sm font-bold opacity-80">UNLOCKED</div>
                    <div className="text-3xl font-black">{earnedCount} / {ACHIEVEMENTS_LIST.length}</div>
                </div>
                <div className="text-4xl">🏆</div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pb-20">
                {ACHIEVEMENTS_LIST.map((ach) => { 
                    const isUnlocked = unlockedIds.includes(ach.id);
                    const isUnviewed = isUnlocked && !viewedAchievements.has(ach.id);
                    return ( 
                        <div 
                            key={ach.id} 
                            className={`border-2 rounded-xl p-3 flex items-center gap-4 transition-all ${isUnlocked ? 'bg-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'bg-gray-200 border-gray-400 opacity-60 grayscale'} ${isUnviewed ? 'ring-4 ring-yellow-400 animate-pulse' : ''}`}
                        > 
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl border-2 ${isUnlocked ? 'bg-brand-yellow border-black' : 'bg-gray-300 border-gray-400'}`}> 
                                {ach.icon} 
                            </div> 
                            <div className="flex-1"> 
                                <h3 className={`font-black ${isUnlocked ? 'text-brand-brown' : 'text-gray-600'}`}>{ach.title}</h3> 
                                <p className="text-xs text-gray-500 leading-tight">{ach.description}</p> 
                            </div> 
                            {isUnlocked && <Check size={20} className="text-green-600" />} 
                        </div> 
                    ) 
                })}
            </div>
        </div>
    );
  };
  
  // --- HISTORY & CALENDAR LOGIC ---
  const getDaysInMonth = (date: Date) => {
      return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };
  const getFirstDayOfMonth = (date: Date) => {
      return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.value) {
          setCalendarCursor(new Date(e.target.value));
          setSelectedDay(null); // Reset selection on month change
      }
  };
  
  const prevMonth = () => {
      setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1));
  };
  const nextMonth = () => {
      setCalendarCursor(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1));
  };

  const renderHistory = () => {
    // Stats Calculations
    const sortedHistory = [...history].sort((a, b) => a.startTime - b.startTime);
    const totalLogs = history.length;
    const totalDuration = history.reduce((acc, curr) => acc + curr.durationSeconds, 0);
    const avgDuration = totalLogs > 0 ? Math.round(totalDuration / totalLogs) : 0;

    // Calculate Streak
    let maxStreak = 0;
    let currentStreak = 0;
    let bestRangeStr = '-';

    // Get unique sorted dates (oldest first)
    const days = Array.from(new Set(sortedHistory.map(s => new Date(s.startTime).toDateString())))
                      .map(d => new Date(d))
                      .sort((a,b) => a.getTime() - b.getTime());

    if (sortedHistory.length > 0) {
        // Calculate Max Streak with Date Range
        let currentRun = 0;
        let runStart: Date | null = null;
        let prevDate: Date | null = null;

        for (const d of days) {
            if (!prevDate) {
                currentRun = 1;
                runStart = d;
            } else {
                const diff = (d.getTime() - prevDate.getTime()) / (1000 * 3600 * 24);
                if (diff <= 1.1 && diff >= 0.9) { // Consecutive (approx 1 day)
                    currentRun++;
                } else {
                    if (currentRun > maxStreak) {
                        maxStreak = currentRun;
                        if (runStart) {
                            bestRangeStr = `${runStart.toLocaleDateString(undefined, {month:'short', day:'numeric'})} - ${prevDate.toLocaleDateString(undefined, {month:'short', day:'numeric'})}`;
                        }
                    }
                    currentRun = 1;
                    runStart = d;
                }
            }
            prevDate = d;
        }
        // Check last run
        if (currentRun > maxStreak && runStart && prevDate) {
            maxStreak = currentRun;
            bestRangeStr = `${runStart.toLocaleDateString(undefined, {month:'short', day:'numeric'})} - ${prevDate.toLocaleDateString(undefined, {month:'short', day:'numeric'})}`;
        }
        
        // Single day streak fix for display
        if (maxStreak === 1 && runStart) {
             bestRangeStr = runStart.toLocaleDateString(undefined, {month:'short', day:'numeric'});
        }

        // Calculate Current Streak
        const today = new Date();
        today.setHours(0,0,0,0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (days.length > 0) {
            const lastLogDate = days[days.length - 1];
            // If the last log was today or yesterday, streak is active
            if (lastLogDate.getTime() === today.getTime() || lastLogDate.getTime() === yesterday.getTime()) {
                currentStreak = 1;
                for (let i = days.length - 2; i >= 0; i--) {
                    const curr = days[i];
                    const next = days[i+1];
                    const diff = (next.getTime() - curr.getTime()) / (1000 * 3600 * 24);
                    if (diff >= 0.9 && diff <= 1.1) {
                        currentStreak++;
                    } else {
                        break;
                    }
                }
            }
        }
    }

    const selectedDaySessions = selectedDay 
        ? history.filter(s => new Date(s.startTime).toDateString() === selectedDay.toDateString())
        : [];

    return (
    <div className="max-w-md mx-auto h-screen bg-brand-cream p-4 space-y-4 flex flex-col overflow-x-hidden">
        <div className="flex items-center gap-4 py-2 shrink-0">
            <button onClick={() => setView(AppView.HOME)} className="p-2 bg-white rounded-full border-2 border-black"><Home size={20} /></button>
            <h2 className="text-2xl font-black text-brand-brown">Poop History</h2>
        </div>

        {/* View Switcher */}
        <div className="flex bg-white rounded-xl border-2 border-black p-1 shrink-0">
            <button 
                onClick={() => setHistoryViewMode('LIST')} 
                className={`flex-1 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors ${historyViewMode === 'LIST' ? 'bg-brand-yellow text-black' : 'text-gray-400 hover:bg-gray-100'}`}
            >
                <ListIcon size={16} /> List
            </button>
            <button 
                onClick={() => setHistoryViewMode('CALENDAR')} 
                className={`flex-1 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors ${historyViewMode === 'CALENDAR' ? 'bg-brand-yellow text-black' : 'text-gray-400 hover:bg-gray-100'}`}
            >
                <CalendarIcon size={16} /> Calendar
            </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-20">
            {/* GLOBAL STATS GRID */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-white border-2 border-black rounded-xl p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-1 text-gray-500">
                        <Timer size={14} />
                        <span className="text-[10px] font-black uppercase">Total Time</span>
                    </div>
                    <div className="text-lg font-black text-brand-brown leading-tight">{formatTimeVerbose(totalDuration)}</div>
                </div>
                <div className="bg-white border-2 border-black rounded-xl p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-1 text-gray-500">
                        <Hash size={14} />
                        <span className="text-[10px] font-black uppercase">Total Drops</span>
                    </div>
                    <div className="text-2xl font-black text-brand-brown">{totalLogs}</div>
                </div>
                <div className="bg-white border-2 border-black rounded-xl p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-1 text-gray-500">
                        <Activity size={14} />
                        <span className="text-[10px] font-black uppercase">Avg. Duration</span>
                    </div>
                    <div className="text-lg font-black text-brand-brown">{formatTime(avgDuration)}</div>
                </div>
                
                {/* Combined Streak Card */}
                <div className="bg-white border-2 border-black rounded-xl p-3 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center gap-2 mb-1 text-gray-500">
                        <Flame size={14} className="text-orange-500 fill-orange-500" />
                        <span className="text-[10px] font-black uppercase">Streaks</span>
                    </div>
                    <div className="flex justify-between items-start">
                        <div className="flex-1">
                            <div className="text-[10px] font-bold text-gray-400 uppercase">Current</div>
                            <div className="text-xl font-black text-orange-500 leading-none">{currentStreak}</div>
                        </div>
                        <div className="flex-1 text-right">
                            <div className="text-[10px] font-bold text-gray-400 uppercase">Best</div>
                            <div className="text-xl font-black text-brand-brown leading-none">{maxStreak}</div>
                            <div className="text-[8px] text-gray-400 font-bold mt-0.5 break-words">{bestRangeStr}</div>
                        </div>
                    </div>
                </div>
            </div>

            {historyViewMode === 'LIST' ? (
                <div className="space-y-3">
                    {history.length === 0 && <div className="text-center text-gray-400 font-bold py-10">No logs yet. Start pooping!</div>}
                    {[...history].reverse().slice(0, historyDisplayLimit).map((session, index) => (
                        <Card key={session.id || index} className="flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-xs font-bold text-gray-400">{new Date(session.startTime).toLocaleDateString()} {new Date(session.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                    <div className="text-2xl font-black text-green-600">+{settings.currencySymbol}{session.earnings.toFixed(2)}</div>
                                    <div className="text-xs text-brand-brown font-bold mt-1">
                                        {session.poop_type ? BRISTOL_SCALE.find(b => b.type === session.poop_type)?.label : 'Unknown Shape'}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <div className="bg-brand-cream px-2 py-1 rounded-lg border-2 border-black text-sm font-bold">{formatTime(session.durationSeconds)}</div>
                                    <div className="text-2xl">{session.poop_type ? BRISTOL_SCALE.find(b => b.type === session.poop_type)?.emoji : '💩'}</div>
                                </div>
                            </div>
                        </Card>
                    ))}
                    {history.length > historyDisplayLimit && (
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setHistoryDisplayLimit(prev => Math.min(prev + 5, history.length))}
                                className="flex-1 bg-brand-yellow border-2 border-black rounded-xl p-3 font-black text-brand-brown hover:bg-yellow-400 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"
                            >
                                View More ({Math.min(5, history.length - historyDisplayLimit)} more)
                            </button>
                            {historyDisplayLimit > 5 && (
                                <button 
                                    onClick={() => setHistoryDisplayLimit(5)}
                                    className="bg-gray-200 border-2 border-black rounded-xl p-3 font-black text-gray-700 hover:bg-gray-300 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"
                                >
                                    Hide
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {/* CALENDAR */}
                    <div className="bg-white border-2 border-black rounded-xl p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-x-hidden">
                        <div className="flex justify-between items-center mb-3 px-1">
                            <button 
                                onClick={prevMonth} 
                                className="p-2 hover:bg-gray-200 rounded-full transition-colors touch-none"
                                onTouchStart={(e) => e.stopPropagation()}
                                onTouchMove={(e) => e.stopPropagation()}
                            >
                                <ChevronLeft size={24} />
                            </button>
                            
                            <div className="flex items-center gap-2 flex-1 justify-center min-w-0">
                                <span className="font-black text-lg text-brand-brown truncate">
                                    {calendarCursor.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                </span>
                                
                                {/* Date Picker Trigger Icon */}
                                <div className="relative flex-shrink-0">
                                    <button className="p-0.5 bg-brand-cream border-2 border-black rounded-md hover:bg-brand-yellow transition-colors shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none touch-none">
                                        <ChevronDown size={14} className="text-brand-brown" />
                                    </button>
                                    {/* Invisible Input Overlaying ONLY the icon */}
                                    <input 
                                        type="month" 
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                        value={`${calendarCursor.getFullYear()}-${String(calendarCursor.getMonth() + 1).padStart(2, '0')}`}
                                        onChange={handleDateChange}
                                        onClick={(e) => {
                                            try {
                                                if ('showPicker' in e.currentTarget) {
                                                    (e.currentTarget as any).showPicker();
                                                }
                                            } catch (err) { }
                                        }}
                                    />
                                </div>
                            </div>

                            <button 
                                onClick={nextMonth} 
                                className="p-2 hover:bg-gray-200 rounded-full transition-colors touch-none"
                                onTouchStart={(e) => e.stopPropagation()}
                                onTouchMove={(e) => e.stopPropagation()}
                            >
                                <ChevronRight size={24} />
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-7 gap-0.5 text-center mb-2">
                            {['S','M','T','W','T','F','S'].map((d, i) => (
                                <div key={i} className="text-[10px] font-bold text-gray-400">{d}</div>
                            ))}
                        </div>
                        
                        <div className="grid grid-cols-7 gap-0.5 w-full">
                            {Array.from({ length: getFirstDayOfMonth(calendarCursor) }).map((_, i) => (
                                <div key={`empty-${i}`} className="aspect-square"></div>
                            ))}
                            
                            {Array.from({ length: getDaysInMonth(calendarCursor) }).map((_, i) => {
                                const day = i + 1;
                                const date = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), day);
                                const dateStr = date.toDateString();
                                const sessionsToday = history.filter(s => new Date(s.startTime).toDateString() === dateStr);
                                const hasPoop = sessionsToday.length > 0;
                                const isToday = new Date().toDateString() === new Date().toDateString();
                                const isSelected = selectedDay?.toDateString() === dateStr;

                                return (
                                    <button 
                                        key={day} 
                                        onClick={() => setSelectedDay(date)}
                                        onTouchStart={(e) => e.stopPropagation()}
                                        onTouchMove={(e) => e.stopPropagation()}
                                        className={`aspect-square rounded-md border-2 flex flex-col items-center justify-center relative transition-all active:scale-95 touch-none
                                            ${isToday ? 'border-brand-blue bg-blue-50' : 'border-gray-100 bg-gray-50'}
                                            ${hasPoop ? 'border-brand-brown bg-yellow-50' : ''}
                                            ${isSelected ? 'ring-2 ring-black scale-105 z-10' : ''}
                                        `}
                                    >
                                        <span className={`text-[9px] font-bold ${isToday ? 'text-brand-blue' : 'text-gray-400'} absolute top-0.5 left-0.5`}>{day}</span>
                                        {hasPoop ? (
                                            <span className="text-lg leading-none mt-1.5">💩</span>
                                        ) : (
                                            <span className="text-gray-200 text-[10px] mt-1.5">•</span>
                                        )}
                                        {sessionsToday.length > 1 && (
                                            <div className="absolute -bottom-0.5 -right-0.5 bg-brand-brown text-white text-[7px] font-bold px-0.5 rounded-full border border-white">
                                                x{sessionsToday.length}
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* SELECTED DAY DETAILS */}
                    {selectedDay && (
                        <div className="animate-fade-in overflow-x-hidden">
                            <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
                                {selectedDay.toLocaleDateString(undefined, {weekday: 'long', month: 'long', day: 'numeric'})}
                            </div>
                            
                            {selectedDaySessions.length > 0 ? (
                                <div className="space-y-2">
                                    {selectedDaySessions.slice(0, calendarDisplayLimit).map((session, idx) => (
                                        <div key={idx} className="bg-white border-2 border-black rounded-xl p-2.5 flex flex-col gap-2 shadow-sm overflow-x-hidden">
                                            <div className="flex justify-between items-center border-b border-dashed pb-2 gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="text-xl flex-shrink-0">{session.poop_type ? BRISTOL_SCALE.find(b => b.type === session.poop_type)?.emoji : '💩'}</div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-brand-brown text-sm truncate">{new Date(session.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <div className="text-xs font-bold text-green-600">+{settings.currencySymbol}{session.earnings.toFixed(2)}</div>
                                                    <div className="text-[9px] font-bold bg-gray-100 px-1 rounded border">{formatTime(session.durationSeconds)}</div>
                                                </div>
                                            </div>
                                            {/* Details Row */}
                                            <div className="flex flex-wrap gap-1.5 text-[9px] font-bold">
                                                {session.poop_volume && <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200">{session.poop_volume}</span>}
                                                {session.poop_color && <span className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded border border-gray-300 flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${POOP_COLORS.find(c => c.id === session.poop_color)?.bg}`}></span>{POOP_COLORS.find(c => c.id === session.poop_color)?.label}</span>}
                                            </div>
                                        </div>
                                    ))}
                                    {selectedDaySessions.length > calendarDisplayLimit && (
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => setCalendarDisplayLimit(prev => Math.min(prev + 5, selectedDaySessions.length))}
                                                className="flex-1 bg-brand-yellow border-2 border-black rounded-xl p-2 font-black text-brand-brown text-sm hover:bg-yellow-400 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"
                                            >
                                                View More ({Math.min(5, selectedDaySessions.length - calendarDisplayLimit)} more)
                                            </button>
                                            {calendarDisplayLimit > 5 && (
                                                <button 
                                                    onClick={() => setCalendarDisplayLimit(5)}
                                                    className="bg-gray-200 border-2 border-black rounded-xl p-2 font-black text-gray-700 text-sm hover:bg-gray-300 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"
                                                >
                                                    Hide
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-gray-100 border-2 border-gray-300 rounded-xl p-4 text-center border-dashed">
                                    <div className="text-3xl grayscale opacity-50 mb-2">🚽</div>
                                    <div className="font-bold text-gray-500 text-sm">No poop detected.</div>
                                    <div className="text-[10px] text-gray-400 mt-1">
                                        {["Maybe you were actually working? 🤔", "Digestive system on strike.", "The factory was closed today.", "Saving it for later?"][Math.floor(Math.random() * 4)]}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
    );
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-brand-cream relative">
        <PoopHitAnimation visible={poopHitVisible} />
        <ToastNotification message={toast.message} icon={toast.icon} visible={toast.visible} />
        {view === AppView.AUTH && renderAuth()}
        {view === AppView.ONBOARDING && renderOnboarding()}
        {view === AppView.HOME && renderHome()}
        {view === AppView.ACTIVE_SESSION && renderActiveSession()}
        {view === AppView.POOP_CHECK && renderPoopCheck()}
        {view === AppView.SUMMARY && renderSummary()}
        {view === AppView.HISTORY && renderHistory()}
        {view === AppView.LEADERBOARD && renderLeaderboard()}
        {view === AppView.ACHIEVEMENTS && renderAchievements()}
        {view === AppView.SETTINGS && renderSettings()}

        {/* Global Game Menu Overlay */}
        {showGameMenu && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
              <div className="bg-brand-cream border-4 border-black rounded-2xl p-6 w-full max-w-sm relative space-y-4 max-h-[85vh] overflow-y-auto">
                  <button onClick={() => setShowGameMenu(false)} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full border-2 border-black font-bold z-10"><X size={20} /></button>
                  <div className="text-center mt-2">
                      <h2 className="text-3xl font-black text-brand-brown">Toilet Arcade</h2>
                      <p className="text-xs font-bold text-gray-500">Play while you poop (or anytime)</p>
                  </div>
                  
                  <button onClick={() => launchGame('FLAPPY')} className="w-full bg-brand-blue border-2 border-black p-4 rounded-xl flex items-center gap-4 hover:scale-105 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"><span className="text-4xl">💩</span><div className="text-left"><div className="font-black text-xl">Flappy Turd</div></div></button>
                  <button onClick={() => launchGame('CATVSDOG')} className="w-full bg-orange-300 border-2 border-black p-4 rounded-xl flex items-center gap-4 hover:scale-105 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"><span className="text-4xl">🦴</span><div className="text-left"><div className="font-black text-xl">Cat vs Dog</div></div></button>
                  <button onClick={() => launchGame('SNAKE')} className="w-full bg-[#90EE90] border-2 border-black p-4 rounded-xl flex items-center gap-4 hover:scale-105 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"><span className="text-4xl">🐍</span><div className="text-left"><div className="font-black text-xl">Turd Snake</div></div></button>
                  <button onClick={() => launchGame('WHACK')} className="w-full bg-brand-yellow border-2 border-black p-4 rounded-xl flex items-center gap-4 hover:scale-105 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"><span className="text-4xl">🔨</span><div className="text-left"><div className="font-black text-xl">Whack-a-Turd</div></div></button>
                  <button onClick={() => launchGame('NINJA')} className="w-full bg-white border-2 border-black p-4 rounded-xl flex items-center gap-4 hover:scale-105 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"><span className="text-4xl">⚔️</span><div className="text-left"><div className="font-black text-xl">TP Ninja</div></div></button>
                  <button onClick={() => launchGame('DOODLE')} className="w-full bg-green-200 border-2 border-black p-4 rounded-xl flex items-center gap-4 hover:scale-105 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"><span className="text-4xl">🚀</span><div className="text-left"><div className="font-black text-xl">Doodle Poop</div></div></button>
                  <button onClick={() => launchGame('BREAKER')} className="w-full bg-brand-pink border-2 border-black p-4 rounded-xl flex items-center gap-4 hover:scale-105 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"><span className="text-4xl">🧱</span><div className="text-left"><div className="font-black text-xl">Poop Breaker</div></div></button>
                  <button onClick={() => launchGame('SPEEDROLL')} className="w-full bg-gray-200 border-2 border-black p-4 rounded-xl flex items-center gap-4 hover:scale-105 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-y-1"><span className="text-4xl">🧻</span><div className="text-left"><div className="font-black text-xl">Speed Roll</div></div></button>
              </div>
          </div>
      )}
      {/* Prevent scroll, text selection, and magnifier when any game is active */}
      {activeGame && (
        <style>{`
          body {
            overflow: hidden !important;
            position: fixed !important;
            width: 100% !important;
            height: 100% !important;
            touch-action: none !important;
            -webkit-overflow-scrolling: none !important;
            overscroll-behavior: none !important;
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-tap-highlight-color: transparent !important;
            -webkit-touch-callout: none !important;
          }
          * {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-tap-highlight-color: transparent !important;
            -webkit-touch-callout: none !important;
          }
          /* Prevent text selection and magnifier on long press */
          *:not(input):not(textarea) {
            -webkit-user-select: none !important;
            -webkit-touch-callout: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }
        `}</style>
      )}
      {activeGame === 'FLAPPY' && <FlappyPoop onClose={() => setActiveGame(null)} userId={user?.id} />}
      {activeGame === 'SNAKE' && <SnakeGame onClose={() => setActiveGame(null)} userId={user?.id} />}
      {activeGame === 'WHACK' && <WhackATurd onClose={() => setActiveGame(null)} userId={user?.id} />}
      {activeGame === 'NINJA' && <ToiletPaperNinja onClose={() => setActiveGame(null)} userId={user?.id} />}
      {activeGame === 'BREAKER' && <PoopBreaker onClose={() => setActiveGame(null)} userId={user?.id} />}
      {activeGame === 'CATVSDOG' && <CatVsDog onClose={() => setActiveGame(null)} userId={user?.id} />}
      {activeGame === 'SPEEDROLL' && <SpeedRoll onClose={() => setActiveGame(null)} userId={user?.id} />}
      {activeGame === 'DOODLE' && <DoodlePoop onClose={() => setActiveGame(null)} userId={user?.id} />}
    </div>
  );
};

export default App;