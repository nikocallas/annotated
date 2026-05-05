import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import NotFound from "@/pages/not-found";
import FeedPage from "@/pages/feed";
import FollowingPage from "@/pages/following";
import LoginPage from "@/pages/login";
import ProfilePage from "@/pages/profile";
import AnnotationDetailPage from "@/pages/annotation-detail";
import InstallPage from "@/pages/install";
import InvitePage from "@/pages/invite";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={FeedPage} />
      <Route path="/following" component={FollowingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/install" component={InstallPage} />
      <Route path="/invite" component={InvitePage} />
      <Route path="/u/:username" component={ProfilePage} />
      <Route path="/a/:id" component={AnnotationDetailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
