# Campaign Scorecard (RelateOS)

Use this scorecard for the first live campaign to validate real-world results.

## Campaign Setup

- Content item: 1
- Target count: 10-20 relationships
- Follow-up step: Day 0 bulk send, then Day 2 and Day 5
- Owner: one operator for consistency
- Validation rule: run control and optimized campaigns within the same 24-48 hour window
- Minimum sample size: at least 15 sends per campaign before calling a winner

## Core Metrics (Track Daily)

- Sent count: total follow-up sends executed
- Reply count: relationships marked as responded
- Ignored count: relationships marked as ignored
- Time-to-response: average hours from send to first response
- Call count: calls booked from campaign responses
- Opportunity count: opportunities opened from campaign responses

## Conversion Metrics

- Reply rate: `reply_count / sent_count`
- Call-booked rate: `call_count / sent_count`
- Opportunity rate: `opportunity_count / sent_count`
- Engagement rate: `(reply_count + ignored_count) / sent_count`
- Response speed: `sum(response_hours) / reply_count`
- Normalized readout: `18 sends -> 4 replies -> 22%`

## Success Thresholds (Week 1)

- Sent count >= 15
- Reply rate >= 15%
- Call-booked rate >= 5%
- Opportunity rate >= 2%
- 100% of contacted relationships labeled `responded` or `ignored` by end of week

## Quality Checklist

- Target quality: at least 70% of selected targets feel relevant on manual review
- Message quality: at least 80% of outgoing messages require no manual editing
- Safety: no action sends above configured bulk cap

## Tuning Plan (Single Pass)

1. If reply rate is low: tighten targeting overlap and lower selected count per batch.
2. If message edits are frequent: adjust tone/length style overrides for follow-up generation.
3. If ignored rate is high: use stronger personalization in Day 0 message goals.
4. If replies are slow: shorten the initial message and increase recent-activity weighting before the next optimized run.

## Proof Readout

- Control: default preset, same content, same send window, comparable audience slice
- Optimized: suggested adjustments applied, same content, same send window, comparable audience slice
- Show lift with normalized results, for example: `18 sends -> 4 replies -> 22%` vs `18 sends -> 7 replies -> 39%`
- Report confidence as `High (82/100)` plus evidence volume and consistency
- Prefer projected lift ranges, for example: `+12% to +20%`, instead of single-point promises

## Campaign Notes Template

- Date:
- Content title:
- Sent count:
- Reply count:
- Ignored count:
- Calls booked:
- Opportunities created:
- What worked:
- What to change next run:
