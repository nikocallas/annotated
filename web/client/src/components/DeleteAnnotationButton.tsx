import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DeleteAnnotationButtonProps {
  annotationId: string;
  ownerId: string;
  /** "detail" — full button on detail page; "card" — compact icon affordance on a feed card. */
  variant?: "detail" | "card";
  /** Where to navigate after success. Defaults to /. Ignored for `card`. */
  redirectTo?: string;
}

export function DeleteAnnotationButton({
  annotationId,
  ownerId,
  variant = "detail",
  redirectTo = "/",
}: DeleteAnnotationButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const isOwner = !!user && user.id === ownerId;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in required");
      await apiRequest("DELETE", `/api/annotations/${annotationId}`, { userId: user.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/most-viewed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks/ids"] });
      queryClient.removeQueries({ queryKey: ["/api/annotations", annotationId] });
      toast({ title: "Clip deleted" });
      setOpen(false);
      if (variant === "detail") setLocation(redirectTo);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Couldn't delete clip";
      toast({ title: "Couldn't delete", description: message, variant: "destructive" });
    },
  });

  if (!isOwner) return null;

  const trigger =
    variant === "card" ? (
      <button
        type="button"
        aria-label="Delete clip"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover-elevate text-xs text-muted-foreground hover:text-destructive"
        data-testid={`button-delete-${annotationId}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>
    ) : (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-destructive"
        data-testid="button-delete-detail"
      >
        <Trash2 className="w-4 h-4 mr-1.5" />
        Delete
      </Button>
    );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent
        onClick={(e) => e.stopPropagation()}
        data-testid="dialog-delete-annotation"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this clip?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the clip from your profile and the public feed.
            Comments, bookmarks, and any open claims attached to it will be removed too.
            This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-delete-confirm"
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete clip"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
