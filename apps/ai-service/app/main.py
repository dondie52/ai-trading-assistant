from __future__ import annotations

import math
import os
from typing import Any, Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

SignalType = Literal["BUY", "SELL", "HOLD"]


class Candle(BaseModel):
    symbol: str
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class SignalRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    candles: list[Candle] = Field(min_length=2)


class SignalResponse(BaseModel):
    symbol: str
    signalType: SignalType
    confidenceScore: int = Field(ge=0, le=100)
    modelVersion: str
    features: dict[str, Any]


app = FastAPI(
    title="AI Trading Platform Signal Service",
    version="1.0.0",
    description="FastAPI MVP signal service with model-version metadata.",
)


def ema(values: list[float], period: int) -> float | None:
    if not values or period <= 0:
        return None
    multiplier = 2 / (period + 1)
    previous = values[0]
    for value in values:
        previous = value if value == values[0] else value * multiplier + previous * (1 - multiplier)
    return round(previous, 4)


def rsi(values: list[float], period: int = 14) -> float | None:
    if len(values) <= period:
        return None
    gains = 0.0
    losses = 0.0
    for index in range(len(values) - period, len(values)):
        change = values[index] - values[index - 1]
        if change >= 0:
            gains += change
        else:
            losses += abs(change)
    if losses == 0:
        return 100.0
    relative_strength = (gains / period) / (losses / period)
    return round(100 - 100 / (1 + relative_strength), 2)


def sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return round(sum(values[-period:]) / period, 4)


def macd_histogram(values: list[float]) -> float:
    fast = ema(values, 12) or values[-1]
    slow = ema(values, 26) or values[-1]
    return round(fast - slow, 4)


def clamp_confidence(value: float) -> int:
    return max(0, min(100, round(value)))


# Gold-specific rule tuning, mirrored from @trading/shared's gold-playbook.ts. Gold trends more
# persistently than typical equities, so trend/momentum confirmation is weighted higher and RSI
# overbought/oversold bounds are widened rather than fading a strong trend early. Elevated
# volatility (relative to price) flags event-driven moves (NFP/CPI/FOMC) and tempers confidence.
GOLD_SYMBOLS = {"GLD", "IAU", "SGOL", "GLDM", "XAUUSD", "XAU/USD", "XAU", "GOLD"}
GOLD_TREND_WEIGHT = 24
GOLD_COUNTER_TREND_WEIGHT = -10
GOLD_RSI_OVERBOUGHT = 78
GOLD_RSI_OVERSOLD = 22
GOLD_VOLATILITY_PERCENT_THRESHOLD = 2.5
GOLD_VOLATILITY_PENALTY = 6


def is_gold_symbol(symbol: str) -> bool:
    return symbol.strip().upper() in GOLD_SYMBOLS


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "modelVersion": os.getenv("MODEL_VERSION", "mvp-baseline-1.0.0")}


@app.post("/signals/generate", response_model=SignalResponse)
def generate_signal(payload: SignalRequest) -> SignalResponse:
    closes = [candle.close for candle in payload.candles]
    latest_close = closes[-1]
    previous_close = closes[-2]
    momentum = latest_close - previous_close
    ema20 = ema(closes, 20)
    rsi14 = rsi(closes)
    histogram = macd_histogram(closes)
    above_trend = latest_close > ema20 if ema20 is not None else False
    gold_aware = is_gold_symbol(payload.symbol)

    rsi_overbought = GOLD_RSI_OVERBOUGHT if gold_aware else 72
    rsi_oversold = GOLD_RSI_OVERSOLD if gold_aware else 28

    signal_type: SignalType = "HOLD"
    if (above_trend and momentum > 0 and (rsi14 or 50) < rsi_overbought) or histogram > 0.15:
        signal_type = "BUY"
    elif ((not above_trend) and momentum < 0 and (rsi14 or 50) > rsi_oversold) or histogram < -0.15:
        signal_type = "SELL"

    if gold_aware:
        trend_score = GOLD_TREND_WEIGHT if above_trend else GOLD_COUNTER_TREND_WEIGHT
    else:
        trend_score = 18 if above_trend else -8
    momentum_score = max(-12, min(12, momentum * 8))
    rsi_score = (70 - (rsi14 or 50)) if signal_type == "BUY" else ((rsi14 or 50) - 30)

    volatility = round(math.sqrt(sum((value - latest_close) ** 2 for value in closes[-20:]) / min(20, len(closes))), 4)
    volatility_percent = round((volatility / latest_close) * 100, 4) if latest_close else None
    volatility_penalty = (
        GOLD_VOLATILITY_PENALTY
        if gold_aware and volatility_percent is not None and volatility_percent > GOLD_VOLATILITY_PERCENT_THRESHOLD
        else 0
    )

    confidence = (
        clamp_confidence(48 + abs(momentum_score) - volatility_penalty)
        if signal_type == "HOLD"
        else clamp_confidence(58 + trend_score + momentum_score + max(0, rsi_score / 3) - volatility_penalty)
    )

    return SignalResponse(
        symbol=payload.symbol.upper(),
        signalType=signal_type,
        confidenceScore=confidence,
        modelVersion=os.getenv("MODEL_VERSION", "mvp-baseline-1.0.0"),
        features={
            "latestClose": latest_close,
            "previousClose": previous_close,
            "momentum": momentum,
            "sma20": sma(closes, 20),
            "ema20": ema20,
            "rsi14": rsi14,
            "macdHistogram": histogram,
            "volatility": volatility,
            "volatilityPercent": volatility_percent,
            "goldAware": gold_aware,
        },
    )

