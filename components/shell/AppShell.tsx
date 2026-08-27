import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/**
 * Composes the sidebar + top bar around a screen's content. `collapsed`
 * switches the sidebar to its icon rail — used on the processing and
 * review screens per plan §Design ("collapses to an icon rail on working
 * screens").
 */
export function AppShell({
  children,
  collapsed = false,
  crumb,
}: {
  children: ReactNode;
  collapsed?: boolean;
  crumb?: string;
}) {
  return (
    <div className="flex h-dvh min-h-0 w-full">
      <Sidebar collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar crumb={crumb} />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
