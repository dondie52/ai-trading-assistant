# CLAUDE.md
# AI Trading Platform Development Guide

Version: 1.0

---

# Project Overview

The AI Trading Platform is a professional-grade trading system that uses artificial intelligence, quantitative analysis, and automated execution to assist or automate market trading.

This document defines the operating rules for all AI coding assistants, developers, architects, and contributors.

This file must be treated as the authoritative engineering guide for the project.

---

# Project Objectives

Primary goals:

1. Secure trading operations
2. Reliable execution
3. Risk-first architecture
4. AI-assisted decision making
5. Regulatory readiness
6. Scalable infrastructure

---

# Technology Stack

## Frontend

- Next.js
- React
- TypeScript
- TailwindCSS
- TanStack Query
- Zustand

---

## Backend

- NestJS
- TypeScript
- REST APIs
- WebSockets

---

## AI Services

- Python
- FastAPI
- Scikit-Learn
- XGBoost
- PyTorch

---

## Database

- PostgreSQL
- Redis

---

## Infrastructure

- Docker
- GitHub Actions
- AWS

---

# Architecture Rules

## Rule 1

Business logic must never exist in frontend components.

---

## Rule 2

All trading operations must pass through the Risk Engine.

---

## Rule 3

Broker implementations must use the Broker Abstraction Layer.

Never call broker APIs directly from business services.

---

## Rule 4

All external integrations must be isolated behind adapters.

---

## Rule 5

Services must be loosely coupled.

---

# Risk Engine Authority

The Risk Engine is the highest authority in the trading system.

If Risk Engine rejects a trade:

- Trade must not execute.
- No bypasses allowed.
- No administrator override without explicit audit logging.

---

# Security Rules

## Authentication

Required:

- JWT
- Refresh Tokens
- MFA

---

## Secrets

Never:

- Store secrets in code
- Commit API keys
- Commit passwords

Always:

- Use environment variables
- Use secret management services

---

## Encryption

Required:

- TLS 1.3
- AES-256

---

# Database Rules

## IDs

All primary keys:

UUID

---

## Migrations

Required:

- Prisma migrations
- Version controlled

Never modify production schema manually.

---

## Auditability

All trading actions must be recorded.

---

# API Standards

## Versioning

Use:

/api/v1

Future versions:

/api/v2

---

## Response Format

Success:

{
  "success": true,
  "data": {}
}

Error:

{
  "success": false,
  "error": {}
}

---

# Coding Standards

## General

Prefer:

- Readability
- Simplicity
- Explicitness

Avoid:

- Premature optimization
- Over-engineering

---

## TypeScript

Requirements:

- Strict mode enabled
- No any types
- Explicit return types

---

## Python

Requirements:

- Type hints
- Black formatting
- Pydantic models

---

# Folder Structure

/apps
/web
/api
/ai-service

/packages
/shared
/types
/utils

/infrastructure
/docker
/terraform

/docs

---

# Frontend Standards

Use:

- Server Components where appropriate
- Reusable UI components
- Feature-based organization

Avoid:

- Business logic in pages
- Large monolithic components

---

# Backend Standards

Use:

- Controllers
- Services
- Repositories

Pattern:

Controller
→ Service
→ Repository

---

# Trading Engine Rules

Every trade must:

1. Validate signal.
2. Validate risk.
3. Calculate position size.
4. Validate broker status.
5. Execute order.
6. Log execution.

---

# AI Model Standards

Every model must include:

- Version number
- Training metadata
- Evaluation metrics
- Deployment timestamp

---

# Backtesting Rules

Backtests must include:

- Fees
- Slippage
- Market constraints

Never publish unrealistic results.

---

# Monitoring Standards

Required Metrics:

- API latency
- Signal latency
- Trade latency
- Error rate
- Queue depth

---

# Logging Standards

Log:

- Errors
- Warnings
- Trade events
- Security events

Never log:

- Passwords
- Secrets
- API keys

---

# Testing Standards

## Unit Tests

Coverage target:

80%+

---

## Integration Tests

Required:

- Broker integrations
- Database operations
- Trading workflows

---

## End-to-End Tests

Required:

- User registration
- Login
- Strategy creation
- Trade execution

---

# Git Workflow

Branches:

main
develop
feature/*
bugfix/*

---

## Pull Requests

Requirements:

- Tests passing
- Linting passing
- Security checks passing

---

# CI/CD Rules

Pipeline:

1. Lint
2. Test
3. Security Scan
4. Build
5. Deploy

---

# Documentation Rules

Every major feature requires:

- Technical documentation
- API documentation
- Test coverage

---

# AI Agent Instructions

When generating code:

1. Follow architecture documents.
2. Follow database design.
3. Follow API specifications.
4. Prioritize security.
5. Prioritize maintainability.
6. Never bypass risk controls.

---

# AI Agent Prohibitions

Never:

- Hardcode credentials
- Disable authentication
- Bypass authorization
- Bypass risk validation
- Skip audit logging

---

# Performance Targets

API:

< 300ms average

Dashboard:

< 2 seconds

Trade Submission:

< 1 second

---

# Deployment Environments

Development

Local developer environment

---

Staging

Pre-production validation

---

Production

Live trading environment

---

# Definition of Done

A feature is complete only when:

- Requirements implemented
- Tests passing
- Documentation updated
- Security reviewed
- Audit logging included
- Monitoring added

---

# Long-Term Vision

The platform should evolve into a modular AI trading ecosystem supporting:

- Multiple brokers
- Multiple asset classes
- Advanced AI models
- Portfolio optimization
- Institutional-grade automation

All future development should support this vision while preserving security, reliability, and risk management.
