import { Bell, ChevronDown, HelpCircle, Sparkles } from "lucide-react";

/**
 * The app shell's top bar — breadcrumb, help, notifications, and the
 * signed-in teacher, echoing the wider product's chrome. Static; only the
 * Exams flow beneath it is functional.
 */
export function TopBar({ crumb = "Exams" }: { crumb?: string }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden>←</span>
        <span className="font-medium text-foreground">{crumb}</span>
      </div>
      <div className="flex items-center gap-4">
        <HelpCircle className="size-5 text-muted-foreground" />
        <div className="relative">
          <Bell className="size-5 text-muted-foreground" />
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-danger" />
        </div>
        <Sparkles className="size-5 text-brand-from" />
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full bg-secondary" />
          <span className="text-sm font-medium">Madhur Rastogi</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
      </div>
    </header>
  );
}
