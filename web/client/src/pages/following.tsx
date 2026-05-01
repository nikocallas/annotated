import { useQuery } from "@tanstack/react-query";
import type { AnnotationWithRelations } from "@shared/schema";
import { AppLayout } from "@/components/AppLayout";
import { FeedCard } from "@/components/FeedCard";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";

export default function FollowingPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<AnnotationWithRelations[]>({
    queryKey: ["/api/feed", { followerOf: user?.id ?? "" }],
    queryFn: async () => {
      if (!user) return [];
      const res = await fetch(`/api/feed?followerOf=${user.id}`);
      return res.json();
    },
    enabled: !!user,
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
            Following
          </h1>
          <p className="text-muted-foreground mt-2">
            Annotations from the people you follow.
          </p>
        </header>
        {!user ? (
          <div className="rounded-lg border border-card-border bg-card p-8 text-center">
            <p className="text-muted-foreground mb-4">
              Sign in to see clips from the people you follow.
            </p>
            <Link href="/login" className="text-primary hover:underline" data-testid="link-following-login">
              Sign in with X or Google →
            </Link>
          </div>
        ) : isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <div className="rounded-lg border border-card-border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              No annotations from people you follow yet.{" "}
              <Link href="/" className="text-primary hover:underline">
                Browse the global feed
              </Link>{" "}
              to find people to follow.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {(data ?? []).map((a) => (
              <FeedCard key={a.id} annotation={a} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
