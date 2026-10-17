import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ANNOTATION_TYPES,
  ANNOTATION_TYPE_LABELS,
  isAnnotationType,
  type AnnotationRequestWithRelations,
  type AnnotationType,
  type AnnotationWithRelations,
  type User,
} from "@shared/schema";
import { AnnotationTypeBadge } from "@/components/AnnotationParts";
import { RequestAnnotationButton } from "@/components/RequestAnnotationButton";
import { useFeedParams } from "@/hooks/use-feed-params";
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
  Search,
  Quote,
  TrendingUp,
  Hash,
  HandHelping,
  X as XIcon,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/queryClient";

type SortKey = "best" | "latest" | "most-viewed" | "most-popular" | "most-commented";
type FilterKey = "all" | "youtube" | "article" | "podcast";
type FeedTab = "for-you" | "following" | "latest" | "bookmarks";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "best", label: "Best for you" },
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
  { key: "for-you", label: "For You", icon: Sparkles, requiresAuth: false },
  { key: "following", label: "Following", icon: Users, requiresAuth: true },
  { key: "latest", label: "Latest", icon: Clock, requiresAuth: false },
  { key: "bookmarks", label: "Bookmarks", icon: BookmarkIcon, requiresAuth: true },
];

const FEED_TAB_KEYS = FEED_TABS.map((t) => t.key);
const isFeedTab = (v: string | null | undefined): v is FeedTab =>
  !!v && (FEED_TAB_KEYS as string[]).includes(v);

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
  const { params, update } = useFeedParams();
  const tab: FeedTab = isFeedTab(params.get("tab")) ? (params.get("tab") as FeedTab) : "for-you";
  const defaultSort: SortKey = tab === "for-you" ? "best" : "latest";
  const sortParam = params.get("sort");
  const sort: SortKey = isSortKey(sortParam) ? sortParam : defaultSort;
  const typeParam = params.get("type");
  const annotationType: AnnotationType | null = isAnnotationType(typeParam) ? typeParam : null;
  const tag = (params.get("tag") ?? "").replace(/^#/, "").toLowerCase().slice(0, 40);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const handleTabSelect = (next: FeedTab) => {
    update({ tab: next === "for-you" ? null : next, sort: null });
  };
  const setSort = (next: SortKey) => update({ sort: next === defaultSort ? null : next }, { replace: true });
  const setType = (next: AnnotationType | null) => update({ type: next });

  const activeTabMeta = FEED_TABS.find((t) => t.key === tab);
  const tabLocked = !!activeTabMeta?.requiresAuth && !user;

  return (
    <AppLayout feedHeader>
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-6 lg:py-8 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_300px] gap-6 lg:gap-8">
        {/* Left sidebar */}
        <LeftSidebar tab={tab} onTabChange={handleTabSelect} />

        {/* Center feed */}
        <div className="min-w-0">
          <h1 className="sr-only">Annotated public feed</h1>
          <section className="feed-intro" aria-labelledby="feed-heading">
            <div>
              <div className="feed-eyebrow">
                <Quote className="h-3.5 w-3.5" aria-hidden />
                The context layer of the internet
              </div>
              <h2 id="feed-heading">What’s worth carrying forward</h2>
              <p>Highlight any sentence, clip any moment, and dispute it or add the context that’s missing.</p>
            </div>
            <label className="feed-search">
              <Search className="h-4 w-4" aria-hidden />
              <span className="sr-only">Search the feed</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sources or people"
                data-testid="input-feed-search"
              />
            </label>
          </section>
          <MobileTabs tab={tab} onTabChange={handleTabSelect} />
          {!tabLocked && (
            <>
              <TopFilters
                filter={filter}
                onFilterChange={setFilter}
                sort={sort}
                onSortChange={setSort}
                showBest={tab === "for-you"}
              />
              <TypeChips value={annotationType} onChange={setType} />
              {tag && (
                <div className="mt-3 flex items-center gap-2 text-sm" data-testid="feed-active-tag">
                  <span className="text-muted-foreground">Topic</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-card-border bg-card px-3 py-1 font-semibold">
                    <Hash className="w-3.5 h-3.5" aria-hidden />
                    {tag}
                    <button
                      type="button"
                      onClick={() => update({ tag: null })}
                      className="ml-1 rounded-full p-1 hover-elevate"
                      aria-label={`Clear topic ${tag}`}
                      data-testid="button-clear-tag"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </span>
                </div>
              )}
            </>
          )}
          <div className="mt-5">
            {tabLocked ? (
              <LockedTabPrompt tab={tab} />
            ) : (
              <FeedList
                tab={tab}
                sort={sort}
                filter={filter}
                query={query}
                annotationType={annotationType}
                tag={tag}
              />
            )}
          </div>
        </div>

        {/* Right rail */}
        <aside className="space-y-5 order-last lg:block">
          <TrendingRail />
          <PeopleWorthFollowing />
          <OpenRequestsRail />
          <MostViewedClip />
          {!user && (
            <OAuthSignIn
              compact
              title="Sign in to follow"
              description="Use X or Google to follow creators and personalize For You."
            />
          )}
        </aside>
      </div>
    </AppLayout>
  );
}

