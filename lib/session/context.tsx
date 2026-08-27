"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { Session } from "@/lib/types";
import { emptySession, sessionReducer, type SessionAction } from "./reducer";

type SessionContextValue = {
  session: Session;
  dispatch: React.Dispatch<SessionAction>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(
    sessionReducer,
    undefined,
    () => emptySession(typeof crypto !== "undefined" ? crypto.randomUUID() : "session")
  );

  return (
    <SessionContext.Provider value={{ session, dispatch }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
