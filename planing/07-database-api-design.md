# Database & API Design Document
## AI Trading Platform

Version: 1.0

---

# Purpose

This document defines the database architecture, entity relationships, API standards, endpoint specifications, and integration patterns for the AI Trading Platform.

---

# Database Technology

Primary Database:

- PostgreSQL

Cache Layer:

- Redis

Object Storage:

- S3 Compatible Storage

---

# Database Design Principles

- Normalize transactional data
- Audit every trading action
- Support future broker integrations
- Support multiple strategies
- Support high-volume historical records

---

# Core Entities

1. Users
2. Broker Accounts
3. Portfolios
4. Strategies
5. Signals
6. Orders
7. Trades
8. Positions
9. Risk Rules
10. Notifications
11. Audit Logs

---

# Users Table

Table: users

Fields:

- id (UUID)
- email
- password_hash
- first_name
- last_name
- role
- status
- mfa_enabled
- created_at
- updated_at

Indexes:

- email unique

---

# Broker Accounts Table

Table: broker_accounts

Fields:

- id
- user_id
- broker_name
- account_id
- encrypted_api_key
- encrypted_secret
- status
- created_at

Relationships:

user -> many broker_accounts

---

# Portfolios Table

Table: portfolios

Fields:

- id
- user_id
- portfolio_name
- portfolio_value
- cash_balance
- created_at

Relationships:

user -> many portfolios

---

# Strategies Table

Table: strategies

Fields:

- id
- user_id
- name
- description
- version
- status
- configuration_json
- created_at

---

# Signals Table

Table: signals

Fields:

- id
- strategy_id
- symbol
- signal_type
- confidence_score
- model_version
- generated_at

Signal Types:

- BUY
- SELL
- HOLD

---

# Orders Table

Table: orders

Fields:

- id
- user_id
- broker_account_id
- symbol
- side
- order_type
- quantity
- price
- status
- submitted_at

Order Status:

- Pending
- Submitted
- Filled
- Partially Filled
- Rejected
- Cancelled

---

# Trades Table

Table: trades

Fields:

- id
- order_id
- symbol
- entry_price
- exit_price
- pnl
- opened_at
- closed_at

---

# Positions Table

Table: positions

Fields:

- id
- user_id
- symbol
- quantity
- average_price
- unrealized_pnl
- updated_at

---

# Risk Rules Table

Table: risk_rules

Fields:

- id
- user_id
- max_risk_per_trade
- max_daily_loss
- max_drawdown
- max_position_size

---

# Notifications Table

Table: notifications

Fields:

- id
- user_id
- notification_type
- title
- message
- status
- created_at

---

# Audit Logs Table

Table: audit_logs

Fields:

- id
- user_id
- action
- entity_type
- entity_id
- metadata_json
- created_at

---

# Entity Relationships

User

- has many Portfolios
- has many Broker Accounts
- has many Strategies
- has many Orders
- has many Positions

Strategy

- generates many Signals

Signal

- may create many Orders

Order

- creates Trades

Trade

- updates Positions

---

# API Design Standards

Protocol:

HTTPS

Format:

JSON

Versioning:

/api/v1

Future:

/api/v2

---

# Authentication API

POST /api/v1/auth/register

Request:

{
  "email": "user@example.com",
  "password": "password"
}

Response:

{
  "success": true
}

---

POST /api/v1/auth/login

Response:

{
  "accessToken": "...",
  "refreshToken": "..."
}

---

POST /api/v1/auth/logout

---

POST /api/v1/auth/refresh

---

# User API

GET /api/v1/users/me

GET /api/v1/users/profile

PUT /api/v1/users/profile

DELETE /api/v1/users/account

---

# Portfolio API

GET /api/v1/portfolios

GET /api/v1/portfolios/{id}

GET /api/v1/portfolios/{id}/performance

---

# Broker API

POST /api/v1/brokers/connect

GET /api/v1/brokers/accounts

DELETE /api/v1/brokers/{id}

---

# Strategy API

POST /api/v1/strategies

GET /api/v1/strategies

GET /api/v1/strategies/{id}

PUT /api/v1/strategies/{id}

DELETE /api/v1/strategies/{id}

---

# Signal API

GET /api/v1/signals

GET /api/v1/signals/{id}

GET /api/v1/signals/history

---

# Trading API

POST /api/v1/orders

GET /api/v1/orders

GET /api/v1/orders/{id}

DELETE /api/v1/orders/{id}

---

# Trade API

GET /api/v1/trades

GET /api/v1/trades/{id}

GET /api/v1/trades/history

---

# Position API

GET /api/v1/positions

GET /api/v1/positions/{symbol}

---

# Risk API

GET /api/v1/risk

PUT /api/v1/risk

---

# Analytics API

GET /api/v1/analytics/performance

GET /api/v1/analytics/drawdown

GET /api/v1/analytics/sharpe

GET /api/v1/analytics/winrate

---

# Notifications API

GET /api/v1/notifications

PUT /api/v1/notifications/read

---

# Admin API

GET /api/v1/admin/users

GET /api/v1/admin/system-health

GET /api/v1/admin/audit-logs

---

# WebSocket Design

Purpose:

Real-time updates

Events:

- Market Price Updates
- Signal Updates
- Order Updates
- Trade Updates
- Notifications

Endpoint:

/ws

---

# API Security

Requirements:

- JWT Authentication
- Rate Limiting
- Request Validation
- RBAC Authorization
- Audit Logging

---

# Error Response Standard

{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request"
  }
}

---

# Pagination Standard

{
  "data": [],
  "page": 1,
  "pageSize": 20,
  "total": 100
}

---

# Future Database Enhancements

Phase 2

- Multi-tenant architecture
- Advanced analytics warehouse

Phase 3

- Event sourcing
- Time-series database

Phase 4

- Distributed data architecture

---

# Success Criteria

The Database & API Design is complete when:

1. All core entities are modeled.
2. Relationships are clearly defined.
3. APIs support MVP functionality.
4. Authentication is secure.
5. Real-time communication is supported.
6. Auditability is maintained.
7. Future scaling paths are documented.
