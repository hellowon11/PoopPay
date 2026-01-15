import { createClient } from '@supabase/supabase-js';
import { User, PoopSession, LeaderboardEntry, UserSettings } from '../types';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database table names
const TABLES = {
  USERS: 'users',
  SESSIONS: 'sessions',
  SETTINGS: 'user_settings',
  GAME_SCORES: 'game_scores'
};

export const userService = {
  async register(username: string): Promise<User | null> {
    try {
      // Generate a simple ID
      const id = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      const { data, error } = await supabase
        .from(TABLES.USERS)
        .insert([{ id, username }])
        .select()
        .single();

      if (error) {
        console.error('Error registering user:', error);
        return null;
      }

      return { id: data.id, username: data.username };
    } catch (error) {
      console.error('Error registering user:', error);
      return null;
    }
  },

  async login(id: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from(TABLES.USERS)
        .select('id, username')
        .eq('id', id)
        .single();

      if (error || !data) {
        return null;
      }

      return { id: data.id, username: data.username };
    } catch (error) {
      console.error('Error logging in user:', error);
      return null;
    }
  },

  async updateUsername(id: string, newUsername: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from(TABLES.USERS)
        .update({ username: newUsername })
        .eq('id', id);

      return !error;
    } catch (error) {
      console.error('Error updating username:', error);
      return false;
    }
  }
};

export const sessionService = {
  async saveSession(session: PoopSession, userId: string): Promise<void> {
    try {
      // Convert camelCase to snake_case for database
      const sessionData = {
        user_id: userId,
        startTime: session.startTime,
        endTime: session.endTime,
        durationSeconds: session.durationSeconds,
        earnings: session.earnings,
        note: session.note || null,
        poop_type: session.poop_type || null,
        poop_color: session.poop_color || null,
        poop_volume: session.poop_volume || null,
        conditions: session.conditions || null,
        ai_health_advice: session.ai_health_advice || null
      };

      const { error } = await supabase
        .from(TABLES.SESSIONS)
        .insert([sessionData]);

      if (error) {
        console.error('Error saving session:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error saving session:', error);
      throw error;
    }
  },

  async getHistory(userId: string): Promise<PoopSession[]> {
    try {
      const { data, error } = await supabase
        .from(TABLES.SESSIONS)
        .select('*')
        .eq('user_id', userId)
        .order('startTime', { ascending: false });

      if (error) {
        console.error('Error fetching history:', error);
        return [];
      }

      // Convert snake_case back to camelCase for TypeScript
      return (data || []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        startTime: row.startTime,
        endTime: row.endTime,
        durationSeconds: row.durationSeconds,
        earnings: parseFloat(row.earnings) || 0,
        note: row.note,
        poop_type: row.poop_type,
        poop_color: row.poop_color,
        poop_volume: row.poop_volume,
        conditions: row.conditions,
        ai_health_advice: row.ai_health_advice
      }));
    } catch (error) {
      console.error('Error fetching history:', error);
      return [];
    }
  },

  async getLeaderboard(period: 'weekly' | 'monthly' | 'all'): Promise<LeaderboardEntry[]> {
    try {
      const now = new Date();
      const cutoff = new Date();
      
      if (period === 'weekly') cutoff.setDate(now.getDate() - 7);
      else if (period === 'monthly') cutoff.setDate(now.getDate() - 30);
      else cutoff.setFullYear(2000); // All time

      const cutoffTimestamp = cutoff.getTime();

      // Get sessions within period
      const { data: sessions, error: sessionsError } = await supabase
        .from(TABLES.SESSIONS)
        .select('user_id, durationSeconds, earnings')
        .gte('startTime', cutoffTimestamp);

      if (sessionsError) {
        console.error('Error fetching leaderboard sessions:', sessionsError);
        return [];
      }

      // Get all users
      const { data: users, error: usersError } = await supabase
        .from(TABLES.USERS)
        .select('id, username');

      if (usersError) {
        console.error('Error fetching users:', usersError);
        return [];
      }

      const userMap = new Map(users?.map(u => [u.id, u.username]) || []);

      // Aggregate by user
      const agg: Record<string, LeaderboardEntry> = {};

      sessions?.forEach(s => {
        const uid = s.user_id || 'unknown';
        const username = userMap.get(uid) || 'Unknown Pooper';
        
        if (!agg[uid]) {
          agg[uid] = { username, total_duration: 0, total_earnings: 0, session_count: 0 };
        }
        agg[uid].total_duration += s.durationSeconds || 0;
        agg[uid].total_earnings += s.earnings || 0;
        agg[uid].session_count += 1;
      });

      return Object.values(agg)
        .sort((a, b) => b.total_earnings - a.total_earnings)
        .slice(0, 10);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
  }
};

export const settingsService = {
  async getSettings(userId: string): Promise<UserSettings | null> {
    try {
      const { data, error } = await supabase
        .from(TABLES.SETTINGS)
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        monthlySalary: data.monthly_salary || 0,
        currencySymbol: data.currency_symbol || 'RM',
        workingDaysPerMonth: data.working_days_per_month || 21.75,
        hoursPerDay: data.hours_per_day || 8
      };
    } catch (error) {
      console.error('Error fetching settings:', error);
      return null;
    }
  },

  async saveSettings(userId: string, settings: UserSettings): Promise<boolean> {
    try {
      const { error } = await supabase
        .from(TABLES.SETTINGS)
        .upsert({
          user_id: userId,
          monthly_salary: settings.monthlySalary,
          currency_symbol: settings.currencySymbol,
          working_days_per_month: settings.workingDaysPerMonth,
          hours_per_day: settings.hoursPerDay,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      return !error;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  }
};

export const gameService = {
  async saveScore(userId: string, gameName: string, score: number): Promise<void> {
    try {
      // Check if user already has a score for this game
      const { data: existing } = await supabase
        .from(TABLES.GAME_SCORES)
        .select('id, score')
        .eq('user_id', userId)
        .eq('game_name', gameName)
        .single();

      if (existing && existing.score >= score) {
        // Don't update if new score is not higher
        return;
      }

      if (existing) {
        // Update existing score
        const { error } = await supabase
          .from(TABLES.GAME_SCORES)
          .update({ score, updated_at: new Date().toISOString() })
          .eq('id', existing.id);

        if (error) {
          console.error('Error updating game score:', error);
        }
      } else {
        // Insert new score
        const { error } = await supabase
          .from(TABLES.GAME_SCORES)
          .insert([{ user_id: userId, game_name: gameName, score }]);

        if (error) {
          console.error('Error saving game score:', error);
        }
      }
    } catch (error) {
      console.error('Error saving game score:', error);
    }
  },

  async getHighScore(userId: string, gameName: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .from(TABLES.GAME_SCORES)
        .select('score')
        .eq('user_id', userId)
        .eq('game_name', gameName)
        .single();

      if (error || !data) {
        return 0;
      }

      return data.score || 0;
    } catch (error) {
      console.error('Error fetching high score:', error);
      return 0;
    }
  }
};
