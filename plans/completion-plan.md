# AI Idea Intelligence Platform - Revised Completion Plan

## Updated Project Vision

**Project Name:** AI Idea Intelligence Platform  
**Purpose:** Autonomous system that discovers viral AI ideas from Reddit, experiments with them by generating and running code, then reports results.

**Core Pipeline:**
1. **Discover** → Auto-discover popular AI subreddits and fetch trending posts
2. **Score** → Evaluate ideas based on upvotes, comments, novelty
3. **Generate** → Use LLM to write actual code/agents implementing the idea
4. **Test** → Run the generated code (child process, Docker, or appropriate runner)
5. **Report** → Show results in dashboard with code, output, and experiment details

**Note:** No GitHub integration - code stays local and is executed to test results.

---

## Revised Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js App Router                           │
├─────────────────────────────────────────────────────────────────┤
│  Pages:                                                          │
│  - / (Dashboard)        Overview, recent experiments, stats   │
│  - /ideas               Discovered ideas with scores            │
│  - /ideas/[id]         Idea detail with generated code         │
│  - /experiments        List of all experiments                 │
│  - /experiments/[id]   Experiment detail + execution results │
│  - /settings           Subreddits config, API keys            │
├─────────────────────────────────────────────────────────────────┤
│  AI Agents (BullMQ Workers):                                    │
│  - Discovery Agent    → Find trending AI ideas on Reddit        │
│  - Scoring Agent      → Score ideas by virality/novelty        │
│  - Generator Agent    → Generate code using LLM                │
│  - Executor Agent     → Run generated code, capture results   │
├─────────────────────────────────────────────────────────────────┤
│  Integrations:                                                  │
│  - Reddit API        → Fetch posts from AI subreddits          │
│  - OpenRouter        → LLM for code generation                 │
│  - Code Runner       → Execute generated code (child process)  │
│  - Docker (future)   → Sandboxed execution                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detailed Implementation Plan

### Phase 1: Foundation & Setup

#### 1.1 Environment Configuration
Add required environment variables:
```env
# Reddit
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=AIIdeaPlatform/1.0

# Keep existing
OPENROUTER_API_KEY=
OPENROUTER_FREE_MODEL_ALLOWLIST=
DATABASE_URL=
REDIS_URL=
```

#### 1.2 Database Schema Updates
New models needed:
- `Idea` - Discovered ideas from Reddit
- `Experiment` - Code generation experiments  
- `GeneratedFile` - Files created in each experiment
- `ExecutionResult` - Results from running the code
- `Subreddit` - Monitored subreddits

### Phase 2: Reddit Integration (Discovery Agent)

#### 2.1 Reddit Client
- `src/lib/reddit/client.ts` - Reddit API client
- Authenticate via OAuth (client credentials flow)
- Fetch posts from popular AI subreddits

#### 2.2 Subreddit Discovery
- Auto-discover popular AI subreddits using Reddit search
- Maintain list of AI-related subreddits to monitor
- Configurable refresh interval

#### 2.3 Idea Ingestion Worker
- Fetch latest posts from target subreddits
- Filter for posts with high engagement (upvotes > threshold)
- Store ideas in database with source metadata

### Phase 3: Idea Scoring (Scoring Agent)

#### 3.1 Scoring Algorithm
Score ideas based on:
- **Virality Score**: upvotes, comment count, award count
- **Novelty Score**: LLM assessment of how unique the idea is
- **Feasibility Score**: LLM assessment of code implementation complexity
- **Composite Score**: weighted combination

#### 3.2 Scoring Worker
- Process queued ideas through scoring pipeline
- Use LLM to analyze idea description
- Update idea with scores

### Phase 4: Code Generation (Generator Agent)

#### 4.1 Code Generation Engine
- `src/lib/codegen/generator.ts` - LLM prompt engineering
- Generate complete, runnable code files
- Support for: Node.js agents, Python scripts, web apps

#### 4.2 Project Templates
- Agent template (Node.js/TypeScript)
- API service template
- Web app template (Next.js)
- Automation script template (Python)

#### 4.3 Generation Worker
- Take top-scored ideas
- Generate project structure
- Create multiple files (package.json, src files, etc.)
- Store generated files in database

### Phase 5: Code Execution (Executor Agent)

#### 5.1 Execution Engine
- `src/lib/executor/runner.ts` - Code execution engine
- Detect project type from generated files
- Execute using appropriate method:
  - **Node.js**: Spawn child process, run `node`
  - **Python**: Spawn child process, run `python`
  - **Next.js**: Build and start dev server
- Capture stdout/stderr
- Set timeout for execution

#### 5.2 Execution Worker
- Take completed experiments
- Run generated code
- Capture output/results
- Store execution results

### Phase 6: Dashboard & UI

#### 6.1 Dashboard (/)
- Summary statistics (ideas discovered, experiments run, successful tests)
- Recent experiments with results
- Queue health status

#### 6.2 Ideas Page (/ideas)
- List all discovered ideas
- Filter by: score range, subreddit, status
- Sort by: score, date, engagement

#### 6.3 Experiments Page (/experiments)
- List all code generation experiments
- Status: pending, generating, running, completed, failed
- Execution results

#### 6.4 Settings Page (/settings)
- Configure API keys
- Subreddit list management
- Model selection

---

## Database Schema

