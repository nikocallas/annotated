import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AnnotationWithRelations, User } from "@shared/schema";
import { AppLayout } from "@/components/AppLayout";
import { FeedCard } from "@/components/FeedCard";
import { FollowButton } from "@/components/FollowButton";
import { OAuthSignIn } from "@/components/OAuthSignIn";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  Video,
  FileText,
  Mic,
  LayoutGrid,
  Eye,
  ArrowUpDown,
  Sparkles,
  Users,
  Bookmark as BookmarkIcon,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/queryClient";

type SortKey = "latest" | "most-viewed" | "most-popular" | "most-commented";
type FilterKey = "all" | "youtube" | "article" | "podcast";
type FeedTab = "for-you" | "following" | "latest" | "bookmarks";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "latest", label: "Latest" },
  { key: "most-viewed", label: "Most Viewed" },
  { key: "most-popular", label: "Most Popular" },
  { key: "most-commented", label: "Most Commented" },
];

const SORT_KEYS = SORT_OPTIONS.map((o) => o.key);
const isSortKey = (v: string | null | undefined): v is SortKey =>
  !!v && (SORT_KEYS as string[]).includes(v);

const FILTER_OPTIONS: { key: FilterKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "youtube", label: "Videos", icon: Video },
  { key: "article", label: "Readings", icon: FileText },
  { key: "podcast", label: "Podcasts", icon: Mic },
];

const FEED_TABS: { key: FeedTab; label: string; icon: typeof Sparkles; requiresAuth: boolean }[] = [
  { key: "for-you", label: "For You", icon: Sparkles, requiresAuth: true },
  { key: "following", label: "Following", icon: Users, requiresAuth: true },
  { key: "latest", label: "Latest", icon: Clock, requiresAuth: false },
  { key: "bookmarks", label: "Bookmarks", icon: BookmarkIcon, requiresAuth: true },
];

function readInitialSort(): SortKey {
  if (typeof window === "undefined") return "latest";
  const search = window.location.search;
  const hash = window.location.hash;
  const fromSearch =
    new URLSearchParams(search).get("tab") || new URLSearchParams(search).get("sort");
  const fromHash =
    new URLSearchParams(hash.split("?")[1] ?? "").get("tab") ||
    new URLSearchParams(hash.split("?")[1] ?? "").get("sort");
  const v = fromSearch || fromHash;
  return isSortKey(v) ? v : "latest";
}

// Deterministic popularity score: comments are the strongest engagement
// signal we collect server-side. Bookmarks and shares aren't surfaced on the
// feed payload yet, so we fold views in as a tiebreaker (a clip with twice
// the views of another and the same comment count is meaningfully more
// popular). Formula: comments * 100 + log2(views + 1). Pure function of the
// existing AnnotationWithRelations fields; no extra fetch required.
function popularityScore(a: AnnotationWithRelations): number {
  const comments = a.commentCount ?? 0;
  const views = a.viewCount ?? 0;
  return comments * 100 + Math.log2(views + 1);
}

export default function FeedPage() {
  const { user } = useAuth();
  const [sort, setSort] = useState<SortKey>(readInitialSort);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [tab, setTab] = useState<FeedTab>("latest");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const baseHash = "#/";
    const target = sort === "latest" ? baseHash : `${baseHash}?sort=${sort}`;
    if (window.location.hash !== target) {
      const path = window.location.pathname;
      const search = window.location.search;
      window.history.replaceState(null, "", `${path}${search}${target}`);
    }
  }, [sort]);

  const handleTabSelect = (next: FeedTab) => {
    setTab(next);
  };

  const activeTabMeta = FEED_TABS.find((t) => t.key === tab);
  const tabLocked = !!activeTabMeta?.requiresAuth && !user;

  return (
    <AppLayout feedHeader>
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-6 lg:py-8 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_300px] gap-6 lg:gap-8">
        {/* Left sidebar */}
        <LeftSidebar tab={tab} onTabChange={handleTabSelect} />

        {/* Center feed */}
        <div className="min-w-0">
          {!tabLocked && (
            <TopFilters
              filter={filter}
              onFilterChange={setFilter}
              sort={sort}
              onSortChange={setSort}
            />
          )}
          <div className={tabLocked ? "" : "mt-5"}>
            {tabLocked ? (
              <LockedTabPrompt tab={tab} />
            ) : (
              <FeedList tab={tab} sort={sort} filter={filter} />
            )}
          </div>
        </div>

        {/* Right rail */}
        <aside className="space-y-5 order-last lg:block">
          <PeopleWorthFollowing />
          <MostViewedClip />
          {!user && (
            <OAuthSignIn
              compact
              title="Sign in to follow"
              description="Use X or Google to follow creators and unlock your Following feed."
            />
          )}
        </aside>
      </div>
    </AppLayout>
  );
}

