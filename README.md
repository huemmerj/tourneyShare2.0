# Tourney Share

A tournament management app built with Next.js, Supabase, and Better Auth.

## Features

- Create and manage tournaments (single elimination, double elimination, round robin, swiss, group+knockout)
- Team and solo participant modes
- Self-select or admin-assigned teams
- Random team distribution with equal sizing
- Invite links and QR codes
- Score reporting with dispute flow

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Better Auth (email/password)
- **Styling:** Tailwind CSS + Shadcn + Radix UI

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd tourneyShare2.0
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in the required values:

| Variable                        | Where to find it                         |
| ------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase Dashboard                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase Dashboard                       |
| `DATABASE_URL`                  | Supabase Dashboard                       |
| `BETTER_AUTH_SECRET`            | Generate with: `openssl rand -base64 32` |

### 3. Run migrations

**Better Auth tables:**

```bash
npx @better-auth/cli migrate
```

**App tables (Supabase):**

Open the Supabase SQL Editor and run each file in `supabase/migrations/` in order.

### 4. Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command         | Description              |
| --------------- | ------------------------ |
| `npm run dev`   | Start development server |
| `npm run build` | Production build         |
| `npm run start` | Start production server  |
| `npm run lint`  | Run ESLint               |

## Project Structure

```
├── app/
│   ├── (app)/              # Authenticated routes
│   │   ├── dashboard/      # Dashboard
│   │   ├── tournaments/    # Tournament CRUD + management
│   │   └── profile/        # User profile
│   ├── join/[code]/        # Public invite link
│   ├── t/[code]/           # Spectator view
│   └── api/auth/           # Better Auth endpoint
├── components/             # Shared UI components
├── lib/
│   ├── auth.ts             # Better Auth config
│   ├── supabase/           # Supabase clients (browser + server)
│   ├── bracket.ts          # Bracket generation algorithms
│   └── types.ts            # TypeScript types
├── messages/               # i18n translations (en, de)
└── supabase/migrations/    # SQL schema migrations
```

## Database

This project uses two database layers:

- **Better Auth** – manages `user`, `session`, `account` tables (auto-created on first run)
- **Supabase SQL migrations** – app tables (`tournaments`, `teams`, `participants`, `matches`, etc.)
