# UI/UX Specification

## Dondie Operator Console

Version: 2.0

Related Documents:

* `docs/dondie-survival-model.md`
* `01-project-vision.md`
* `08-CLAUDE.md`

---

# Purpose

This document defines the visual architecture and UX standards for the **Dondie operator console** — the control room where the human operator monitors the survival agent, wallet, runs, and trading infrastructure.

This is not a consumer trading product UI. Every screen should reinforce: agent status, survival economics, risk boundaries, and operator control.

---

# Wireframe Assets Location

Official wireframe repository:

C:\Users\user\OneDrive\Documents\soc\ai trade\planning\wireframes

All generated Stitch screens, revisions, and future UI prototypes must be stored in this directory.

The wireframes contained in this directory are considered the visual source of truth for UI implementation.

If conflicts exist between textual descriptions and wireframes, the latest approved wireframes take precedence.

---

# Design Philosophy

The platform should communicate:

* Trust
* Intelligence
* Precision
* Security
* Professionalism

Visual inspiration:

* Bloomberg Terminal
* TradingView
* Institutional Trading Platforms
* Modern FinTech Applications

---

# Design System

## Theme

Primary Theme:

Dark Mode

Secondary Theme:

Light Mode (Future Release)

---

## Typography

Primary Font:

Inter

Secondary Font:

JetBrains Mono

Usage:

Inter

* Navigation
* Headings
* Forms

JetBrains Mono

* Prices
* Trade IDs
* Metrics
* PnL Values

---

## Color System

AI Actions:

* Violet

Positive Performance:

* Emerald

Negative Performance:

* Crimson

Neutral States:

* Slate Gray

Warnings:

* Amber

Critical Alerts:

* Red

---

# Navigation Structure

Primary Navigation

* Dashboard
* Portfolio
* AI Signals
* Trading Bot
* Risk Management
* Paper Trading
* Trade History
* Settings

Administrative Navigation

* User Management
* Audit Logs
* System Health
* AI Monitoring

---

# Screen Inventory

## Screen 01

institutional_login

Purpose:
User authentication.

Functions:

* Login
* MFA
* Password reset
* Registration link

---

## Screen 02

quant_core_dashboard

Purpose:
Primary user landing page.

Components:

* Portfolio summary
* Daily P/L
* Watchlist
* AI signals
* Open positions
* Market overview

---

## Screen 03

portfolio_intelligence

Purpose:
Portfolio management.

Components:

* Holdings
* Allocation breakdown
* Portfolio performance
* Risk exposure

---

## Screen 04

ai_signal_center

Purpose:
AI signal review.

Components:

* Buy signals
* Sell signals
* Confidence scores
* Signal history

---

## Screen 05

risk_matrix_control

Purpose:
Risk management configuration.

Components:

* Daily loss limits
* Drawdown limits
* Position sizing rules
* Exposure controls

---

## Screen 06

ai_bot_factory

Purpose:
Trading bot configuration.

Components:

* Strategy selection
* Model selection
* Automation controls
* Execution settings

---

## Screen 07

simulation_lab

Purpose:
Paper trading environment.

Components:

* Simulated trades
* Portfolio simulation
* Strategy testing
* Performance reports

---

## Screen 08

trade_audit_access

Purpose:
Trade history and auditing.

Components:

* Executed trades
* Audit events
* Export tools
* Search and filtering

---

## Screen 09

quantcore_admin_panel

Purpose:
Administrative control center.

Components:

* User management
* System monitoring
* Security events
* Audit logs

---

## Screen 10

quant_core_mobile_dashboard

Purpose:
Mobile trading experience.

Components:

* Portfolio snapshot
* Signals
* Quick actions
* Notifications

---

# User Flows

## User Login Flow

Login
→ MFA Verification
→ Dashboard

---

## Trading Flow

Signal Generated
→ User Review
→ Risk Validation
→ Order Submission
→ Trade Confirmation

---

## Automated Trading Flow

Signal Generated
→ Risk Validation
→ Position Sizing
→ Order Execution
→ Portfolio Update

---

## Paper Trading Flow

Strategy Selection
→ Simulation
→ Performance Tracking
→ Analysis

---

# Component Standards

All components must support:

* Loading State
* Empty State
* Error State
* Success State

---

# Accessibility Requirements

Minimum Standards:

* WCAG 2.1 AA
* Keyboard Navigation
* Screen Reader Support
* Color Contrast Compliance

---

# Responsive Design Requirements

Desktop:
1440px+

Tablet:
768px–1439px

Mobile:
320px–767px

---

# Source of Truth

UI implementation must follow:

1. This document
2. Stitch wireframes in the wireframes folder
3. DESIGN.md from the Stitch export

If conflicts occur, approved wireframes take precedence.
