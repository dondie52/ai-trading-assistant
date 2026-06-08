import type { AuditLog } from "@trading/types";

export interface AuditSink {
  persist(log: AuditLog): Promise<void>;
}

