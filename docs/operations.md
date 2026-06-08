# Operations Runbook

## Runtime Health

- Public readiness: `GET /api/v1/health`
- Admin health: `GET /api/v1/admin/system-health`
- Admin metrics: `GET /api/v1/admin/metrics`
- Compose services use `restart: unless-stopped` and health checks.

Monitor at least:

- API average and p95 latency
- API error rate
- Signal latency, throughput, confidence, and model versions
- Trade execution latency and rejected/submitted/executed outcomes
- Notification queue depth
- PostgreSQL and Redis reachability
- Broker connection failures and risk rejection audit events

Suggested initial alerts:

| Metric | Warning | Critical |
| --- | --- | --- |
| API p95 latency | over 500 ms for 5 minutes | over 1,000 ms for 5 minutes |
| API error rate | over 2% for 5 minutes | over 5% for 5 minutes |
| Trade latency | over 750 ms | over 1,000 ms |
| Notification queue depth | over 100 | over 1,000 |
| Database or Redis | one failed probe | unavailable for 2 minutes |

Forward production metrics to Prometheus/Grafana and application logs to Loki or an equivalent retained log platform. The MVP endpoint provides the source metrics but external alert routing must be configured by the deployment owner.

## PostgreSQL Backup

Recovery objectives from the planning documents:

- RPO: 15 minutes
- RTO: 4 hours

Use managed PostgreSQL point-in-time recovery in production. For local or staging validation:

```bash
docker compose exec -T postgres pg_dump \
  --username "$POSTGRES_USER" \
  --format=custom \
  "$POSTGRES_DB" > ai-trading.backup
```

Keep backups encrypted, access-controlled, off-host, and covered by retention policy. Schedule daily full backups and provider-supported incremental or WAL archiving no less frequently than the RPO.

## Restore Exercise

Restore into an isolated database, never over the active database:

```bash
docker compose exec -T postgres createdb \
  --username "$POSTGRES_USER" ai_trading_restore

docker compose exec -T postgres pg_restore \
  --username "$POSTGRES_USER" \
  --dbname ai_trading_restore \
  --clean --if-exists < ai-trading.backup
```

Then:

1. Run Prisma migration status against the restored database.
2. Start one API instance pointed at the restored database.
3. Verify health, user/session counts, portfolio totals, open positions, order history, and immutable audit records.
4. Record measured RPO/RTO and any reconciliation differences.
5. Destroy the isolated restore database after evidence is retained.

## Service Recovery

1. Stop automated trading before dependency maintenance.
2. Confirm broker-side open orders and positions independently.
3. Restore PostgreSQL and Redis connectivity.
4. Start AI service, API, then web; wait for health checks.
5. Reconcile broker orders/positions with platform records.
6. Review audit events and operational metrics before re-enabling automation.

Do not enable live-capital trading until backup restoration, service recovery, security review, broker certification, and the paper-trading campaign in `paper-trading-validation.md` are approved.
