# 后端验证指南

## 快速验证步骤

### 方法 1: 使用验证工具（推荐）

1. 在浏览器中打开 `verify-backend.html`
2. 输入你的 Supabase URL 和 Anon Key
3. 点击 "🚀 运行完整验证"
4. 查看检查清单，所有项目都应该显示 ✓

### 方法 2: 手动验证

#### 步骤 1: 检查环境变量

确保项目根目录有 `.env` 文件，包含：

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

#### 步骤 2: 验证 Supabase 项目

1. 登录 https://supabase.com
2. 进入你的项目
3. 点击左侧菜单的 **Table Editor**
4. 确认以下表都存在：
   - ✅ `users`
   - ✅ `sessions`
   - ✅ `user_settings`
   - ✅ `game_scores`

#### 步骤 3: 测试数据库连接

在 Supabase 项目的 **SQL Editor** 中运行：

```sql
-- 测试查询
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM sessions;
SELECT COUNT(*) FROM user_settings;
SELECT COUNT(*) FROM game_scores;
```

如果所有查询都成功，说明表已创建。

#### 步骤 4: 测试应用连接

1. 启动开发服务器：
   ```bash
   npm run dev
   ```

2. 打开浏览器控制台（F12）
3. 查看是否有 Supabase 连接错误

4. 尝试注册一个新用户
5. 创建一次会话
6. 检查 Supabase **Table Editor** 中是否有新数据

## 常见问题排查

### 问题 1: "Supabase URL or Anon Key not configured"

**原因**: `.env` 文件不存在或配置错误

**解决**:
1. 确认 `.env` 文件在项目根目录
2. 检查 URL 和 Key 是否正确（没有多余空格）
3. 重启开发服务器

### 问题 2: "relation does not exist"

**原因**: 数据库表未创建

**解决**:
1. 在 Supabase SQL Editor 中运行 `SUPABASE_QUICK_START.sql`
2. 确认所有表都已创建

### 问题 3: "permission denied" 或 "new row violates row-level security policy"

**原因**: RLS (Row Level Security) 已启用但策略不正确

**解决**:
1. 在 Supabase SQL Editor 中运行：
   ```sql
   ALTER TABLE users DISABLE ROW LEVEL SECURITY;
   ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
   ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
   ALTER TABLE game_scores DISABLE ROW LEVEL SECURITY;
   ```

### 问题 4: 数据没有保存

**检查清单**:
- [ ] Supabase URL 和 Key 正确
- [ ] 表已创建
- [ ] RLS 已禁用或策略正确
- [ ] 浏览器控制台没有错误
- [ ] 网络请求成功（在 Network 标签查看）

## 验证成功标志

✅ **所有检查都通过时，你应该看到**:

1. **环境变量**: `.env` 文件存在且配置正确
2. **连接**: Supabase 客户端可以连接
3. **表结构**: 所有 4 个表都存在
4. **用户表**: 可以创建和读取用户
5. **会话表**: 可以保存和读取会话
6. **设置表**: 可以保存和读取设置
7. **游戏分数表**: 可以保存和读取分数

## 测试数据流

### 测试 1: 注册用户
1. 在应用中注册一个新用户
2. 在 Supabase Table Editor 中查看 `users` 表
3. 应该能看到新用户

### 测试 2: 创建会话
1. 开始一次会话并完成
2. 在 Supabase Table Editor 中查看 `sessions` 表
3. 应该能看到新会话记录

### 测试 3: 查看排行榜
1. 在应用中打开 Leaderboard
2. 应该能看到数据（如果有多个用户和会话）

### 测试 4: 保存设置
1. 在设置页面修改并保存
2. 在 Supabase Table Editor 中查看 `user_settings` 表
3. 应该能看到你的设置

## 下一步

验证成功后：
1. ✅ 后端已正确配置
2. ✅ 数据可以正常保存和读取
3. ✅ 可以开始使用应用

如果遇到问题，请查看浏览器控制台的错误信息，或使用 `verify-backend.html` 工具进行详细诊断。
