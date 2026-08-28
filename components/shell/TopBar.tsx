import { Bell, ChevronDown, FileText, HelpCircle, Sparkles } from "lucide-react";

/**
 * The app shell's top bar — breadcrumb, help, notifications, and the
 * signed-in teacher, echoing the wider product's chrome. Mostly static
 * (only the Exams flow beneath it is functional) except the breadcrumb's
 * back arrow, which is a real button when the screen supplies `onBack` —
 * otherwise it renders as inert decoration rather than a dead-looking
 * control. Desktop only (`md:` and up) — MobileHeader.tsx replaces this +
 * Sidebar together below that, matching the Figma file's phone frames.
 */
export function TopBar({
  crumb = "Exams",
  onBack,
}: {
  crumb?: string;
  onBack?: () => void;
}) {
  return (
    <header className="hidden h-16 shrink-0 items-center justify-between border-b border-line bg-white px-6 md:flex">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to Exams"
            className="rounded p-0.5 hover:bg-secondary/60 hover:text-foreground"
          >
            ←
          </button>
        ) : (
          <span aria-hidden>←</span>
        )}
        <FileText className="size-3.5" aria-hidden />
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
