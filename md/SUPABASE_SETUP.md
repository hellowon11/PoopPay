# Supabase 设置和数据迁移指南

## 第一步：创建 Supabase 项目

1. 访问 https://supabase.com 并登录（如果没有账号，先注册）
2. 点击 "New Project"
3. 填写项目信息：
   - **Name**: PoopPay（或你喜欢的名字）
   - **Database Password**: 设置一个强密码（**重要：保存好这个密码**）
   - **Region**: 选择离你最近的区域
4. 点击 "Create new project"，等待项目创建完成（大约需要 2-3 分钟）

## 第二步：创建数据库表

1. 在 Supabase 项目中，点击左侧菜单的 **SQL Editor**
2. 点击 **New Query**
3. 复制并粘贴以下完整的 SQL 脚本：

```sql
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

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_startTime ON sessions(startTime DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_startTime ON sessions(user_id, startTime DESC);

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
```

4. 点击 **Run** 按钮执行 SQL
5. 确认所有表都创建成功（应该看到 "Success. No rows returned"）

## 第三步：获取 API 密钥

1. 在 Supabase 项目中，点击左侧菜单的 **Settings**（设置图标）
2. 点击 **API**
3. 找到以下信息：
   - **Project URL**: 复制这个 URL（例如：`https://xxxxx.supabase.co`）
   - **anon public key**: 复制这个 key（以 `eyJ...` 开头的长字符串）

## 第四步：配置环境变量

1. 在项目根目录创建 `.env` 文件（如果还没有的话）
2. 添加以下内容：

```env
VITE_SUPABASE_URL=你的_Project_URL
VITE_SUPABASE_ANON_KEY=你的_anon_public_key
```

**示例：**
```env
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjIzOTAyMiwiZXhwIjoxOTMxODE1MDIyfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

3. **重要**：确保 `.env` 文件在 `.gitignore` 中，不要提交到 Git

## 第五步：迁移现有数据（如果有）

如果你之前使用 localStorage 存储了数据，可以使用迁移脚本：

1. 打开浏览器控制台（F12）
2. 运行迁移脚本（见下面的 `migrate-data.html`）

或者直接使用应用，新数据会自动保存到 Supabase。

## 第六步：重启开发服务器

1. 停止当前的开发服务器（Ctrl+C）
2. 重新启动：
   ```bash
   npm run dev
   ```

## 验证设置

1. 打开应用
2. 注册一个新用户或登录
3. 创建一次会话
4. 在 Supabase 的 **Table Editor** 中检查数据：
   - 应该能在 `users` 表中看到新用户
   - 应该能在 `sessions` 表中看到新会话

## 故障排除

### 问题：无法连接到 Supabase
- 检查 `.env` 文件中的 URL 和 Key 是否正确
- 确保没有多余的空格或引号
- 重启开发服务器

### 问题：表不存在错误
- 回到 SQL Editor，确认所有表都已创建
- 检查表名是否正确（区分大小写）

### 问题：权限错误
- 确保 RLS 已禁用（见上面的 SQL）
- 或者创建适当的 RLS 策略

### 问题：数据没有保存
- 打开浏览器控制台查看错误信息
- 检查网络请求是否成功（Network 标签）

## 下一步

设置完成后，所有新数据都会自动保存到 Supabase。如果你有旧的 localStorage 数据需要迁移，可以使用下面的迁移脚本。
