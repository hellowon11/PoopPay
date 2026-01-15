# PoopPay Database Schema

This document describes the Supabase database schema required for PoopPay.

## Environment Variables

Add these to your `.env` file:

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Tables

### 1. `users`

Stores user account information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | text | PRIMARY KEY | User ID (e.g., "ABC12345") |
| `username` | text | NOT NULL | Display username |
| `created_at` | timestamp | DEFAULT now() | Account creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**SQL to create:**
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_id ON users(id);
```

### 2. `sessions`

Stores poop session records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Session ID |
| `user_id` | text | NOT NULL, FOREIGN KEY → users(id) | User who created the session |
| `startTime` | bigint | NOT NULL | Session start timestamp (Unix milliseconds) |
| `endTime` | bigint | NOT NULL | Session end timestamp (Unix milliseconds) |
| `durationSeconds` | integer | NOT NULL | Session duration in seconds |
| `earnings` | numeric(10,2) | NOT NULL | Earnings for this session |
| `note` | text | | Optional note |
| `poop_type` | integer | | Bristol scale type (1-7) |
| `poop_color` | text | | Poop color ID |
| `poop_volume` | text | | Volume: 'Small', 'Normal', 'Huge', 'Gigantic' |
| `conditions` | text[] | | Array of condition IDs |
| `ai_health_advice` | text | | AI-generated health advice |
| `created_at` | timestamp | DEFAULT now() | Record creation time |

**SQL to create:**
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  startTime BIGINT NOT NULL,
  endTime BIGINT NOT NULL,
  durationSeconds INTEGER NOT NULL,
  earnings NUMERIC(10,2) NOT NULL,
  note TEXT,
  poop_type INTEGER,
  poop_color TEXT,
  poop_volume TEXT CHECK (poop_volume IN ('Small', 'Normal', 'Huge', 'Gigantic')),
  conditions TEXT[],
  ai_health_advice TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_startTime ON sessions(startTime DESC);
CREATE INDEX idx_sessions_user_startTime ON sessions(user_id, startTime DESC);
```

### 3. `user_settings`

Stores user configuration settings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | text | PRIMARY KEY, FOREIGN KEY → users(id) | User ID |
| `monthly_salary` | numeric(10,2) | NOT NULL DEFAULT 0 | Monthly salary |
| `currency_symbol` | text | NOT NULL DEFAULT 'RM' | Currency symbol |
| `working_days_per_month` | numeric(5,2) | NOT NULL DEFAULT 21.75 | Working days per month |
| `hours_per_day` | numeric(5,2) | NOT NULL DEFAULT 8 | Working hours per day |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**SQL to create:**
```sql
CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  monthly_salary NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency_symbol TEXT NOT NULL DEFAULT 'RM',
  working_days_per_month NUMERIC(5,2) NOT NULL DEFAULT 21.75,
  hours_per_day NUMERIC(5,2) NOT NULL DEFAULT 8,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);
```

### 4. `game_scores`

Stores high scores for mini-games.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Score record ID |
| `user_id` | text | NOT NULL, FOREIGN KEY → users(id) | User ID |
| `game_name` | text | NOT NULL | Game identifier (e.g., 'snake_turd', 'flappy_poop') |
| `score` | integer | NOT NULL | High score |
| `created_at` | timestamp | DEFAULT now() | Record creation time |
| `updated_at` | timestamp | DEFAULT now() | Last update time |

**SQL to create:**
```sql
CREATE TABLE game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, game_name)
);

CREATE INDEX idx_game_scores_user_id ON game_scores(user_id);
CREATE INDEX idx_game_scores_game_name ON game_scores(game_name);
CREATE INDEX idx_game_scores_user_game ON game_scores(user_id, game_name);
```

## Row Level Security (RLS)

Enable RLS on all tables and create policies:

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

-- Users: Anyone can read, authenticated users can insert/update
CREATE POLICY "Users are viewable by everyone" ON users FOR SELECT USING (true);
CREATE POLICY "Users can be inserted by anyone" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own data" ON users FOR UPDATE USING (true);

-- Sessions: Users can only see/insert their own sessions
CREATE POLICY "Users can view their own sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "Users can insert their own sessions" ON sessions FOR INSERT WITH CHECK (true);

-- Settings: Users can only see/update their own settings
CREATE POLICY "Users can view their own settings" ON user_settings FOR SELECT USING (true);
CREATE POLICY "Users can insert their own settings" ON user_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own settings" ON user_settings FOR UPDATE USING (true);

-- Game Scores: Users can only see/update their own scores
CREATE POLICY "Users can view their own scores" ON game_scores FOR SELECT USING (true);
CREATE POLICY "Users can insert their own scores" ON game_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own scores" ON game_scores FOR UPDATE USING (true);
```

**Note:** Since PoopPay uses a simple ID-based authentication (not Supabase Auth), you may want to use service role key for operations or implement a custom authentication system. For now, the policies above allow public access but you should restrict them based on your security requirements.

## Setup Instructions

1. Create a new Supabase project at https://supabase.com
2. Go to SQL Editor and run all the CREATE TABLE statements above
3. Run the RLS policies (or adjust based on your security needs)
4. Copy your project URL and anon key from Settings > API
5. Create a `.env` file in the project root with:
   ```
   VITE_SUPABASE_URL=your_project_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
6. Restart your development server

## Migration Notes

- All existing localStorage data will need to be migrated manually or via a migration script
- User IDs remain the same format (uppercase alphanumeric)
- Only user ID is stored in localStorage (`poopPay_user_id`)
- All other data (settings, sessions, scores) are stored in Supabase
