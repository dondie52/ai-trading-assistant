"use client";

import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import type {
  AutomationMode,
  DondieAgent,
  DondieMemory,
  MarketQuote,
  OrderSide,
  OrderType,
  Portfolio,
  RiskRules,
  Signal,
  Strategy
} from "@trading/types";
import { buildOrderDraftFromSignal, clientOrderValidation, type OrderDraft } from "../../lib/order-draft";
import { formatCurrency } from "../../lib/format";
import { Panel, StatusPill } from "../ui/primitives";
import { RiskPassedBanner, RiskResultBanner } from "./risk-result";
import type { StructuredRiskResult } from "../../lib/risk-display";

export function AITradeCopilot({
  symbol,
  onSymbolChange,
  timeframeLabel,
  quote,
  quoteLoading,
  strategies,
  selectedStrategyId,
  onStrategyChange,
  latestSignal,
  portfolio,
  risk,
  automationMode,
  brokerConnected,
  analyzing,
  submitting,
  riskResult,
  riskPassed,
  onAnalyze,
  onApprovePaperTrade,
  onApplySuggestedQuantity,
  draftOverride,
  onDraftChange,
  agent,
  memories,
  onRunAgent,
  agentBusy
}: {
  readonly symbol: string;
  readonly onSymbolChange: (symbol: string) => void;
  readonly timeframeLabel: string;
  readonly quote?: MarketQuote | null;
  readonly quoteLoading: boolean;
  readonly strategies: readonly Strategy[];
  readonly selectedStrategyId: string;
  readonly onStrategyChange: (id: string) => void;
  readonly latestSignal?: Signal | null;
  readonly portfolio?: Portfolio | null;
  readonly risk?: RiskRules | null;
  readonly automationMode: AutomationMode;
  readonly brokerConnected: boolean;
  readonly analyzing: boolean;
  readonly submitting: boolean;
  readonly riskResult: StructuredRiskResult | null;
  readonly riskPassed: boolean;
  readonly onAnalyze: () => void;
  readonly onApprovePaperTrade: (draft: OrderDraft) => void;
  readonly onApplySuggestedQuantity: (quantity: number) => void;
  readonly draftOverride?: OrderDraft | null;
  readonly onDraftChange?: (draft: OrderDraft) => void;
  readonly agent?: DondieAgent | null;
  readonly memories?: readonly DondieMemory[];
  readonly onRunAgent?: () => void;
  readonly agentBusy?: boolean;
}): ReactElement {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editing, setEditing] = useState(false);
  const handsOff = automationMode === "AUTOPILOT";

  const autoDraft = useMemo(() => {
    if (!latestSignal || latestSignal.symbol !== symbol.toUpperCase()) {
      return null;
    }
    return buildOrderDraftFromSignal({
      signal: latestSignal,
      quote: quote ?? null,
      equity: portfolio?.portfolioValue ?? 0,
      risk: risk ?? null
    });
  }, [latestSignal, portfolio?.portfolioValue, quote, risk, symbol]);

  const draft = draftOverride ?? autoDraft;
  const inlineErrors = draft
    ? clientOrderValidation({
        ...draft,
        brokerConnected,
        ...(risk?.maxPositionSizePercent !== undefined
          ? { maxPositionSizePercent: risk.maxPositionSizePercent }
          : {}),
        ...(risk?.maxRiskPerTradePercent !== undefined
          ? { maxRiskPerTradePercent: risk.maxRiskPerTradePercent }
          : {}),
        ...(portfolio?.portfolioValue !== undefined ? { equity: portfolio.portfolioValue } : {})
      })
    : [];

  const canApprove =
    Boolean(draft) &&
    draft?.priceAvailable &&
    draft.signalType !== "HOLD" &&
    inlineErrors.length === 0 &&
    !submitting &&
    automationMode !== "MANUAL";

  if (handsOff) {
    const universe =
      agent?.symbolUniverse && agent.symbolUniverse.length > 0
        ? agent.symbolUniverse
        : ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "SPY", "QQQ"];
    const recent = (memories ?? []).slice(0, 5);
    const strategyName =
      strategies.find((strategy) => strategy.id === (agent?.strategyId ?? selectedStrategyId))?.name ??
      "Agent managed";

    return (
      <Panel
        title="AI Trade Copilot"
        icon={<Sparkles className="h-5 w-5 text-violet-300" aria-hidden="true" />}
        action={<StatusPill label="AUTOPILOT" tone="emerald" />}
      >
        <div className="space-y-4" data-testid="ai-trade-copilot">
          <div
            className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-3 py-3 text-sm text-emerald-50"
            data-testid="hands-off-trade-status"
          >
            <p className="font-medium">You do not pick symbols or strategies.</p>
            <p className="mt-1 text-emerald-100/80">
              Dondie scans its universe, chooses setups, and places orders in your Alpaca paper account
              on AUTOPILOT. Fund and withdraw only in Alpaca.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div className="rounded-lg border border-line bg-surface px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">Strategy</p>
              <p className="mt-1 text-white">{strategyName}</p>
            </div>
            <div className="rounded-lg border border-line bg-surface px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">Agent status</p>
              <p className="mt-1 text-white">{agent?.status ?? "Not started"}</p>
            </div>
            <div className="rounded-lg border border-line bg-surface px-3 py-2 sm:col-span-2">
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">
                Last server scan
              </p>
              <p className="mt-1 text-white" data-testid="agent-last-run-at">
                {agent?.lastRunAt
                  ? new Date(agent.lastRunAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })
                  : "Waiting for first scheduled scan"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Runs on the server — closing this tab does not stop AUTOPILOT.
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-slate-500">
              Symbols Dondie watches
            </p>
            <div className="flex flex-wrap gap-2" data-testid="agent-symbol-universe">
              {universe.map((ticker) => (
                <span
                  key={ticker}
                  className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-slate-200"
                >
                  {ticker}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-3 text-sm text-slate-300">
            <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">Recent agent decisions</p>
            {recent.length === 0 ? (
              <p className="mt-2 text-slate-400" data-testid="latest-signal">
                No scans yet — the server scheduler runs on its own. Optional: force a scan below.
              </p>
            ) : (
              <ul className="mt-2 space-y-2" data-testid="latest-signal">
                {recent.map((memory) => (
                  <li key={memory.id} className="text-slate-200">
                    {memory.summary}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            data-testid="generate-signal"
            disabled={!onRunAgent || agentBusy || agent?.status !== "ACTIVE"}
            onClick={() => onRunAgent?.()}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm font-medium text-slate-100 disabled:opacity-40"
          >
            {agentBusy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Bot className="h-4 w-4" aria-hidden="true" />
            )}
            Force scan now (optional)
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="AI Trade Copilot"
      icon={<Sparkles className="h-5 w-5 text-violet-300" aria-hidden="true" />}
      action={<StatusPill label={automationMode} tone="violet" />}
    >
      <div className="space-y-4" data-testid="ai-trade-copilot">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm text-slate-300">
            Symbol
            <input
              data-testid="signal-symbol"
              aria-label="Signal symbol"
              className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-3 font-mono text-sm text-white outline-none focus:border-violetSignal"
              value={symbol}
              onChange={(event) => onSymbolChange(event.target.value.toUpperCase())}
            />
          </label>
          <label className="text-sm text-slate-300">
            Strategy
            <select
              data-testid="copilot-strategy"
              className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-3 text-sm text-white"
              value={selectedStrategyId}
              onChange={(event) => onStrategyChange(event.target.value)}
            >
              {strategies.length === 0 ? <option value="">Create a strategy first</option> : null}
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name} ({strategy.status})
                </option>
              ))}
            </select>
          </label>
          <button
            data-testid="generate-signal"
            type="button"
            onClick={onAnalyze}
            disabled={analyzing || !selectedStrategyId}
            className="mt-7 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violetSignal px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {analyzing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            Analyse market
          </button>
        </div>

        <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-3 text-sm text-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Live price · {timeframeLabel}
            </span>
            <span data-testid="copilot-live-price" className="font-mono text-white">
              {quoteLoading
                ? "Loading…"
                : quote?.source === "UNAVAILABLE" || !quote?.price
                  ? "Unavailable"
                  : formatCurrency(quote.price)}
            </span>
          </div>
          {quote?.source === "UNAVAILABLE" || (!quoteLoading && !quote?.price) ? (
            <p className="mt-2 text-xs text-amber-200">Market data unavailable — execution disabled.</p>
          ) : null}
        </div>

        <div data-testid="latest-signal" className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-3 text-sm text-violet-50">
          {latestSignal
            ? `${latestSignal.signalType} ${latestSignal.symbol} confidence ${latestSignal.confidenceScore}%`
            : "No signal yet — run market analysis to continue."}
        </div>

        {draft ? (
          <div className="space-y-3" data-testid="signal-analysis">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <AnalysisStat label="Action" value={draft.signalType} />
              <AnalysisStat label="Confidence" value={`${draft.confidence}%`} />
              <AnalysisStat label="Entry" value={draft.priceAvailable ? formatCurrency(draft.price) : "—"} />
              <AnalysisStat label="Position size" value={draft.quantity ? String(draft.quantity) : "—"} />
              <AnalysisStat label="Stop loss" value={draft.priceAvailable ? formatCurrency(draft.stopLoss) : "—"} />
              <AnalysisStat label="Take profit" value={draft.priceAvailable ? formatCurrency(draft.takeProfit) : "—"} />
              <AnalysisStat label="Risk / reward" value={draft.riskRewardRatio ? String(draft.riskRewardRatio) : "—"} />
              <AnalysisStat label="Capital required" value={draft.priceAvailable ? formatCurrency(draft.estimatedValue) : "—"} />
            </div>
            <p className="text-sm text-slate-300">{draft.reasoning}</p>
            <ul className="space-y-1 text-xs text-amber-100/90">
              {draft.risks.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <OrderPreview
          draft={draft}
          cashBalance={portfolio?.cashBalance ?? 0}
          editing={editing}
          onToggleEdit={() => setEditing((value) => !value)}
          onChange={(next) => onDraftChange?.(next)}
          inlineErrors={inlineErrors}
        />

        {riskPassed ? <RiskPassedBanner /> : null}
        <RiskResultBanner result={riskResult} onApplySuggestedQuantity={onApplySuggestedQuantity} />

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            data-testid="approve-paper-trade"
            type="button"
            disabled={!canApprove && automationMode !== "MANUAL"}
            onClick={() => draft && onApprovePaperTrade(draft)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-40"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {automationMode === "MANUAL"
              ? "Use advanced order ticket"
              : submitting
                ? "Submitting…"
                : "Approve paper trade"}
          </button>
          <button
            type="button"
            data-testid="toggle-advanced-order"
            onClick={() => setShowAdvanced((value) => !value)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-slate-200"
          >
            {showAdvanced ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            Advanced manual order
          </button>
        </div>

        {showAdvanced ? (
          <p className="text-xs text-slate-500">
            Advanced fields are available in the compact order ticket below. AI-assisted trades auto-fill quantity, stops, and targets.
          </p>
        ) : null}

        {automationMode === "MANUAL" ? (
          <p className="flex items-start gap-2 text-xs text-slate-400">
            <Bot className="mt-0.5 h-3.5 w-3.5" aria-hidden="true" />
            Manual mode: analysis only. Submit orders yourself from the order ticket.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function AnalysisStat({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-sm text-white">{value}</p>
    </div>
  );
}

function OrderPreview({
  draft,
  cashBalance,
  editing,
  onToggleEdit,
  onChange,
  inlineErrors
}: {
  readonly draft: OrderDraft | null;
  readonly cashBalance: number;
  readonly editing: boolean;
  readonly onToggleEdit: () => void;
  readonly onChange: (draft: OrderDraft) => void;
  readonly inlineErrors: readonly string[];
}): ReactElement {
  if (!draft) {
    return (
      <div data-testid="order-preview" className="rounded-xl border border-dashed border-line px-3 py-4 text-sm text-slate-500">
        Order preview appears after analysis.
      </div>
    );
  }

  const buyingPowerAfter = cashBalance - (draft.side === "BUY" ? draft.estimatedValue : 0);

  return (
    <div data-testid="order-preview" className="space-y-3 rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Order preview</p>
        <button
          type="button"
          data-testid="edit-order"
          onClick={onToggleEdit}
          className="rounded-md border border-line bg-surface px-3 py-2 text-xs text-slate-200"
        >
          {editing ? "Done" : "Edit order"}
        </button>
      </div>

      {!editing ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <PreviewRow label="Symbol" value={draft.symbol} />
          <PreviewRow label="Side" value={draft.side} />
          <PreviewRow label="Type" value={draft.orderType} />
          <PreviewRow label="Quantity" value={String(draft.quantity)} />
          <PreviewRow label="Est. value" value={formatCurrency(draft.estimatedValue)} />
          <PreviewRow label="Entry" value={formatCurrency(draft.price)} />
          <PreviewRow label="Stop loss" value={formatCurrency(draft.stopLoss)} />
          <PreviewRow label="Take profit" value={formatCurrency(draft.takeProfit)} />
          <PreviewRow label="Max loss" value={formatCurrency(draft.maxExpectedLoss)} />
          <PreviewRow label="R:R" value={String(draft.riskRewardRatio)} />
          <PreviewRow label="Buying power after" value={formatCurrency(buyingPowerAfter)} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <DraftNumber
            label="Quantity"
            value={draft.quantity}
            onChange={(quantity) =>
              onChange({
                ...draft,
                quantity,
                estimatedValue: Number((draft.price * quantity).toFixed(2)),
                maxExpectedLoss: Number((Math.abs(draft.price - draft.stopLoss) * quantity).toFixed(2))
              })
            }
          />
          <DraftNumber
            label="Entry price"
            value={draft.price}
            onChange={(price) => onChange({ ...draft, price })}
          />
          <DraftNumber
            label="Stop loss"
            value={draft.stopLoss}
            onChange={(stopLoss) => onChange({ ...draft, stopLoss })}
          />
          <DraftNumber
            label="Take profit"
            value={draft.takeProfit}
            onChange={(takeProfit) => onChange({ ...draft, takeProfit })}
          />
          <label className="text-sm text-slate-300">
            Side
            <select
              className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-white"
              value={draft.side}
              onChange={(event) => onChange({ ...draft, side: event.target.value as OrderSide })}
            >
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Order type
            <select
              className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-white"
              value={draft.orderType}
              onChange={(event) => onChange({ ...draft, orderType: event.target.value as OrderType })}
            >
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
              <option value="STOP">Stop</option>
            </select>
          </label>
        </div>
      )}

      {inlineErrors.length > 0 ? (
        <ul data-testid="order-inline-errors" className="space-y-1 text-xs text-rose-200">
          {inlineErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-emerald-200">Inline checks look good. Server risk remains final authority.</p>
      )}
    </div>
  );
}

function PreviewRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-black/20 px-2 py-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="font-mono text-xs text-white">{value}</span>
    </div>
  );
}

function DraftNumber({
  label,
  value,
  onChange
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactElement {
  return (
    <label className="text-sm text-slate-300">
      {label}
      <input
        type="number"
        step="any"
        className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-white"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
