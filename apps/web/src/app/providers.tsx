"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { AuthSessionBridge } from "../components/auth-session-bridge";

export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <AuthSessionBridge />
      {children}
    </QueryClientProvider>
  );
}
