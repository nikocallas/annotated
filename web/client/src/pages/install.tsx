import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Chrome, Scissors, FileText, Mic, Github } from "lucide-react";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";

const STEPS = [
  {
    n: 1,
    title: "Add to Chrome",
    body: "Open the Annotated listing on the Chrome Web Store and click \"Add to Chrome.\"",
  },
  {
    n: 2,
    title: "Pin the toolbar icon",
    body: "Open Chrome's extensions menu and pin Annotated so the icon stays visible in the toolbar.",
  },
  {
    n: 3,
    title: "Open the side panel",
    body: "Click the Annotated icon — the side panel slides in. Now visit any video, article, or podcast.",
  },
];

export default function InstallPage() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-10">
        <header>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            <Chrome className="w-3.5 h-3.5" />
            Chrome side panel
          </div>
          <h1
            className="text-4xl md:text-5xl mb-3 leading-[1.05]"
            style={{ fontFamily: "var(--font-sans)" }}
            data-testid="text-install-title"
          >
            Install the extension
          </h1>
          <p className="text-muted-foreground max-w-xl">
            Annotated lives where you read, watch, and listen — in a Chrome side panel. One-click
            install from the Chrome Web Store.
          </p>
        </header>

        <Card className="border-card-border bg-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="font-semibold">Annotated for Chrome</div>
              <p className="text-sm text-muted-foreground mt-1">
                Manifest V3, Side Panel API, content script for text-selection capture, background
                service worker, and a fully packaged side-panel UI.
              </p>
            </div>
            <DownloadExtensionButton size="lg" label="Install from Chrome Web Store" />
          </div>
        </Card>

        <ol className="space-y-5">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4" data-testid={`step-${s.n}`}>
              <div className="rounded-full bg-foreground/5 border border-border h-9 w-9 flex items-center justify-center font-serif italic text-base shrink-0">
                {s.n}
              </div>
              <div>
                <div className="font-semibold">{s.title}</div>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="grid sm:grid-cols-3 gap-4 pt-2">
          <Card className="p-4 bg-card border-card-border">
            <Scissors className="w-4 h-4 text-primary mb-2" />
            <div className="text-sm font-semibold mb-1">YouTube clips</div>
            <p className="text-xs text-muted-foreground">
              Drag start/end. Max 90s. Captured at 240p and verified before publishing.
            </p>
          </Card>
          <Card className="p-4 bg-card border-card-border">
            <FileText className="w-4 h-4 text-primary mb-2" />
            <div className="text-sm font-semibold mb-1">Article text</div>
            <p className="text-xs text-muted-foreground">
              Highlight the passage. We pull title, author, and metadata.
            </p>
          </Card>
          <Card className="p-4 bg-card border-card-border">
            <Mic className="w-4 h-4 text-primary mb-2" />
            <div className="text-sm font-semibold mb-1">Podcast clips</div>
            <p className="text-xs text-muted-foreground">
              Trim a 90-second segment. Add your text or audio commentary.
            </p>
          </Card>
        </section>

        <Card className="border-primary/30 bg-primary/5 p-6">
          <div className="flex gap-3">
            <Github className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold mb-1">Three things every annotation does</div>
              <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                <li>Always links back to the original source URL.</li>
                <li>Caps clips at 90 seconds; video at 240p.</li>
                <li>Surfaces a "File a claim" button for every page.</li>
              </ol>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
