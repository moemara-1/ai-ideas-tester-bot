# Architecture Outline (Intelligence Baseline)

## Objective

Refactor the repository into a viral AI idea intelligence and experimentation system with a concrete runnable loop:

1. source ingest
2. signal scoring
3. experiment artifact generation
4. report publishing

## Core Runtime Shape

1. Next.js app + API control plane
2. Prisma (SQLite for local verification)
3. Redis + BullMQ workers (sync and async execution)
4. Intelligence pipeline module: `src/lib/campaigns/idea-pipeline.ts`
5. Artifact output root: `artifacts/intelligence/`

## Execution Path

### 1) Source Ingest

- Inputs come from:
  - explicit seeded signals (`seedSignals`) or
  - deterministic generated trend signals when no seeds are provided.
- API/Service writes each signal into `Business` as a normalized source record.
- `ActivityLog` event: `source.ingested`.

### 2) Signal Scoring

- Each source signal is transformed into a scored signal (`Lead`) with:
  - composite score
  - virality/novelty/execution metadata
  - normalized summary and qualification notes.
- `Lead.status` enters intelligence stages (`signal_scored` and later).
- `ActivityLog` event: `signal.scored`.

### 3) Experiment Runner

- Top scored signals generate markdown experiment artifacts:
  - `artifacts/intelligence/experiments/<campaign-slug>/<lead-id>-exp-XX.md`
- `Lead.status` transitions through `experiment_completed` then `report_published`.
- `ActivityLog` event: `experiment.artifact.generated`.

### 4) Report Publisher

- A deterministic report ID is generated from campaign + signal set.
- JSON report is written to:
  - `artifacts/intelligence/reports/<campaign-slug>/<report-id>.json`
- `ActivityLog` event: `report.generated`.

## API and Queue Integration

- Campaign creation defaults to the core intelligence pipeline.
- `POST /api/campaigns/:campaignId/run` defaults to intelligence mode.
- Async mode (`?async=true`) dispatches to the `idea.pipeline` queue.

## Queue Topology

- `idea.pipeline` (default intelligence queue)

All queues retain idempotent job IDs and DLQ routing.

## Core Domain Model (minimum)

- `Campaign`: execution boundary and mode carrier.
- `Business`: normalized source signal record.
- `Lead`: scored signal record and lifecycle state.
- `ActivityLog`: immutable run timeline and artifact references.
- `AgentRun`: worker execution telemetry.

Legacy models (`DemoSite`, `OutreachMessage`, `Payment`) remain for compatibility.

## Reliability and Safety Controls

- deterministic source generation fallback when seed signals are absent
- idempotent upserts for source and signal writes
- report and experiment artifact paths emitted into activity logs
- queue-level retries + DLQ for async mode

## State Model

Intelligence lifecycle states are first-class:

- `source_ingested`
- `signal_scored`
- `experiment_queued`
- `experiment_running`
- `experiment_completed`
- `report_published`

## Minimal Validation Contract

A run is considered successful when:

1. at least one source signal is ingested,
2. at least one signal is scored,
3. at least one experiment artifact is written,
4. one report artifact is written and linked in activity logs.
