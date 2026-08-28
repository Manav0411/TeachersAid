"use client";

import { useState } from "react";
import { Bell, ChevronLeft, Menu } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { SidebarFooter, SidebarNav, ToolkitPill } from "./Sidebar";

/**
 * Replaces Sidebar + TopBar together below `md` — matches the Figma
 * file's phone frames (393px, every one of them), which show one compact
 * header row (back chevron, logo, bell, avatar, hamburger) instead of the
 * desktop sidebar, with the full nav reachable behind the hamburger.
 */
export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-white px-4 md:hidden">
      <div className="flex items-center gap-2">
        <ChevronLeft className="size-5 text-muted-foreground" aria-hidden />
        <div className="flex size-7 items-center justify-center rounded-md bg-ink text-white">
          <span className="font-display text-xs font-bold">V</span>
        </div>
        <span className="font-display text-base font-bold">VedaAI</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Bell className="size-5 text-muted-foreground" />
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-danger" />
        </div>
        <div className="size-7 shrink-0 rounded-full bg-secondary" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-1 text-foreground hover:bg-secondary/60"
        >
          <Menu className="size-5" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-4 max-w-[calc(100%-2rem)] translate-y-0 gap-4 p-4 sm:max-w-xs"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <ToolkitPill />
          <SidebarNav onNavigate={() => setOpen(false)} />
          <SidebarFooter />
        </DialogContent>
      </Dialog>
    </header>
  );
}
