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
  const username = params?.username ?? "";
  const { user: me } = useAuth();

  const { data: usersList } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const target = usersList?.find((u) => u.username === username);
  const targetId = target?.id;

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["/api/users", targetId],
    enabled: !!targetId,
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/users", targetId] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", targetId, "is-following"] });
    },
  });

  if (!usersList) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-6 py-10">Loading…</div>
      </AppLayout>
    );
  }
  if (!target) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-6 py-10">User not found.</div>
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
          {isLoading ? (
            <p className="text-muted-foreground">Loading clips…</p>
          ) : (data?.annotations ?? []).length === 0 ? (
            <p className="text-muted-foreground">No clips yet.</p>
          ) : (
            (data?.annotations ?? []).map((a) => <FeedCard key={a.id} annotation={a} />)
          )}
        </div>
      </div>
    </AppLayout>
  );
}
