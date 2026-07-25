export type OfficeRole =
  | "coordinator"
  | "signal"
  | "brain"
  | "risk"
  | "broker"
  | "portfolio";

export type OfficeAgentStatus =
  | "idle"
  | "working"
  | "waiting"
  | "alert"
  | "error"
  | "offline";

export type OfficeRelatedEntity = {
  readonly type: "run" | "signal" | "order" | "position";
  readonly id: string;
};

export type OfficeAgentState = {
  readonly role: OfficeRole;
  readonly label: string;
  readonly status: OfficeAgentStatus;
  readonly activity: string;
  readonly updatedAt: string;
  readonly relatedEntity?: OfficeRelatedEntity | undefined;
  readonly detailLines: readonly string[];
};

export type OfficeTimelineEntry = {
  readonly id: string;
  readonly at: string;
  readonly role: OfficeRole;
  readonly text: string;
};

export type OfficeConnection = "live" | "polling" | "offline";

export type OfficeWorld = {
  readonly agents: Record<OfficeRole, OfficeAgentState>;
  readonly coordinatorAt: OfficeRole;
  readonly lifestyleLevel: 1 | 2 | 3 | 4 | 5;
  readonly night: boolean;
  readonly paperMode: boolean;
  readonly connection: OfficeConnection;
  readonly loading: boolean;
  readonly error: string | null;
  readonly timeline: readonly OfficeTimelineEntry[];
  readonly agentActive: boolean;
};

export const OFFICE_ROLES: readonly OfficeRole[] = [
  "coordinator",
  "signal",
  "brain",
  "risk",
  "broker",
  "portfolio"
] as const;

export const OFFICE_ROLE_LABELS: Record<OfficeRole, string> = {
  coordinator: "Coordinator",
  signal: "Market Signal",
  brain: "Brain / Strategy",
  risk: "Risk",
  broker: "Broker / Execution",
  portfolio: "Portfolio"
};

/** Desk anchors as % of the office floor (left/top). */
export const OFFICE_DESK_LAYOUT: Record<
  OfficeRole,
  { readonly left: number; readonly top: number }
> = {
  signal: { left: 14, top: 26 },
  brain: { left: 42, top: 20 },
  risk: { left: 70, top: 26 },
  broker: { left: 18, top: 58 },
  portfolio: { left: 46, top: 64 },
  coordinator: { left: 74, top: 58 }
};
