import { MarketingFooter, MarketingHeader } from "@/components/MarketingChrome";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";

const CHAPTERS = [
  { time: "0:04", title: "Highlight a sentence", body: "Select the line, open the side panel, and the passage comes with you." },
  { time: "0:16", title: "Answer a request", body: "Someone asked you to check this story. Pick Dispute and say what’s wrong." },
  { time: "0:36", title: "Publish with the source", body: "The post keeps a screenshot of the page and links back to the article." },
  { time: "0:41", title: "Clip a podcast", body: "The clip starts where you’re listening. Trim it to the second, up to 90 seconds." },
  { time: "1:10", title: "Play it in the post", body: "The audio clip plays right in the post, with the episode linked." },
  { time: "1:15", title: "Feed and requests", body: "Filter the feed by kind of take, and see requests get answered." },
];

export default function DemoVideoPage() {
  return (
    <div className="lp">
      <MarketingHeader current="demo" />
      <main>
        <section className="demo-hero">
          <h1 data-testid="text-demo-video-title">See a moment become a post in under a minute.</h1>
          <p>Recorded in the real extension and site: a news article, a podcast episode, the feed, and requests. Ninety seconds, no sound needed.</p>
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
