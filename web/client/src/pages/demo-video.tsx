import { MarketingFooter, MarketingHeader } from "@/components/MarketingChrome";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";

const CHAPTERS = [
  { time: "0:00", title: "Why Annotated", body: "Turn an exact moment into a post that keeps its source." },
  { time: "0:04", title: "Clip a video", body: "Set a precise start and end on a YouTube video." },
  { time: "0:12", title: "Highlight an article", body: "Keep the passage and the publication attached." },
  { time: "0:21", title: "Clip a podcast", body: "Keep the audio moment, not just a transcript of it." },
  { time: "0:29", title: "Publish to the feed", body: "Share a playable post with the source intact." },
  { time: "0:40", title: "Credit the source", body: "Every post shows the creator, the range, and the original link." },
];

export default function DemoVideoPage() {
  return (
    <div className="lp">
      <MarketingHeader current="demo" />
      <main>
        <section className="demo-hero">
          <h1 data-testid="text-demo-video-title">See a moment become a post in under a minute.</h1>
          <p>Recorded in the real product: an article, a video, and a podcast, from the side panel to the feed.</p>
        </section>

        <section className="demo-player-section" aria-label="Annotated demo video">
          <div className="demo-player-shell">
            <video
              className="demo-player"
              controls
              playsInline
              preload="metadata"
              poster="/media/annotated-demo-poster.jpg"
              data-testid="video-demo"
            >
              <source src="/media/annotated-demo.mp4" type="video/mp4" />
              <track kind="chapters" src="/media/annotated-demo-chapters.vtt" srcLang="en" label="Chapters" default />
              Your browser doesn’t support embedded video. You can{" "}
              <a href="/media/annotated-demo.mp4">download the demo</a> instead.
            </video>
          </div>
          <ol className="demo-chapters" aria-label="Chapters">
            {CHAPTERS.map(({ time, title, body }) => (
              <li key={time}>
                <time>{time}</time>
                <h2>{title}</h2>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="demo-cta">
          <h2>Try it on something worth arguing about.</h2>
          <div className="lp-actions" style={{ marginTop: 0 }}>
            <DownloadExtensionButton size="lg" />
            <a href="/feed" className="lp-button-quiet">Browse annotations</a>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