```prisma
// New models to add to existing schema

model Subreddit {
  id              String   @id @default(cuid())
  name            String   @unique // e.g., "ArtificialIntelligence"
  displayName    String?
  subscribers    Int      @default(0)
  isActive       Boolean  @default(true)
  lastFetchedAt  DateTime?
  
  @@index([isActive])
}

model Idea {
  id              String   @id @default(cuid())
  redditId        String   @unique
  subreddit       String
  title           String
  url             String
  description     String?  @db.Text
  author          String?
  upvotes         Int      @default(0)
  commentCount   Int      @default(0)
  
  // Scores
  viralityScore   Int      @default(0)
  noveltyScore    Int      @default(0)
  feasibilityScore Int     @default(0)
  compositeScore  Int      @default(0)
  
  status          String   @default("discovered") // discovered, scored, generating, completed, failed
  sourceData      String?  @db.Text // Raw JSON from Reddit
  
  experiments     Experiment[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  @@index([compositeScore])
  @@index([status])
  @@index([subreddit])
}

model Experiment {
  id              String   @id @default(cuid())
  ideaId          String
  
  status          String   @default("pending") // pending, generating, running, completed, failed
  
  // Generation
  promptUsed      String?  @db.Text
  
  // Execution
  executionTimeMs Int?
  executionOutput String?  @db.Text
  exitCode        Int?
  errorMessage    String?
  
  files           GeneratedFile[]
  executionResults ExecutionResult[]
  idea            Idea         @relation(fields: [ideaId], references: [id])
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  @@index([status])
  @@index([ideaId])
}

model GeneratedFile {
  id              String   @id @default(cuid())
  experimentId    String
  path            String   // e.g., "src/index.ts"
  content         String   @db.Text
  language        String?  // e.g., "typescript", "python"
  
  experiment      Experiment @relation(fields: [experimentId], references: [id])
  
  @@unique([experimentId, path])
}

model ExecutionResult {
  id              String   @id @default(cuid())
  experimentId    String
  
  step            String   // e.g., "install", "build", "run"
  output          String?  @db.Text
  exitCode        Int?
  startedAt       DateTime
  completedAt     DateTime?
  durationMs      Int?
  
  experiment      Experiment @relation(fields: [experimentId], references: [id])
  
  @@index([experimentId])
}
```

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/ideas | List discovered ideas |
| GET | /api/ideas/:id | Idea detail |
| POST | /api/ideas/:id/score | Trigger scoring |
| POST | /api/ideas/:id/generate | Trigger code generation |
| POST | /api/ideas/:id/execute | Trigger execution |
| GET | /api/experiments | List experiments |
| GET | /api/experiments/:id | Experiment detail |
| GET | /api/subreddits | List monitored subreddits |
| POST | /api/subreddits | Add subreddit |
| DELETE | /api/subreddits/:name | Remove subreddit |

---

## Worker Jobs

| Queue | Description |
|-------|-------------|
| idea.discovery | Fetch posts from Reddit |
| idea.scoring | Score ideas using LLM |
| idea.code_generation | Generate code for top ideas |
| idea.execution | Run generated code, capture results |

---

## Implementation Steps

### Step 1: Update Environment & Schema
- Add environment variables
- Update Prisma schema
- Run migration

### Step 2: Reddit Integration
- Create Reddit client
- Implement subreddit discovery
- Build discovery worker

### Step 3: Scoring System
- Implement scoring algorithm
- Build scoring worker

### Step 4: Code Generation
- Create code generator
- Define project templates
- Build generation worker

### Step 5: Code Execution
- Create execution engine (child process support)
- Support Node.js and Python execution
- Build execution worker

### Step 6: UI
- Build all pages
- Wire up API routes

---

## Files to Create

### New Library Files
- `src/lib/reddit/client.ts` - Reddit API client
- `src/lib/reddit/subreddits.ts` - Subreddit management
- `src/lib/codegen/generator.ts` - Code generation engine
- `src/lib/codegen/templates/agent.ts` - Agent template
- `src/lib/codegen/templates/api.ts` - API template
- `src/lib/codegen/templates/script.ts` - Script template
- `src/lib/executor/runner.ts` - Code execution engine
- `src/lib/executor/detector.ts` - Detect project type

### New Workers
- `src/workers/discovery.worker.ts` - Discovery worker
- `src/workers/scoring.worker.ts` - Scoring worker
- `src/workers/generator.worker.ts` - Code generation worker
- `src/workers/executor.worker.ts` - Code execution worker

### New Pages
- `src/app/ideas/page.tsx` - Ideas list
- `src/app/ideas/[id]/page.tsx` - Idea detail
- `src/app/experiments/page.tsx` - Experiments list
- `src/app/experiments/[id]/page.tsx` - Experiment detail
- `src/app/settings/page.tsx` - Settings

### New API Routes
- `src/app/api/ideas/route.ts`
- `src/app/api/ideas/[id]/route.ts`
- `src/app/api/ideas/[id]/score/route.ts`
- `src/app/api/ideas/[id]/generate/route.ts`
- `src/app/api/ideas/[id]/execute/route.ts`
- `src/app/api/experiments/route.ts`
- `src/app/api/experiments/[id]/route.ts`
- `src/app/api/subreddits/route.ts`

---

## Success Criteria

- [ ] Can authenticate with Reddit and fetch posts
- [ ] Can discover popular AI subreddits automatically
- [ ] Can score ideas using LLM
- [ ] Can generate runnable code for ideas
- [ ] Can execute generated code and capture output
- [ ] Dashboard shows all experiments with execution results
- [ ] Full pipeline runs end-to-end

---

## Notes

- Uses Reddit OAuth (client credentials)
- Uses OpenRouter free models for code generation
- Code execution via child processes (expandable to Docker)
- Artifacts stored in database
- All workers use BullMQ with retry logic
