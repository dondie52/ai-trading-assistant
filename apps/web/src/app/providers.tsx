"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { AuthSessionBridge } from "../components/auth-session-bridge";
import { isRetryableTransportError } from "../lib/api";

export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // apiFetch already retries Render cold-start / gateway blips.
            retry: (failureCount, error) => {
              if (isRetryableTransportError(error)) {
                return false;
              }
              return failureCount < 2;
            }
          },
          mutations: {
            retry: false
          }
        }
      })
  );
  return (
    <QueryClientProvider client={client}>
      <AuthSessionBridge />
      {children}
    </QueryClientProvider>
  );
}
