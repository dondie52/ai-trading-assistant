"use client";

import {
  Bot,
  ClipboardList,
  FlaskConical,
  Lock,
  Mail,
  Shield,
  Sparkles,
  Wallet
} from "lucide-react";
import type { FormEvent, ReactElement } from "react";

interface LandingPageProps {
  readonly loginEmail: string;
  readonly loginPassword: string;
  readonly loginMfaCode: string;
  readonly mfaChallenge: boolean;
  readonly notice: string;
  readonly submitting: boolean;
  readonly onLoginEmailChange: (value: string) => void;
  readonly onLoginPasswordChange: (value: string) => void;
  readonly onLoginMfaCodeChange: (value: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const features = [
  {
    icon: Sparkles,
    title: "Survival agent",
    description: "Dondie trades autonomously and earns wallet balance to fund smarter brains."
  },
  {
    icon: Wallet,
    title: "Wallet economics",
    description: "Profits credit the wallet; brain runs debit it. Tier access follows balance."
  },
  {
    icon: Shield,
    title: "Risk engine authority",
    description: "Every order passes through hard risk gates — the agent cannot override them."
  },
  {
    icon: Bot,
    title: "Tiered cognition",
    description: "FREE, STANDARD, and PRO brains with escalating capability and cost per run."
  },
  {
    icon: FlaskConical,
    title: "Paper proving ground",
    description: "Validate agent performance in simulation before live capital is enabled."
  },
  {
    icon: ClipboardList,
    title: "Operator audit trail",
    description: "Immutable logs for every run, trade, wallet change, and risk block."
  }
] as const;

export function LandingPage({
  loginEmail,
  loginPassword,
  loginMfaCode,
  mfaChallenge,
  notice,
  submitting,
  onLoginEmailChange,
  onLoginPasswordChange,
  onLoginMfaCodeChange,
  onSubmit
}: LandingPageProps): ReactElement {
  return (
    <div className="relative min-h-screen overflow-hidden bg-obsidian-deepest text-obsidian-on">
      <div className="pointer-events-none absolute inset-0 bg-obsidian-bg" />
      <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-50" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-[400px] w-[400px] rounded-full bg-obsidian-primary-container/30 blur-[80px]" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-[300px] w-[300px] rounded-full bg-emerald-600/20 blur-[80px]" />

      <header className="relative z-20 border-b border-white/[0.08] bg-obsidian-container-low/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-obsidian-bright/50 shadow-inner">
              <Sparkles className="h-5 w-5 text-obsidian-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-obsidian-primary">
                Dondie
              </p>
              <p className="text-sm text-obsidian-muted">Autonomous survival agent</p>
            </div>
          </div>
          <a
            href="#sign-in"
            className="rounded-lg border border-obsidian-outline-variant/50 bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-widest text-obsidian-on transition hover:bg-white/5"
          >
            Operator sign in
          </a>
        </div>
      </header>

      <main className="relative z-10">
        <section className="px-4 py-12 md:px-8 md:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_420px] lg:items-start lg:gap-16">
            <div className="space-y-8 pt-2">
              <div className="space-y-4">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-obsidian-secondary">
                  Trade to survive
                </p>
                <h1 className="text-4xl font-bold leading-tight tracking-tight text-obsidian-on md:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
                  An agent that pays
                  <span className="mt-1 block text-obsidian-primary">for its own mind.</span>
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-obsidian-muted md:text-lg">
                  Dondie trades markets, credits its wallet from PnL, and spends balance on tiered brains.
                  This console is the operator control room — not a consumer trading app.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {features.slice(0, 4).map((feature) => (
                  <div
                    key={feature.title}
                    className="rounded-lg border border-white/[0.08] bg-obsidian-container-low/50 p-4 backdrop-blur-sm"
                  >
                    <feature.icon className="mb-2 h-4 w-4 text-obsidian-secondary" aria-hidden="true" />
                    <h3 className="text-sm font-medium text-obsidian-on">{feature.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-obsidian-muted">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div
              id="sign-in"
              className="relative overflow-hidden rounded-xl border border-white/10 bg-obsidian-container-low/80 p-8 shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl lg:sticky lg:top-24"
            >
              <div className="pointer-events-none absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-obsidian-primary/50 to-transparent" />
              <header className="mb-6 flex flex-col items-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-obsidian-bright/50 shadow-inner">
                  <Lock className="h-6 w-6 text-obsidian-primary" aria-hidden="true" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-obsidian-on">Operator Access</h2>
                <p className="mt-1 text-sm text-obsidian-outline">Admin-provisioned credentials only</p>
              </header>

              <form className="space-y-4" onSubmit={onSubmit}>
                <label className="block">
                  <span className="mb-1 block pl-1 text-xs font-semibold uppercase tracking-widest text-obsidian-muted">
                    Email address
                  </span>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-obsidian-outline-variant"
                      aria-hidden="true"
                    />
                    <input
                      data-testid="login-email"
                      className="w-full rounded-lg border border-obsidian-outline-variant/50 bg-obsidian-bg py-3 pl-10 pr-4 text-obsidian-on outline-none transition placeholder:text-obsidian-outline-variant focus:border-obsidian-primary focus:ring-1 focus:ring-obsidian-primary"
                      value={loginEmail}
                      onChange={(event) => onLoginEmailChange(event.target.value)}
                      placeholder="operator@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1 block pl-1 text-xs font-semibold uppercase tracking-widest text-obsidian-muted">
                    Password
                  </span>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-obsidian-outline-variant"
                      aria-hidden="true"
                    />
                    <input
                      data-testid="login-password"
                      className="w-full rounded-lg border border-obsidian-outline-variant/50 bg-obsidian-bg py-3 pl-10 pr-4 text-obsidian-on outline-none transition placeholder:text-obsidian-outline-variant focus:border-obsidian-primary focus:ring-1 focus:ring-obsidian-primary"
                      value={loginPassword}
                      onChange={(event) => onLoginPasswordChange(event.target.value)}
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </label>

                {mfaChallenge ? (
                  <label className="block">
                    <span className="mb-1 block pl-1 text-xs font-semibold uppercase tracking-widest text-obsidian-muted">
                      Authenticator code
                    </span>
                    <input
                      data-testid="login-mfa-code"
                      className="w-full rounded-lg border border-obsidian-outline-variant/50 bg-obsidian-bg px-4 py-3 font-mono tracking-[0.25em] text-obsidian-secondary outline-none focus:border-obsidian-secondary focus:ring-1 focus:ring-obsidian-secondary"
                      value={loginMfaCode}
                      onChange={(event) => onLoginMfaCodeChange(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      maxLength={6}
                      required
                    />
                  </label>
                ) : null}

                <button
                  data-testid="login-submit"
                  type="submit"
                  disabled={submitting}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-obsidian-primary-container px-4 py-3 text-xs font-semibold uppercase tracking-widest text-white shadow-[0_0_15px_rgba(124,58,237,0.3)] transition hover:bg-violet-600 hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] disabled:opacity-60"
                >
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  {submitting ? "Authenticating…" : "Enter control room"}
                </button>
              </form>

              {notice ? (
                <p
                  data-testid="auth-notice"
                  className="mt-4 rounded-lg border border-white/10 bg-obsidian-bg/80 px-3 py-2 text-sm text-obsidian-muted"
                >
                  {notice}
                </p>
              ) : null}

              <p className="mt-6 flex items-center justify-center gap-2 font-mono text-[10px] text-obsidian-outline/60">
                <Lock className="h-3 w-3" aria-hidden="true" />
                End-to-end encrypted connection
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.08] bg-obsidian-container/40 px-4 py-14 md:px-8 md:py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 max-w-2xl">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-obsidian-primary">
                Survival stack
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-obsidian-on md:text-3xl">
                Infrastructure for one autonomous agent
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-lg border border-white/[0.08] bg-obsidian-container-low/40 p-5 backdrop-blur-sm"
                >
                  <feature.icon className="mb-3 h-5 w-5 text-obsidian-primary" aria-hidden="true" />
                  <h3 className="font-medium text-obsidian-on">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-obsidian-muted">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.08] px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-obsidian-outline sm:flex-row">
          <p>Dondie — autonomous survival agent</p>
          <p className="font-mono text-xs uppercase tracking-widest">Operator access only</p>
        </div>
      </footer>
    </div>
  );
}
