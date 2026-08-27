"use client";

import {
  ClipboardList,
  GraduationCap,
  History,
  LayoutGrid,
  Presentation,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: LayoutGrid },
  { label: "My Classroom", icon: Presentation },
  { label: "Assignments", icon: ClipboardList },
  { label: "Exams", icon: GraduationCap, active: true },
  { label: "My Library", icon: History },
];

/**
 * The app shell's left sidebar — VedaAI product chrome matching the design
 * system. Only "Exams" is functional; the rest is chrome establishing this
 * as one flow inside a larger product.
 */
export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col justify-between border-r border-line bg-white p-4",
        collapsed ? "w-[76px] items-center" : "w-[280px]"
      )}
    >
      <div className={cn("flex flex-col gap-6", collapsed && "items-center")}>
        <div
          className={cn(
            "flex items-center gap-2 px-1",
            collapsed && "justify-center px-0"
          )}
        >
          <div className="flex size-8 items-center justify-center rounded-md bg-ink text-white">
            <span className="font-display text-sm font-bold">V</span>
          </div>
          {!collapsed && (
            <span className="font-display text-lg font-bold">VedaAI</span>
          )}
        </div>

        <div
          className={cn(
            "flex items-center gap-2 rounded-pill border-2 border-transparent px-4 py-2 text-white",
            collapsed && "w-11 justify-center px-0 py-2.5"
          )}
          style={{
            // border-image (the previous approach here) doesn't respect
            // border-radius, so this pill rendered as flat black with no
            // visible gradient ring at all. The two-layer background-clip
            // technique below does follow the radius: one layer painted
            // to the padding box (the ink fill), one to the border box
            // (the gradient), with a transparent border as the gap
            // between them.
            backgroundImage:
              "linear-gradient(var(--color-ink), var(--color-ink)), linear-gradient(90deg,#ff7950,#c0350a)",
            backgroundOrigin: "border-box",
            backgroundClip: "padding-box, border-box",
          }}
        >
          <Sparkles className="size-4 shrink-0 text-brand-from" />
          {!collapsed && (
            <span className="text-sm font-medium whitespace-nowrap">
              AI Teacher&apos;s Toolkit
            </span>
          )}
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors",
                active
                  ? "bg-secondary font-medium text-foreground"
                  : "hover:bg-secondary/60",
                collapsed && "justify-center px-0"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div
        className={cn(
          "flex flex-col gap-3",
          collapsed && "items-center"
        )}
      >
        <button
          type="button"
          title={collapsed ? "Settings" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60",
            collapsed && "justify-center px-0"
          )}
        >
          <Settings className="size-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>

        {!collapsed && (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-secondary/40 p-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
              <GraduationCap className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Delhi Public School</p>
              <p className="truncate text-xs text-muted-foreground">
                Bokaro Steel City
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
