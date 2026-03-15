# Project Execution Brief: AI Idea Intelligence Platform

## 1. MVP Scope
The MVP will deliver an end-to-end "Testing Ideas" platform that handles idea discovery, signal scoring, experiment generation, and intelligence reporting. The goal is to provide a comprehensive analysis of business ideas based on real-world signals. All core operations must run on OpenRouter free models, avoiding any paid model APIs.

**In-Scope:**
- **Intelligence Pipeline:** Discover idea signals, score them based on virality/novelty, and generate structured experiment artifacts.
- **Signal Ingestion:** Support for seed signals and deterministic generation for testing.
- **Artifact System:** Markdown experiment generation and JSON comprehensive reports.
- **Control Plane:** Next.js dashboard, PostgreSQL (Prisma), Redis + BullMQ for intelligence queues.

**Out-of-Scope (Post-MVP):**
- Paid LLM integrations.
- Multi-source automated scraping (e.g., dedicated Reddit/X API collectors).
- Automated outreach execution.

## 2. Success Metrics
- **Reliability:** 99% uptime of BullMQ workers with successful resume and idempotency.
- **Intelligence Output:** Consistent generation of scored signals and validation artifacts.
- **Stability:** Deterministic artifact generation with <1% failure rate.

## 3. Week-by-Week Milestones
- **Week 1: Foundations & Infrastructure**
  - Next.js App Router, Prisma Schema, Next.js UI structure.
  - Redis + BullMQ worker bootstrap script (`/worker.ts`).
- **Week 2: Intelligence Pipeline Core**
  - Signal scoring logic and ingestion handlers.
  - Idea intelligence pipeline module development.
- **Week 3: Artifact Generation & Reports**
  - Experiment markdown generation.
  - Intelligence report JSON serialization and indexing.
- **Week 4: Observability, Resilience & UI**
  - Next.js dashboard for monitoring runs and viewing artifacts.
  - Dead-letter queue handling and error logging.

## 4. Risks & Mitigation
- **Risk:** OpenRouter free models exhibit high latency or rate-limiting.
  - *Mitigation:* Implement robust rate limit backoffs and exponential retries in BullMQ workers. Fail gracefully.
- **Risk:** Cloudflare Pages API limits or deployment failures.
  - *Mitigation:* Fallback mechanisms and local generation storage. Provide clear error statuses.
- **Risk:** Compliance issues with automated outreach.
  - *Mitigation:* Strict adherence to compliance logic (unsubscribe, bounce checks) enforced at the worker layer before sending emails.

## 5. Dependency Map
- **Campaign** $\rightarrow$ **Intelligence Pipeline**: Runs tied to specific execution boundaries.
- **Signals** $\rightarrow$ **Experiments**: Scoring determines priority for experiment generation.
- **Experiments** $\rightarrow$ **Reports**: Aggregation of validation data into comprehensive reports.

## 6. Clear Owners
- **Project Coordination & Cadence:** COO Advisor
- **Technical Architecture & Implementation:** Founding Engineer