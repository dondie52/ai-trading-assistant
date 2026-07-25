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

/** Desk anchors as % of the office floor (left/top). Pipeline rings a central table. */
export const OFFICE_DESK_LAYOUT: Record<
  OfficeRole,
  { readonly left: number; readonly top: number }
> = {
  signal: { left: 16, top: 24 },
  brain: { left: 50, top: 16 },
  risk: { left: 84, top: 24 },
  broker: { left: 20, top: 72 },
  portfolio: { left: 50, top: 80 },
  coordinator: { left: 84, top: 72 }
};

export const OFFICE_MEETING = { left: 50, top: 48 } as const;

/** Flow path waypoints for Signal → Brain → Risk → Broker → Portfolio. */
export const OFFICE_FLOW_PATH: readonly { readonly left: number; readonly top: number }[] = [
  { left: 16, top: 24 },
  { left: 50, top: 16 },
  { left: 84, top: 24 },
  { left: 84, top: 48 },
  { left: 50, top: 48 },
  { left: 20, top: 72 },
  { left: 50, top: 80 }
];
