# First Execution PR / Task Sequence

All PRs are intentionally small and mergeable to maximize parallelism and reduce rollback risk.

## PR-1: Bootstrap Runtime and Tooling

Scope:
- initialize Next.js app + TypeScript + Tailwind
- add Prisma, BullMQ, Zod env validation
- implement strict free-model allowlist module

Definition of done:
- app starts and builds
- env validation fails fast on missing required values
- non-free OpenRouter model request is rejected

## PR-2: Database Schema and Shared Domain Types

Scope:
- implement Prisma models for required entities
- create first migration and seed strategy
- define shared enums/types for lead and run states

Definition of done:
- clean migration succeeds
- seed creates deterministic local fixtures
- schema supports pipeline lifecycle transitions

## PR-3: Queue and Worker Backbone

Scope:
- implement queue registry and worker boot (`worker.ts`)
- add retry/backoff/dlq defaults
- implement `AgentRun` + `ActivityLog` instrumentation helpers

Definition of done:
- all six worker stubs boot and consume no-op jobs
- dead-letter routing validated in simulated failure

## PR-4: Scout + Intel Vertical Slice

Scope:
- create campaign API and enqueue Scout jobs
- implement Scout ingestion and Intel enrichment/score
- expose lead list/read endpoints

Definition of done:
- one campaign produces leads through Intel stage
- idempotent re-run does not duplicate businesses/leads

## PR-5: Builder + Outreach Vertical Slice

Scope:
- generate/deploy demo site and store `DemoSite`
- generate/send outreach via Resend with suppression enforcement
- append delivery events to timeline

Definition of done:
- outreach message links valid demo URL
- unsubscribe and suppression rules are enforced

## PR-6: Closer + Scheduler + Webhooks

Scope:
- implement Resend + Stripe webhook handlers
- parse intent and create payment/scheduling actions
- harden replay protection and auditing

Definition of done:
- verified replay-safe webhook processing
- positive reply path creates payment flow

## PR-7: Dashboard Completion + Hardening

Scope:
- complete pipeline Kanban and lead detail experience
- add integration tests and operational runbook
- add metrics/alerts baseline

Definition of done:
- dashboard reflects live states
- end-to-end test passes for happy path and retry path
