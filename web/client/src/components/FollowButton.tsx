import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FollowButtonProps {
  targetUserId: string;
  targetUsername?: string;
  size?: "sm" | "default";
  className?: string;
}

export function FollowButton({
  targetUserId,
  targetUsername,
  size = "sm",
  className,
}: FollowButtonProps) {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const isMe = me?.id === targetUserId;

  const { data: followingState } = useQuery<{ following: boolean }>({
    queryKey: ["/api/users", targetUserId, "is-following", { followerId: me?.id ?? "" }],
    queryFn: async () => {
      if (!me) return { following: false };
      const res = await fetch(`/api/users/${targetUserId}/is-following?followerId=${me.id}`);
      return res.json();
    },
    enabled: !!me && !isMe,
  });

  const followMutation = useMutation({
    mutationFn: async (action: "follow" | "unfollow") => {
      if (!me) return;
      const method = action === "follow" ? "POST" : "DELETE";
      await apiRequest(method, `/api/users/${targetUserId}/follow`, { followerId: me.id });
    },
    onSuccess: (_data, action) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", targetUserId] });
      queryClient.invalidateQueries({
        queryKey: ["/api/users", targetUserId, "is-following"],
      });
      // Refetch all feed queries (public + Following) so the UI reflects new follow state.
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      toast({
        title: action === "follow" ? "Following" : "Unfollowed",
        description: targetUsername ? `@${targetUsername}` : undefined,
      });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Action failed";
      toast({ title: "Couldn't update follow", description: message, variant: "destructive" });
    },
  });

  if (isMe) return null;

  if (!me) {
    // Signed-out visitors see a plain "Follow" button. Clicking it routes to
    // sign-in (the actual follow happens after auth completes).
    return (
      <Button
        type="button"
        size={size}
        variant="outline"
        className={className}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setLocation("/login");
        }}
        data-testid={`button-follow-signin-${targetUserId}`}
        aria-label={`Follow ${targetUsername ?? "user"}`}
      >
        Follow
      </Button>
    );
  }

  const isFollowing = followingState?.following ?? false;

  return (
    <Button
      type="button"
      size={size}
      variant={isFollowing ? "outline" : "default"}
      disabled={followMutation.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        followMutation.mutate(isFollowing ? "unfollow" : "follow");
      }}
      className={className}
      data-testid={`button-follow-${targetUserId}`}
      aria-pressed={isFollowing}
      aria-label={isFollowing ? `Unfollow ${targetUsername ?? "user"}` : `Follow ${targetUsername ?? "user"}`}
    >
      {isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