// ---------- Annotation type chips ------------------------------------------

function TypeChips({
  value,
  onChange,
}: {
  value: AnnotationType | null;
  onChange: (next: AnnotationType | null) => void;
}) {
  return (
    <div
      className="mt-3 -mx-1 px-1 flex gap-2 overflow-x-auto pb-1"
      role="group"
      aria-label="Filter by kind of take"
      data-testid="feed-type-chips"
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold hover-elevate ${
          value === null ? "bg-foreground text-background border-foreground" : "bg-card border-card-border"
        }`}
        data-testid="chip-type-all"
      >
        All takes
      </button>
      {ANNOTATION_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(value === t ? null : t)}
          aria-pressed={value === t}
          className={`min-h-11 shrink-0 rounded-full px-1 hover-elevate ${value === t ? "ring-2 ring-foreground" : ""}`}
          data-testid={`chip-type-${t}`}
        >
          <AnnotationTypeBadge type={t} />
        </button>
      ))}
    </div>
  );
}

// ---------- Mobile tab strip (the sidebar is desktop-only) -----------------

function MobileTabs({ tab, onTabChange }: { tab: FeedTab; onTabChange: (t: FeedTab) => void }) {
  return (
    <nav className="lg:hidden -mx-1 px-1 mb-3 flex gap-1 overflow-x-auto" aria-label="Feed tabs">
      {FEED_TABS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onTabChange(opt.key)}
          aria-current={tab === opt.key ? "page" : undefined}
          className={`min-h-11 shrink-0 rounded-full px-3 text-sm font-medium hover-elevate ${
            tab === opt.key ? "bg-sidebar-accent text-foreground" : "text-muted-foreground"
          }`}
          data-testid={`mobile-tab-${opt.key}`}
        >
          {opt.label}
        </button>
      ))}
      <Link
        href="/requests"
        className="min-h-11 shrink-0 inline-flex items-center rounded-full px-3 text-sm font-medium text-muted-foreground hover-elevate"
      >
        Requests
      </Link>
    </nav>
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
              className={`min-h-11 w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium hover-elevate ${
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
        <Link
          href="/requests"
          className="min-h-11 w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium hover-elevate text-muted-foreground"
          data-testid="sidebar-link-requests"
        >
          <HandHelping className="w-4 h-4" />
          Requests
        </Link>
        <div className="pt-4 mt-4 border-t border-card-border">
          <div className="rounded-lg border border-card-border bg-card p-4">
            <div className="text-sm font-semibold mb-1">Invite your friends</div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              Ideas multiply when they’re shared. Invite someone by email.
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
  showBest,
}: {
  filter: FilterKey;
  onFilterChange: (f: FilterKey) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  showBest: boolean;
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
            className={`min-h-11 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium hover-elevate ${
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
            className="min-h-11 rounded-full border border-card-border bg-card px-4 py-1.5 h-auto text-sm font-medium hover-elevate w-auto gap-2 whitespace-nowrap [&>span]:line-clamp-none [&>span]:whitespace-nowrap"
          >
            <ArrowUpDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" className="rounded-xl">
            {SORT_OPTIONS.filter((opt) => showBest || opt.key !== "best").map((opt) => (
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
  query,
  annotationType,
  tag,
}: {
  tab: FeedTab;
  sort: SortKey;
  filter: FilterKey;
  query: string;
  annotationType: AnnotationType | null;
  tag: string;
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
    const qs = new URLSearchParams();
    if (annotationType) qs.set("type", annotationType);
    if (tag) qs.set("tag", tag);
    const withFilters = (base: string) => {
      const extra = qs.toString();
      if (!extra) return base;
      return `${base}${base.includes("?") ? "&" : "?"}${extra}`;
    };
    const filters = { type: annotationType ?? "", tag };
    switch (tab) {
      case "following":
        return {
          queryKey: ["/api/feed", { followerOf: user?.id ?? "", viewer: viewerKey, ...filters }],
          fetcher: async () => {
            if (!user) return [];
            const res = await apiFetch(withFilters("/api/feed?followerOf=1"));
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
            const rows: AnnotationWithRelations[] = await res.json();
            return rows.filter((a) => !annotationType || a.annotationType === annotationType);
          },
          enabled: !!user,
        };
      case "latest":
        return {
          queryKey: ["/api/feed", { viewer: viewerKey, ...filters }],
          fetcher: async () => {
            const res = await apiFetch(withFilters("/api/feed"));
            return res.json();
          },
          enabled: true,
        };
      case "for-you":
      default:
        return {
          queryKey: ["/api/feed", { mode: "for-you", viewer: viewerKey, ...filters }],
          fetcher: async () => {
            const res = await apiFetch(withFilters("/api/feed?mode=for-you"));
            return res.json();
          },
          enabled: true,
        };
    }
  }, [tab, user, annotationType, tag]);

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
      case "best":
        return rows; // server-ranked For You order
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

  const filtered = useMemo(() => {
    const typed = applyTypeFilter(sourceRows, filter);
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return typed;
    return typed.filter((annotation) =>
      [
        annotation.sourceTitle,
        annotation.sourcePublication,
        annotation.sourceAuthor,
        annotation.clipText,
        annotation.commentaryText,
        annotation.user.displayName,
        annotation.user.username,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(needle)),
    );
  }, [sourceRows, filter, query]);

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
        {query.trim()
          ? `No annotations match “${query.trim()}”. Try a source, creator, or phrase.`
          : annotationType || tag
          ? "No posts match this filter yet. Be the first: clip something and pick this kind of take."
          : "Nothing here yet — try a different filter."}
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
  Exclude<FeedTab, "latest" | "for-you">,
  { title: string; description: string; icon: typeof Sparkles }
> = {
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
  if (tab === "latest" || tab === "for-you") return null;
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
  const { data, isLoading } = useQuery<(User & { followers?: number; annotationCount?: number })[]>({
    queryKey: ["/api/users", { viewer: user?.id ?? "" }],
    queryFn: async () => {
      const res = await apiFetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });
  const candidates = useMemo(() => (data ?? []).filter((u) => u.id !== user?.id), [data, user]);

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
                  <div className="text-xs text-muted-foreground truncate">
                    @{u.username}
                    {typeof u.annotationCount === "number" && (
                      <span>
                        {" "}· {u.annotationCount} {u.annotationCount === 1 ? "post" : "posts"}
                        {typeof u.followers === "number" && u.followers > 0 ? ` · ${u.followers} followers` : ""}
                      </span>
                    )}
                  </div>
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
        <span id="rail-most-viewed-heading">Live signal</span>
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
        The moment drawing the most attention across Annotated right now.
      </div>
    </section>
  );
}

// ---------- Right rail: Trending -------------------------------------------

interface TrendingItem {
  key: string;
  label: string;
  count: number;
}

function TrendingRail() {
  const { update } = useFeedParams();
  const { data } = useQuery<{ sources: TrendingItem[]; topics: TrendingItem[]; types: TrendingItem[] }>({
    queryKey: ["/api/trending"],
  });
  if (!data || (data.sources.length === 0 && data.topics.length === 0)) return null;
  return (
    <section
      className="rounded-lg border border-card-border bg-card p-4 space-y-4"
      data-testid="rail-trending"
      aria-labelledby="rail-trending-heading"
    >
      <h3
        id="rail-trending-heading"
        className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground"
      >
        <TrendingUp className="w-3 h-3" aria-hidden />
        Trending
      </h3>
      {data.topics.length > 0 && (
        <div>
          <div className="text-xs font-semibold mb-1.5">Topics</div>
          <ul className="flex flex-wrap gap-1.5">
            {data.topics.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => update({ tag: t.key, tab: null })}
                  className="min-h-9 inline-flex items-center rounded-full border border-card-border px-2.5 text-xs font-semibold hover-elevate"
                  data-testid={`rail-topic-${t.key}`}
                >
                  {t.label}
                  <span className="ml-1 text-muted-foreground font-normal">{t.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.sources.length > 0 && (
        <div>
          <div className="text-xs font-semibold mb-1.5">Sources</div>
          <ol className="space-y-1">
            {data.sources.map((src, i) => (
              <li key={src.key} className="flex items-center gap-2 text-sm" data-testid={`rail-source-${i}`}>
                <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="truncate">{src.label}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {src.count} {src.count === 1 ? "post" : "posts"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {data.types.length > 0 && (
        <div>
          <div className="text-xs font-semibold mb-1.5">Kinds of take</div>
          <ul className="flex flex-wrap gap-1.5">
            {data.types.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => update({ type: t.key, tab: null })}
                  className="rounded-full hover-elevate"
                  aria-label={`Show ${ANNOTATION_TYPE_LABELS[t.key as AnnotationType] ?? t.key} posts`}
                >
                  <AnnotationTypeBadge type={t.key} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------- Right rail: Open requests --------------------------------------

function OpenRequestsRail() {
  const { data } = useQuery<AnnotationRequestWithRelations[]>({
    queryKey: ["/api/requests", { status: "open", limit: 3 }],
    queryFn: async () => {
      const res = await apiFetch("/api/requests?limit=3");
      if (!res.ok) return [];
      return res.json();
    },
  });
  return (
    <section
      className="rounded-lg border border-card-border bg-card p-4 space-y-3"
      data-testid="rail-open-requests"
      aria-labelledby="rail-requests-heading"
    >
      <h3
        id="rail-requests-heading"
        className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground"
      >
        <HandHelping className="w-3 h-3" aria-hidden />
        Context wanted
      </h3>
      {data && data.length > 0 ? (
        <ul className="space-y-2.5">
          {data.map((r) => (
            <li key={r.id} className="text-sm">
              <a
                href={r.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium leading-snug hover:underline line-clamp-2"
              >
                {r.sourceTitle ?? r.sourceUrl}
              </a>
              <div className="text-xs text-muted-foreground mt-0.5">
                @{r.user.username} asked{r.requestedUser ? ` @${r.requestedUser.username}` : " everyone"}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Want a fact-check or the missing context on a story? Ask the community.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <RequestAnnotationButton label="Ask" />
        <Link href="/requests" className="text-xs text-primary-readable hover:underline" data-testid="link-all-requests">
          All requests →
        </Link>
      </div>
    </section>
  );
}
