import type { PageAsset } from "@/lib/types";

export function ThumbnailStrip({ pages }: { pages: PageAsset[] }) {
  if (pages.length === 0) return null;
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {pages.map((page) => (
        // eslint-disable-next-line @next/next/no-img-element -- data URLs, not next/image candidates
        <img
          key={page.index}
          src={page.dataUrl}
          alt={`Page ${page.index + 1}`}
          className="h-16 w-12 shrink-0 rounded-md border border-line object-cover"
        />
      ))}
    </div>
  );
}
