import { Youtube, FileText, Mic } from "lucide-react";

export function SourceBadge({ type }: { type: string }) {
  if (type === "youtube") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]" data-testid="badge-source-type">
        <Youtube className="w-3 h-3" />
        Video
      </span>
    );
  }
  if (type === "podcast") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[hsl(var(--chart-5)/0.15)] text-[hsl(var(--chart-5))]" data-testid="badge-source-type">
        <Mic className="w-3 h-3" />
        Podcast
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[hsl(var(--primary)/0.12)] text-primary" data-testid="badge-source-type">
      <FileText className="w-3 h-3" />
      Article
    </span>
  );
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatRange(start: number, end: number) {
  return `${formatDuration(start)} – ${formatDuration(end)}`;
}

export function timeAgo(unix: number) {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - unix);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unix * 1000).toLocaleDateString();
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
