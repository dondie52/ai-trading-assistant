"use client";

import {
  ArrowRight,
  BarChart3,
  Bot,
  ClipboardList,
  FlaskConical,
  LineChart,
  Lock,
  Shield,
  Sparkles,
  Users
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
    icon: Shield,
    title: "Risk engine authority",
    description: "Every order passes through configurable risk gates before execution. Rejected trades are logged, not silently dropped.",
    accent: "border-emerald-400"
  },
  {
    icon: Sparkles,
    title: "Model-versioned AI signals",
    description: "Deterministic signal scoring with confidence thresholds, explainable features, and full audit lineage.",
    accent: "border-violetSignal"
  },
  {
    icon: ClipboardList,
    title: "Immutable audit trail",
    description: "Append-only event history for trades, risk blocks, backtests, and admin actions — built for compliance review.",
    accent: "border-caution"
  },
  {
    icon: BarChart3,
    title: "Portfolio intelligence",
    description: "Real-time positions, equity curves, performance metrics, and exportable CSV/PDF reports.",
    accent: "border-emerald-400"
  },
  {
    icon: FlaskConical,
    title: "Simulation lab",
    description: "Historical backtests and walk-forward validation with fees, slippage, and out-of-sample windows.",
    accent: "border-violetSignal"
  },
  {
    icon: Bot,
    title: "Strategy automation",
    description: "Manual, semi-automated, and fully automated paper trading workflows with strategy lifecycle controls.",
    accent: "border-caution"
  }
] as const;

const steps = [
  {
    step: "01",
    title: "Admin provisions your account",
    description: "Your platform administrator creates your login and shares credentials securely. Self-registration is not available."
  },
  {
    step: "02",
    title: "Sign in to the terminal",
    description: "Use the email and password provided by your admin. MFA can be required for additional account protection."
  },
  {
    step: "03",
    title: "Trade with guardrails",
    description: "Configure strategies, monitor markets, and execute paper trades — all within enforced risk limits."
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-[#0b1117]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-400/40 bg-emerald-400/10">
              <LineChart className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-200">QuantCore</p>
              <p className="text-sm font-medium text-white">AI Trading Platform</p>
            </div>
          </div>
          <a
            href="#sign-in"
            className="rounded-md border border-line bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:border-emerald-400/40 hover:text-white"
          >
            Sign in
          </a>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pb-16 pt-12 md:px-8 md:pb-24 md:pt-20">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(16,185,129,0.15), transparent 40%), radial-gradient(circle at 80% 10%, rgba(139,92,246,0.12), transparent 35%)"
            }}
          />
          <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.1fr_400px] lg:items-start">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Invite-only access
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold leading-tight text-white md:text-6xl">
                  Risk-first trading,
                  <span className="block text-emerald-300">institutional discipline.</span>
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-slate-300 md:text-lg">
                  QuantCore combines AI signal generation, paper trading, and hardened risk controls in a single
                  operator terminal. Accounts are provisioned by administrators — not self-registered.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-line bg-panel/60 p-4">
                  <p className="font-mono text-2xl font-semibold text-emerald-300">100%</p>
                  <p className="mt-1 text-xs text-slate-400">Orders risk-checked</p>
                </div>
                <div className="rounded-lg border border-line bg-panel/60 p-4">
                  <p className="font-mono text-2xl font-semibold text-violet-300">6</p>
                  <p className="mt-1 text-xs text-slate-400">Market timeframes</p>
                </div>
                <div className="rounded-lg border border-line bg-panel/60 p-4">
                  <p className="font-mono text-2xl font-semibold text-amber-300">∞</p>
                  <p className="mt-1 text-xs text-slate-400">Immutable audit events</p>
                </div>
              </div>
            </div>

            <div
              id="sign-in"
              className="rounded-xl border border-line bg-panel/95 p-6 shadow-2xl shadow-black/30 lg:sticky lg:top-24"
            >
              <div className="mb-5 space-y-1">
                <h2 className="text-lg font-semibold text-white">Sign in</h2>
                <p className="text-sm text-slate-400">
                  Use credentials provided by your administrator. Need access? Contact your platform admin.
                </p>
              </div>
              <form className="space-y-4" onSubmit={onSubmit}>
                <label className="block text-sm text-slate-300">
                  Email
                  <input
                    data-testid="login-email"
                    className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-3 text-white outline-none transition focus:border-violetSignal"
                    value={loginEmail}
                    onChange={(event) => onLoginEmailChange(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Password
                  <input
                    data-testid="login-password"
                    className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-3 text-white outline-none transition focus:border-violetSignal"
                    value={loginPassword}
                    onChange={(event) => onLoginPasswordChange(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                {mfaChallenge ? (
                  <label className="block text-sm text-slate-300">
                    Authenticator code
                    <input
                      data-testid="login-mfa-code"
                      className="mt-2 w-full rounded-md border border-violet-400/60 bg-surface px-3 py-3 font-mono text-white outline-none focus:border-violetSignal"
                      value={loginMfaCode}
                      onChange={(event) => onLoginMfaCodeChange(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                    />
                  </label>
                ) : null}
                <button
                  data-testid="login-submit"
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-violetSignal px-4 py-3 font-medium text-white transition hover:bg-violet-500 disabled:opacity-60"
                >
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  {submitting ? "Signing in…" : "Enter Platform"}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
              {notice ? (
                <p
                  data-testid="auth-notice"
                  className="mt-4 rounded-md border border-line bg-surface px-3 py-2 text-sm text-slate-200"
                >
                  {notice}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="border-t border-line/60 bg-panel/30 px-4 py-16 md:px-8 md:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-emerald-200">Platform capabilities</p>
              <h2 className="mt-2 text-3xl font-semibold text-white">Built for controlled execution</h2>
              <p className="mt-3 text-slate-400">
                Every module is designed around risk governance, auditability, and operator visibility.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className={`rounded-lg border-l-2 ${feature.accent} border border-line bg-white/[0.03] p-5`}
                >
                  <feature.icon className="mb-3 h-5 w-5 text-slate-200" aria-hidden="true" />
                  <h3 className="font-medium text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line/60 px-4 py-16 md:px-8 md:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-violet-300">Getting started</p>
              <h2 className="mt-2 text-3xl font-semibold text-white">How access works</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {steps.map((item) => (
                <div key={item.step} className="rounded-lg border border-line bg-panel/50 p-5">
                  <p className="font-mono text-sm text-emerald-300">{item.step}</p>
                  <h3 className="mt-2 font-medium text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/60 px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-slate-500 sm:flex-row">
          <p>QuantCore AI Trading Platform</p>
          <p>Invite-only · Admin-provisioned accounts</p>
        </div>
      </footer>
    </div>
  );
}
