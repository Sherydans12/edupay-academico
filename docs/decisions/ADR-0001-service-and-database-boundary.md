# ADR-0001: independent academic service and database

Status: Proposed; the separation is mandated, deployment topology is unresolved  
Date: 2026-08-08

## Context

EduPay Académico is a new multi-tenant product, while EduPay already owns student, course, and financial information. Direct table sharing would couple schemas, migrations, authorization, and availability across products.

## Candidate decision

Operate EduPay Académico as an independent bounded service with its own PostgreSQL 15 database. Integrate with EduPay through explicit APIs or synchronization contracts. Keep EduPay Identity as a separate identity ownership boundary.

## Rationale

- Preserves ownership and migration independence.
- Makes tenant isolation explicit in the new product.
- Allows manual creation and local academic workflows when integration is unavailable.
- Avoids leaking financial or unrelated EduPay data into the academic domain.

## Consequences

- Requires external IDs, sync/reconciliation, and eventual consistency handling.
- Requires operational ownership for another database and service boundary.
- Duplicated academic projections may need lifecycle and conflict rules.

## Open items before acceptance

- Production service/deployment topology.
- Exact EduPay integration contract and source-of-truth matrix.
- Identity network/authentication boundary is defined for Académico by [ADR-0009](ADR-0009-identity-contract-reconciliation.md); deployment topology and operational connectivity remain subject to the deployment decision.
