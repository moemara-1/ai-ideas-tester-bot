# Immediate MVP Build Plan

## Delivery objective

Deliver a production-lean MVP that can run campaign -> lead -> demo -> outreach -> reply -> payment with resilient queue orchestration.

## Phase 0 (now): foundation

- lock architecture decisions and queue topology
- define environment contract and quality gates
- sequence first implementation PRs

Exit criteria:
- docs and execution sequence approved
- child tasks created for PR stream

## Phase 1: platform bootstrap

Scope:
- initialize Next.js + TypeScript + Tailwind + Prisma + BullMQ integration
- add env validation and free-model allowlist gate
- scaffold worker runtime (`worker.ts`)

Exit criteria:
- app boots locally
- workers connect to Redis
- Prisma migration from clean database succeeds

## Phase 2: Scout + Intel pipeline

Scope:
- implement campaign creation and Scout ingestion from Google Maps
- implement Intel enrichment pipeline and lead scoring baseline
- persist activity logs for each step

Exit criteria:
- a campaign can generate scored leads end-to-end through Intel
- retries and idempotency verified in failure tests

## Phase 3: Builder + Outreach

Scope:
- generate/deploy demo sites to Cloudflare Pages
- create personalized outreach email with compliance checks
- send through Resend and track outcomes

Exit criteria:
- lead record includes deployed demo URL
- outreach sent only to compliant, non-suppressed contacts

## Phase 4: Closer + Scheduler + webhooks

Scope:
- handle Resend replies and intent classification
- create Stripe payment links for buying intent
- schedule meetings when calendar integration exists

Exit criteria:
- webhook replay protection proven
- positive intent path creates payment and scheduling actions

## Phase 5: hardening + UI completeness

Scope:
- dashboard polish (campaign list, Kanban pipeline, lead detail timeline)
- observability, dead-letter tooling, and runbook docs
- core integration and end-to-end tests

Exit criteria:
- resumable workers
- operational docs complete
- release readiness checklist passes
