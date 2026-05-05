import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { AppLayout } from "@/components/AppLayout";
import { FeedCard } from "@/components/FeedCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AnnotationWithRelations, User } from "@shared/schema";

interface ProfileData {
  user: User;
  followers: number;
  following: number;
  annotations: AnnotationWithRelations[];
}

export default function ProfilePage() {
  const [, params] = useRoute("/u/:username");
  const username = (params?.username ?? "").toLowerCase();
  const { user: me } = useAuth();

  // Fetch the profile by username directly. This is authoritative — it doesn't
  // depend on the /api/users list (which can be cached, paginated, or stale)
  // and so it works for users who just signed in via OAuth.
  const { data, isLoading, isError, error } = useQuery<ProfileData>({
    queryKey: ["/api/users/by-username", username],
    queryFn: async () => {
      const res = await fetch(`/api/users/by-username/${encodeURIComponent(username)}`);
      if (res.status === 404) {
        throw new Error("not_found");
      }
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(text);
      }
      return res.json();
    },
    enabled: !!username,
    retry: false,
  });

  const target = data?.user;
  const targetId = target?.id;

  const { data: followingState } = useQuery<{ following: boolean }>({
    queryKey: ["/api/users", targetId, "is-following", { followerId: me?.id ?? "" }],
    queryFn: async () => {
      if (!me || !targetId) return { following: false };
      const res = await fetch(`/api/users/${targetId}/is-following?followerId=${me.id}`);
      return res.json();
    },
    enabled: !!me && !!targetId,
  });

  const followMutation = useMutation({
    mutationFn: async (action: "follow" | "unfollow") => {
      if (!me || !targetId) return;
      const method = action === "follow" ? "POST" : "DELETE";
      await apiRequest(method, `/api/users/${targetId}/follow`, { followerId: me.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/by-username", username] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", targetId, "is-following"] });
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-6 py-10">Loading…</div>
      </AppLayout>
    );
  }
  if (isError || !target) {
    const notFound = error instanceof Error && error.message === "not_found";
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-6 py-10">
          {notFound ? (
            <>
              <p>User not found.</p>
              {me && me.username.toLowerCase() === username && (
                <p className="text-sm text-muted-foreground mt-2">
                  Your account hasn't finished syncing yet — try refreshing the
                  page in a moment.
                </p>
              )}
            </>
          ) : (
            <p>Couldn't load this profile. Please try again.</p>
          )}
        </div>
      </AppLayout>
    );
  }

  const isMe = me?.id === target.id;
  const isFollowing = followingState?.following ?? false;

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="flex items-start gap-5 mb-10">
          <Avatar className="h-20 w-20">
            <AvatarImage src={target.avatarUrl ?? undefined} alt={target.displayName} />
            <AvatarFallback className="text-2xl">
              {target.displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold" data-testid="text-profile-name">
              {target.displayName}
            </h1>
            <p className="text-muted-foreground">@{target.username}</p>
            {target.bio && <p className="text-sm mt-3 leading-relaxed">{target.bio}</p>}
            <div className="flex items-center gap-4 mt-4 text-sm">
              <span>
                <strong>{data?.followers ?? 0}</strong>{" "}
                <span className="text-muted-foreground">followers</span>
              </span>
              <span>
                <strong>{data?.following ?? 0}</strong>{" "}
                <span className="text-muted-foreground">following</span>
              </span>
              <span>
                <strong>{data?.annotations.length ?? 0}</strong>{" "}
                <span className="text-muted-foreground">clips</span>
              </span>
            </div>
          </div>
          {!isMe && me && (
            <Button
              variant={isFollowing ? "outline" : "default"}
              onClick={() => followMutation.mutate(isFollowing ? "unfollow" : "follow")}
              disabled={followMutation.isPending}
              data-testid="button-follow-toggle"
            >
              {isFollowing ? "Following" : "Follow"}
            </Button>
          )}
        </header>

        <div className="space-y-5">
          {(data?.annotations ?? []).length === 0 ? (
            <p className="text-muted-foreground">No clips yet.</p>
          ) : (
            (data?.annotations ?? []).map((a) => <FeedCard key={a.id} annotation={a} />)
          )}
        </div>
      </div>
    </AppLayout>
  );
}
