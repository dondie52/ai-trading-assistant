type LogLines = readonly string[];

const write = (lines: LogLines): void => {
  // Structured multi-line logs for the signal → execution → portfolio pipeline.
  console.log(lines.join("\n"));
};

export const logSignal = (input: {
  readonly symbol: string;
  readonly action: string;
  readonly confidence: number;
}): void => {
  write([
    "[Signal]",
    `symbol=${input.symbol}`,
    `action=${input.action}`,
    `confidence=${input.confidence}`
  ]);
};

export const logExecutionAttempting = (input: {
  readonly symbol: string;
  readonly side: string;
  readonly quantity?: number;
}): void => {
  write([
    "[Execution]",
    "attempting order...",
    `symbol=${input.symbol}`,
    `side=${input.side}`,
    ...(input.quantity === undefined ? [] : [`quantity=${input.quantity}`])
  ]);
};

export const logExecutionSubmitted = (input: {
  readonly orderId: string;
  readonly broker: string;
  readonly status: string;
}): void => {
  write([
    "[Execution]",
    "order submitted",
    `orderId=${input.orderId}`,
    `broker=${input.broker}`,
    `status=${input.status}`
  ]);
};

export const logExecutionRejected = (reason: string): void => {
  write(["[Execution]", "order rejected:", `reason=${reason}`]);
};

export const logTradeSkipped = (reason: string): void => {
  write(["[Execution]", "order rejected:", `reason=${reason}`]);
};

export const logPositionCreated = (input: {
  readonly symbol: string;
  readonly quantity: number;
  readonly averagePrice: number;
}): void => {
  write([
    "[Portfolio]",
    "position created",
    `symbol=${input.symbol}`,
    `quantity=${input.quantity}`,
    `averagePrice=${input.averagePrice}`
  ]);
};
