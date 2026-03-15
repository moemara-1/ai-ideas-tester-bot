# AI Idea Intelligence Platform

An autonomous system that discovers viral AI ideas from Reddit, experiments with them by generating actual code, runs the code, and reports results.

## Core Pipeline

1. **Discover** → Fetch trending posts from AI subreddits on Reddit
2. **Score** → Rate ideas on virality, novelty, and feasibility using LLM
3. **Generate** → Write actual code implementing the idea
4. **Execute** → Run the generated code and capture results
5. **Report** → Dashboard shows code + execution results

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: SQLite via Prisma
- **Queue**: BullMQ + Redis
- **LLM**: OpenRouter (free models)
- **Code Execution**: Node.js/Python child processes

## Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Configure Environment

Edit `.env` with your API keys:

```env
# Required - Get from https://openrouter.ai/
OPENROUTER_API_KEY=your_key_here

# Required - Reddit API credentials
# Get from https://www.reddit.com/prefs/apps
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=AIdeaIntelligence/1.0

# Database and Redis
DATABASE_URL=file:./dev.db
REDIS_URL=redis://localhost:6379

# Optional - Free model allowlist
OPENROUTER_FREE_MODEL_ALLOWLIST=google/gemini-2.0-flash-exp:free,meta-llama/llama-3-8b-instruct:free,deepseek/deepseek-chat:free
```

### Start Services

```bash
# Generate Prisma client (required after schema changes)
npx prisma generate

# Push database schema
npx prisma db push

# Start Redis (required for queue)
docker run -d --name redis -p 6379:6379 redis

# Start development server
npm run dev

# Start workers (in separate terminal)
npm run worker
```

## Usage

### 1. Discover Ideas

```bash
# Trigger discovery from Reddit
curl -X POST http://localhost:3000/api/ideas/discover \
  -H "Content-Type: application/json" \
  -d '{"postsPerSubreddit": 25, "minUpvotes": 5}'
```

Or visit: http://localhost:3000/ideas/discover

### 2. Score Ideas

```bash
# Score discovered ideas using LLM
curl -X POST http://localhost:3000/api/ideas/score \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

### 3. Generate Code

```bash
# Generate code for a specific idea
curl -X POST http://localhost:3000/api/ideas/generate \
  -H "Content-Type: application/json" \
  -d '{"ideaId": "your_idea_id"}'
```

### 4. View Results

```bash
# List ideas with stats
curl http://localhost:3000/api/ideas?stats=true

# List all ideas
curl http://localhost:3000/api/ideas
```

## Pages

- `/` - Dashboard with queue health and recent activity
- `/ideas` - View discovered ideas
- `/ideas/discover` - Trigger discovery and scoring from UI
- `/leads` - Lead management (legacy)
- `/campaigns` - Campaign management (legacy)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/ideas | List all ideas |
| GET | /api/ideas?stats=true | Get statistics |
| POST | /api/ideas/discover | Trigger discovery |
| POST | /api/ideas/score | Trigger scoring |
| POST | /api/ideas/generate | Generate code for idea |
| GET | /api/dashboard | Dashboard snapshot |

## Queue Jobs

| Queue | Description |
|-------|-------------|
| idea.discovery | Fetch posts from Reddit |
| idea.scoring | Score ideas using LLM |
| idea.code_generation | Generate code for top ideas |
| idea.execution | Run generated code |

## Commands

```bash
npm run dev          # Start Next.js
npm run worker       # Start BullMQ workers
npm run typecheck    # Check TypeScript
npm run test         # Run tests
npm run prisma:generate  # Generate Prisma client
npm run prisma:db:push   # Push schema to DB
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Next.js App Router                     │
├─────────────────────────────────────────────────────┤
│  Pages:  /  /ideas  /ideas/discover  /leads       │
├─────────────────────────────────────────────────────┤
│  API Routes: /api/ideas/*  /api/dashboard          │
├─────────────────────────────────────────────────────┤
│  Workers (BullMQ):                                  │
│  - discovery.worker.ts  - Reddit integration       │
│  - scoring.worker.ts    - LLM-based scoring        │
│  - generator.worker.ts  - Code generation          │
│  - executor.worker.ts   - Code execution           │
├─────────────────────────────────────────────────────┤
│  Services:                                           │
│  - reddit/client.ts    - Reddit API                 │
│  - codegen/generator.ts - LLM code generation      │
│  - executor/runner.ts  - Code execution            │
└─────────────────────────────────────────────────────┘
```

## License

MIT
