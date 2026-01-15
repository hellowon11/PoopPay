-- PoopPay Supabase 数据库快速设置脚本
-- 在 Supabase SQL Editor 中运行此脚本

-- 1. 创建 users 表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);

-- 2. 创建 sessions 表
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "startTime" BIGINT NOT NULL,
  "endTime" BIGINT NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  earnings NUMERIC(10,2) NOT NULL,
  note TEXT,
  poop_type INTEGER,
  poop_color TEXT,
  poop_volume TEXT CHECK (poop_volume IN ('Small', 'Normal', 'Huge', 'Gigantic')),
  conditions TEXT[],
  ai_health_advice TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_startTime ON sessions("startTime" DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_startTime ON sessions(user_id, "startTime" DESC);

-- 3. 创建 user_settings 表
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  monthly_salary NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency_symbol TEXT NOT NULL DEFAULT 'RM',
  working_days_per_month NUMERIC(5,2) NOT NULL DEFAULT 21.75,
  hours_per_day NUMERIC(5,2) NOT NULL DEFAULT 8,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- 4. 创建 game_scores 表
CREATE TABLE IF NOT EXISTS game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, game_name)
);

CREATE INDEX IF NOT EXISTS idx_game_scores_user_id ON game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_game_name ON game_scores(game_name);
CREATE INDEX IF NOT EXISTS idx_game_scores_user_game ON game_scores(user_id, game_name);

-- 5. 禁用 RLS（Row Level Security）以便应用可以访问数据
-- 注意：如果你需要更严格的安全控制，可以启用 RLS 并创建策略
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_scores DISABLE ROW LEVEL SECURITY;

-- 完成！所有表已创建
