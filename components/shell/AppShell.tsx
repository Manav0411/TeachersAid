import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileHeader } from "./MobileHeader";

/**
 * Composes the sidebar + top bar around a screen's content. `collapsed`
 * switches the sidebar to its icon rail — used on the processing and
 * review screens, which need the extra width more than the full nav.
 * Below `md`, Sidebar and TopBar both hide and MobileHeader takes over
 * as a single compact header row, matching the Figma file's phone frames.
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
    <div className="flex h-dvh min-h-0 w-full flex-col md:flex-row">
      <Sidebar collapsed={collapsed} />
      <MobileHeader />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar crumb={crumb} />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
