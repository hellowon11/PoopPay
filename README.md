# 💩 PoopPay

**Earn while you burn.** Track your bathroom breaks at work and see how much you're getting paid to poop!

## Features

- ⏱️ **Session Timer** - Track your bathroom break duration
- 💰 **Earnings Calculator** - See how much you earn per session based on your salary
- 📊 **Poop Analysis** - Log composition, volume, and color with fun health feedback
- 🔥 **Streaks** - Track your daily pooping streaks
- 🏆 **Achievements** - Unlock badges for your bathroom accomplishments
- 🎮 **Mini Games** - 8 fun games to play while you wait:
  - Flappy Turd
  - Turd Snake
  - Whack-A-Turd
  - TP Ninja
  - Poop Breaker
  - Cat vs Dog
  - Speed Roll
  - Doodle Poop
- 📅 **History & Calendar** - View your poop history and patterns
- 🌍 **Global Leaderboard** - Compete with other poopers worldwide

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth)
- **Build Tool**: Vite

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/PoopPay.git
cd PoopPay

# Install dependencies
npm install

# Create .env file with your Supabase credentials
echo "VITE_SUPABASE_URL=your_supabase_url" > .env
echo "VITE_SUPABASE_ANON_KEY=your_supabase_anon_key" >> .env

# Start development server
npm run dev
```

### Database Setup

Run the SQL in `SUPABASE_QUICK_START.sql` in your Supabase SQL Editor to create the required tables.

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy!

## License

MIT License - Feel free to use this for your own bathroom productivity tracking!

---

**Made with 💩 and ❤️**
