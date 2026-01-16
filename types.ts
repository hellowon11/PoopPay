
export enum AppView {
  AUTH = 'AUTH',
  ONBOARDING = 'ONBOARDING',
  HOME = 'HOME',
  ACTIVE_SESSION = 'ACTIVE_SESSION',
  GAME_HUB = 'GAME_HUB',
  POOP_CHECK = 'POOP_CHECK',
  SUMMARY = 'SUMMARY',
  HISTORY = 'HISTORY',
  LEADERBOARD = 'LEADERBOARD',
  SETTINGS = 'SETTINGS',
  ACHIEVEMENTS = 'ACHIEVEMENTS'
}

export interface User {
  id: string;
  username: string;
}

export interface UserSettings {
  monthlySalary: number;
  currencySymbol: string;
  workingDaysPerMonth: number;
  hoursPerDay: number;
}

export interface PoopSession {
  id?: string;
  user_id?: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  earnings: number;
  note?: string; 
  poop_type?: number; // 1-7 (Bristol)
  poop_color?: string; // id
  poop_volume?: 'Small' | 'Normal' | 'Huge' | 'Gigantic'; // NEW
  conditions?: string[]; // NEW
  ai_health_advice?: string;
}

export enum EntertainmentType {
  JOKE = 'JOKE',
  TRIVIA = 'TRIVIA',
  THOUGHT = 'THOUGHT',
  FORTUNE = 'FORTUNE'
}

export interface LeaderboardEntry {
  username: string;
  total_duration: number;
  total_earnings: number;
  session_count: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  condition: (history: PoopSession[]) => boolean;
}

// Advice Variation Interface
interface HealthAdvice {
    title: string;
    desc: string;
    foodEmoji: string;
    foodName: string;
}

export const POOP_COLORS = [
    { id: 'brown', label: 'Brown', hex: '#5D4037', bg: 'bg-[#5D4037]', desc: 'Normal' },
    { id: 'green', label: 'Green', hex: '#2E7D32', bg: 'bg-[#2E7D32]', desc: 'Veggie' },
    { id: 'red', label: 'Red', hex: '#C62828', bg: 'bg-[#C62828]', desc: 'Blood' },
    { id: 'black', label: 'Black', hex: '#212121', bg: 'bg-[#212121]', desc: 'Tar' },
];

export const POOP_CONDITIONS = [
    { id: 'coffee', label: 'Coffee', icon: '☕' },
    { id: 'spicy', label: 'Spicy', icon: '🌶️' },
    { id: 'bloody', label: 'Bloody', icon: '🩸' },
    { id: 'alcohol', label: 'Booze', icon: '🍺' },
    { id: 'lactose', label: 'Dairy', icon: '🧀' },
    { id: 'period', label: 'Period', icon: '🌸' },
];

export const BRISTOL_SCALE = [
  { 
    type: 1, 
    label: "Hard", 
    emoji: "⚫", 
    variations: [
        { title: "Rabbit Life 🐇", desc: "You need water ASAP.", foodEmoji: "💧", foodName: "Water" }
    ]
  },
  { 
    type: 3, 
    label: "Firm", 
    emoji: "🥖", 
    variations: [
        { title: "Standard", desc: "Good job.", foodEmoji: "👍", foodName: "Keep it up" }
    ]
  },
  { 
    type: 4, 
    label: "Smooth", 
    emoji: "🐍", 
    variations: [
        { title: "Perfection 🏆", desc: "The gold standard.", foodEmoji: "🌟", foodName: "Fiber King" }
    ]
  },
  { 
    type: 5, 
    label: "Soft", 
    emoji: "🐥", 
    variations: [
        { title: "Lacking Fiber", desc: "Eat some oats.", foodEmoji: "🌾", foodName: "Oats" }
    ]
  },
  { 
    type: 6, 
    label: "Mushy", 
    emoji: "🍦", 
    variations: [
        { title: "Soft Serve", desc: "Mild inflammation.", foodEmoji: "🍌", foodName: "Bananas" }
    ]
  },
  { 
    type: 7, 
    label: "Watery", 
    emoji: "🌊", 
    variations: [
        { title: "Volcano 🌋", desc: "Stay hydrated.", foodEmoji: "🥥", foodName: "Electrolytes" }
    ]
  },
];