// ---------- Left sidebar -----------------------------------------------------

function LeftSidebar({
  tab,
  onTabChange,
}: {
  tab: FeedTab;
  onTabChange: (t: FeedTab) => void;
}) {
  return (
    <aside className="hidden lg:block">
      <nav className="sticky top-20 space-y-1" aria-label="Feed navigation">
        {FEED_TABS.map((opt) => {
          const Icon = opt.icon;
          const active = tab === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onTabChange(opt.key)}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium hover-elevate ${
                active
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground"
              }`}
              aria-current={active ? "page" : undefined}
              data-testid={`sidebar-tab-${opt.key}`}
            >
              <Icon className="w-4 h-4" />
              {opt.label}
            </button>
          );
        })}
        <div className="pt-4 mt-4 border-t border-card-border">
          <div className="rounded-lg border border-card-border bg-card p-4">
            <div className="text-sm font-semibold mb-1">Invite your friends</div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              Great conversations start with great company.
            </p>
            <Link href="/invite">
              <Button size="sm" className="w-full" data-testid="button-invite-annotated">
                Invite to Annotated
              </Button>
            </Link>
          </div>
        </div>
      </nav>
    </aside>
  );
}

// ---------- Top filter chips + sort dropdown --------------------------------

function TopFilters({
  filter,
  onFilterChange,
  sort,
  onSortChange,
}: {
  filter: FilterKey;
  onFilterChange: (f: FilterKey) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="feed-top-filters"
      role="group"
      aria-label="Filter feed by content type"
    >
      {FILTER_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = filter === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onFilterChange(opt.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium hover-elevate ${
              active
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground border-card-border"
            }`}
            aria-pressed={active}
            data-testid={`chip-filter-${opt.key}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {opt.label}
          </button>
        );
      })}

      <div className="ml-auto">
        <Select value={sort} onValueChange={(v) => onSortChange(v as SortKey)}>
          <SelectTrigger
            aria-label="Sort feed"
            data-testid="select-feed-sort"
            className="rounded-full border border-card-border bg-card px-4 py-1.5 h-auto text-sm font-medium hover-elevate w-auto gap-2 whitespace-nowrap [&>span]:line-clamp-none [&>span]:whitespace-nowrap"
          >
            <ArrowUpDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" className="rounded-xl">
            {SORT_OPTIONS.map((opt) => (
              <SelectItem
                key={opt.key}
                value={opt.key}
                className="rounded-md text-sm"
                data-testid={`select-feed-sort-option-${opt.key}`}
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ---------- Feed list (driven by sort + filter) ----------------------------

function applyTypeFilter(rows: AnnotationWithRelations[], filter: FilterKey) {
  if (filter === "all") return rows;
  return rows.filter((a) => a.sourceType === filter);
}

function FeedList({
  tab,
  sort,
  filter,
}: {
  tab: FeedTab;
  sort: SortKey;
  filter: FilterKey;
}) {
  const { user } = useAuth();

  // Different tabs hit different endpoints; sort + filter still apply
  // client-side after fetch.
  const queryDescriptor = useMemo<{
    queryKey: readonly unknown[];
    fetcher: () => Promise<AnnotationWithRelations[]>;
    enabled: boolean;
  }>(() => {
    const viewerKey = user?.id ?? "";
    switch (tab) {
      case "following":
        return {
          queryKey: ["/api/feed", { followerOf: user?.id ?? "", viewer: viewerKey }],
          fetcher: async () => {
            if (!user) return [];
            const res = await apiFetch("/api/feed?followerOf=1");
            return res.json();
          },
          enabled: !!user,
        };
      case "bookmarks":
        return {
          queryKey: ["/api/bookmarks", { userId: user?.id ?? "" }],
          fetcher: async () => {
            if (!user) return [];
            const res = await apiFetch("/api/bookmarks");
            return res.json();
          },
          enabled: !!user,
        };
      case "for-you":
      case "latest":
      default:
        return {
          queryKey: ["/api/feed", { shuffle: 1, viewer: viewerKey }],
          fetcher: async () => {
            const res = await apiFetch("/api/feed?shuffle=1");
            return res.json();
          },
          enabled: true,
        };
    }
  }, [tab, user]);

  const { data: all = [], isLoading } = useQuery<AnnotationWithRelations[]>({
    queryKey: queryDescriptor.queryKey,
    queryFn: queryDescriptor.fetcher,
    enabled: queryDescriptor.enabled,
    staleTime: 0,
  });

  // Bookmark id set used to render bookmark state on every card. Bookmark
  // functionality on individual posts must keep working even though the
  // sidebar Bookmarks tab is gone.
  const { data: bookmarkIdsRes } = useQuery<{ ids: string[] }>({
    queryKey: ["/api/bookmarks/ids", { userId: user?.id ?? "" }],
    queryFn: async () => {
      if (!user) return { ids: [] };
      const res = await apiFetch("/api/bookmarks/ids");
      return res.json();
    },
    enabled: !!user,
  });
  const bookmarkIds = useMemo(
    () => new Set((bookmarkIdsRes?.ids ?? []) as string[]),
    [bookmarkIdsRes]
  );

  const sourceRows = useMemo<AnnotationWithRelations[]>(() => {
    const rows = [...all];
    switch (sort) {
      case "latest":
        return rows.sort((a, b) => b.createdAt - a.createdAt);
      case "most-viewed":
        return rows.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
      case "most-commented":
        return rows.sort((a, b) => (b.commentCount ?? 0) - (a.commentCount ?? 0));
      case "most-popular":
        return rows.sort((a, b) => popularityScore(b) - popularityScore(a));
      default:
        return rows;
    }
  }, [sort, all]);

  const filtered = applyTypeFilter(sourceRows, filter);

  if (isLoading) {
    return (
      <div className="space-y-5" data-testid={`feed-list-${sort}-loading`}>
        {Array.from({ length: 3 }).map((_, i) => (
          <FeedSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div
        className="rounded-lg border border-card-border bg-card p-6 text-sm text-muted-foreground"
        data-testid={`feed-empty-${sort}`}
      >
        Nothing here yet — try a different filter.
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid={`feed-list-${sort}`}>
      {filtered.map((a) => (
        <FeedCard key={a.id} annotation={a} bookmarked={bookmarkIds.has(a.id)} />
      ))}
    </div>
  );
}

// ---------- Locked tab prompt (signed-out For You / Following / Bookmarks) --

const LOCKED_COPY: Record<
  Exclude<FeedTab, "latest">,
  { title: string; description: string; icon: typeof Sparkles }
> = {
  "for-you": {
    title: "Sign in to view For You",
    description:
      "Sign in to get a personalized stream of clips picked for the people and topics you follow.",
    icon: Sparkles,
  },
  following: {
    title: "Sign in to view Following",
    description:
      "Sign in to see the latest annotations from the creators you follow, all in one place.",
    icon: Users,
  },
  bookmarks: {
    title: "Sign in to view Bookmarks",
    description:
      "Sign in to save clips for later and find them all in your Bookmarks.",
    icon: BookmarkIcon,
  },
};

function LockedTabPrompt({ tab }: { tab: FeedTab }) {
  if (tab === "latest") return null;
  const copy = LOCKED_COPY[tab];
  const Icon = copy.icon;
  return (
    <div
      className="rounded-lg border border-card-border bg-card p-8 sm:p-10 flex flex-col items-center text-center"
      data-testid={`feed-locked-${tab}`}
    >
      <div className="w-12 h-12 rounded-full bg-[hsl(var(--primary)/0.10)] flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-foreground" aria-hidden />
      </div>
      <h2 className="text-lg sm:text-xl font-semibold mb-2">{copy.title}</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-5 leading-relaxed">
        {copy.description}
      </p>
      <Link href="/login">
        <Button size="default" data-testid={`button-feed-locked-signin-${tab}`}>
          Sign in
        </Button>
      </Link>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="rounded-lg border border-card-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

// ---------- Right rail: Suggested follows ----------------------------------

function PeopleWorthFollowing() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  // Hard-coded suggested set per spec — these four usernames in this order.
  const SUGGESTED = ["nikocallas", "fmaks", "volodyaa", "nazar"];
  const candidates = useMemo(() => {
    const list = data ?? [];
    const byUsername = new Map(list.map((u) => [u.username, u] as const));
    return SUGGESTED
      .map((u) => byUsername.get(u))
      .filter((u): u is User => !!u && u.id !== user?.id);
  }, [data, user]);

  return (
    <section
      className="rounded-lg border border-card-border bg-card p-4"
      data-testid="rail-people-worth-following"
      aria-labelledby="rail-people-heading"
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          id="rail-people-heading"
          className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground"
        >
          Suggested follows
        </h3>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-xs text-muted-foreground">No one to suggest yet.</div>
      ) : (
        <ul className="space-y-3">
          {candidates.map((u) => (
            <li key={u.id} className="flex items-center gap-3">
              <Link
                href={`/u/${u.username}`}
                className="flex items-center gap-2.5 min-w-0 hover-elevate rounded-md px-1 py-0.5"
                data-testid={`rail-person-${u.username}`}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={u.avatarUrl ?? undefined} alt={u.displayName} />
                  <AvatarFallback>{u.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{u.displayName}</div>
                  <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
                </div>
              </Link>
              <div className="ml-auto shrink-0">
                <FollowButton
                  targetUserId={u.id}
                  targetUsername={u.username}
                  className="min-w-[88px] px-3"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Right rail: Most viewed clip -----------------------------------

function MostViewedClip() {
  const { data } = useQuery<AnnotationWithRelations | null>({
    queryKey: ["/api/feed/most-viewed"],
  });

  if (!data) return null;
  const a = data;
  return (
    <section
      className="rounded-lg border border-card-border bg-card p-4"
      data-testid="rail-most-viewed"
      aria-labelledby="rail-most-viewed-heading"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-3">
        <Eye className="w-3 h-3" />
        <span id="rail-most-viewed-heading">Most viewed clip</span>
      </div>
      <Link
        href={`/a/${a.id}`}
        className="block hover-elevate rounded-md p-1 -m-1"
        data-testid="link-rail-most-viewed"
      >
        <div className="text-sm font-semibold leading-snug mb-1.5">
          {a.sourceTitle ?? "Annotated clip"}
        </div>
        {a.commentaryText && (
          <div className="text-xs text-foreground/80 leading-relaxed bg-[hsl(var(--primary)/0.10)] rounded px-2 py-1.5 mb-2">
            {a.commentaryText.length > 140 ? `${a.commentaryText.slice(0, 140)}…` : a.commentaryText}
          </div>
        )}
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <span>Annotated by @{a.user.username}</span>
          <span aria-hidden="true">·</span>
          <span data-testid="text-most-viewed-count">
            {(a.viewCount ?? 0).toLocaleString()} views
          </span>
        </div>
      </Link>
      <div className="text-[10px] text-muted-foreground mt-2">
        Top viewed clip across the entire platform.
      </div>
    </section>
  );
}
