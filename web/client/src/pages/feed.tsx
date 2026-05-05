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
  Sparkles,
  Users,
  Clock,
  Bookmark,
  Video,
  FileText,
  Mic,
  LayoutGrid,
  Eye,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";

type SortKey = "latest" | "for-you" | "following" | "bookmarks";
type FilterKey = "all" | "youtube" | "article" | "podcast";

const SORT_OPTIONS: { key: SortKey; label: string; icon: typeof Clock }[] = [
  { key: "for-you", label: "For You", icon: Sparkles },
  { key: "following", label: "Following", icon: Users },
  { key: "latest", label: "Latest", icon: Clock },
  { key: "bookmarks", label: "Bookmarks", icon: Bookmark },
];

const FILTER_OPTIONS: { key: FilterKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "youtube", label: "Videos", icon: Video },
  { key: "article", label: "Readings", icon: FileText },
  { key: "podcast", label: "Podcasts", icon: Mic },
];

function readInitialSort(): SortKey {
  if (typeof window === "undefined") return "latest";
  const search = window.location.search;
  const hash = window.location.hash;
  const fromSearch = new URLSearchParams(search).get("tab") || new URLSearchParams(search).get("sort");
  const fromHash = new URLSearchParams(hash.split("?")[1] ?? "").get("tab") ||
    new URLSearchParams(hash.split("?")[1] ?? "").get("sort");
  const v = fromSearch || fromHash;
  if (v === "for-you" || v === "following" || v === "latest" || v === "bookmarks") return v;
  return "latest";
}

export default function FeedPage() {
  const { user } = useAuth();
  const [sort, setSort] = useState<SortKey>(readInitialSort);
  const [filter, setFilter] = useState<FilterKey>("all");

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

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-6 lg:py-8 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_300px] gap-6 lg:gap-8">
        {/* Left sidebar */}
        <LeftSidebar sort={sort} onSortChange={setSort} />

        {/* Center feed */}
        <div className="min-w-0">
          <TopFilters
            filter={filter}
            onFilterChange={setFilter}
            sort={sort}
            onSortChange={setSort}
          />
          <div className="mt-5">
            <FeedList sort={sort} filter={filter} />
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
  sort,
  onSortChange,
}: {
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
}) {
  return (
    <aside className="hidden lg:block">
      <nav className="sticky top-20 space-y-1" aria-label="Feed navigation">
        {SORT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = sort === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSortChange(opt.key)}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium hover-elevate ${
                active
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground"
              }`}
              aria-current={active ? "page" : undefined}
              data-testid={`sidebar-sort-${opt.key}`}
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
            <Link href="/install">
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
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="rounded-full border border-card-border bg-card px-3 py-1.5 text-sm font-medium hover-elevate"
          aria-label="Sort feed"
          data-testid="select-feed-sort"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ---------- Feed list (driven by sort + filter) ----------------------------

function applyTypeFilter(rows: AnnotationWithRelations[], filter: FilterKey) {
  if (filter === "all") return rows;
  return rows.filter((a) => a.sourceType === filter);
}

function FeedList({ sort, filter }: { sort: SortKey; filter: FilterKey }) {
  const { user } = useAuth();

  // Always-on "all" feed query — used by Latest, For You (personalized fallback),
  // and to derive Bookmark/Following empty-state hints.
  const { data: all = [], isLoading: loadingAll } = useQuery<AnnotationWithRelations[]>({
    queryKey: ["/api/feed"],
  });

  // Following query (only if signed in)
  const { data: following = [], isLoading: loadingFollowing } = useQuery<AnnotationWithRelations[]>({
    queryKey: ["/api/feed", { followerOf: user?.id ?? "" }],
    queryFn: async () => {
      if (!user) return [];
      const res = await fetch(`/api/feed?followerOf=${user.id}`);
      return res.json();
    },
    enabled: !!user,
  });

  // Bookmarks query (only if signed in)
  const { data: bookmarks = [], isLoading: loadingBookmarks } = useQuery<AnnotationWithRelations[]>({
    queryKey: ["/api/bookmarks", { userId: user?.id ?? "" }],
    queryFn: async () => {
      if (!user) return [];
      const res = await fetch(`/api/bookmarks?userId=${user.id}`);
      return res.json();
    },
    enabled: !!user,
  });

  // Bookmark id set used to render bookmark state on every card.
  const { data: bookmarkIdsRes } = useQuery<{ ids: string[] }>({
    queryKey: ["/api/bookmarks/ids", { userId: user?.id ?? "" }],
    queryFn: async () => {
      if (!user) return { ids: [] };
      const res = await fetch(`/api/bookmarks/ids?userId=${user.id}`);
      return res.json();
    },
    enabled: !!user,
  });
  const bookmarkIds = useMemo(
    () => new Set((bookmarkIdsRes?.ids ?? []) as string[]),
    [bookmarkIdsRes]
  );

  // Sort-specific source list + loading state.
  const sourceRows = useMemo<AnnotationWithRelations[]>(() => {
    if (sort === "following") return following;
    if (sort === "bookmarks") return bookmarks;
    if (sort === "for-you") {
      // Heuristic For You: prefer the user's followed creators, then top-viewed
      // publics that aren't already in the followed slice. Falls back to the
      // public feed for signed-out users.
      if (!user) return all;
      const followingIds = new Set(following.map((a) => a.id));
      const tail = [...all]
        .filter((a) => !followingIds.has(a.id))
        .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
      return [...following, ...tail];
    }
    return all; // latest
  }, [sort, following, bookmarks, all, user]);

  const isLoading =
    sort === "following" ? loadingFollowing :
    sort === "bookmarks" ? loadingBookmarks :
    loadingAll;

  const filtered = applyTypeFilter(sourceRows, filter);

  // Empty / signed-out states
  if (sort === "following" && !user) {
    return <SignInCallout title="Sign in to see your Following feed" />;
  }
  if (sort === "bookmarks" && !user) {
    return <SignInCallout title="Sign in to see your Bookmarks" />;
  }

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
    const empty =
      sort === "following"
        ? "No clips from people you follow yet. Tap Follow on creators you want to track."
        : sort === "bookmarks"
        ? "No bookmarks yet. Tap Mark on a clip to save it for later."
        : "Nothing here yet — try a different filter.";
    return (
      <div
        className="rounded-lg border border-card-border bg-card p-6 text-sm text-muted-foreground"
        data-testid={`feed-empty-${sort}`}
      >
        {empty}
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

function SignInCallout({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-card-border bg-card p-6">
        <h3 className="text-lg font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">
          Annotated uses X or Google to sign you in. No email, no password.
        </p>
      </div>
      <OAuthSignIn
        title="Sign in to Annotated"
        description="Pick a provider — we'll bring you right back here."
      />
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

// ---------- Right rail: People worth following -----------------------------

function PeopleWorthFollowing() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  const candidates = useMemo(() => {
    const list = data ?? [];
    return list.filter((u) => u.id !== user?.id).slice(0, 4);
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
          People worth following
        </h3>
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:text-foreground"
          data-testid="link-rail-people-see-all"
        >
          See all
        </Link>
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
              <div className="ml-auto">
                <FollowButton targetUserId={u.id} targetUsername={u.username} />
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
