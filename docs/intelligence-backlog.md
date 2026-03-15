# Intelligence Pipeline Risks, Tradeoffs, and Immediate Backlog

## Key Risks

1. Signal quality drift
- Risk: deterministic/generated inputs can overfit synthetic patterns.
- Impact: experiment artifacts may look valid but underperform in real channels.
- Mitigation: introduce real source adapters (Reddit/X/YouTube APIs) with freshness windows and dedupe.

2. Artifact sprawl
- Risk: repeated runs accumulate many markdown/json artifacts.
- Impact: noisy filesystem, hard-to-track experiment lineage.
- Mitigation: add retention policy + run indexing + optional object storage backend.

3. Score calibration instability
- Risk: current heuristic scoring weights are static.
- Impact: top-ranked signals may not correlate with downstream conversion.
- Mitigation: add score feedback loop from experiment outcomes and periodic weight tuning.

4. Cross-entity complexity
- Risk: intelligence signals and experiments share the same underlying entities (`Campaign`, `Business`, `Lead`).
- Impact: potential semantic overlap as the system evolves.
- Mitigation: maintain strict naming conventions in metadata and plan for domain table specialization as volume increases.

## Explicit Tradeoffs in This Slice

1. Unified architecture over multi-mode branching
- Chose a consolidated intelligence path over maintaining legacy outreach branching.
- Reason: simplifies maintenance and focus on the primary mission.

2. Filesystem artifacts over external storage
- Chose local artifacts (`artifacts/intelligence/...`) for deterministic local validation.
- Reason: no infra dependency required for proving end-to-end execution.

3. Heuristic scoring over model-based ranking
- Chose deterministic formula for repeatability in CI/e2e.
- Reason: stable tests and easier debugging.

## Immediate Follow-up Backlog

1. Real source connectors
- Add provider adapters and normalization contracts per source.
- Add replay-safe checkpoints for incremental ingest.

2. Experiment execution telemetry
- Track downstream metrics (CTR/replies/conversations) and map back to signal IDs.
- Store outcome snapshots to support ranking feedback.

3. Mode-separated views
- Consolidate dashboard to focus solely on `idea_intelligence` outcomes.

4. Artifact index API
- Add endpoint to list reports/experiments with pagination and campaign scoping.

5. Cleanup obsolete outreach code
- Systematically remove now-unused outreach modules and API endpoints.
