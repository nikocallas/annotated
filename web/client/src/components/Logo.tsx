export function QuoteMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[7px] shrink-0"
      style={{
        width: size,
        height: size,
        background: "var(--gradient-primary)",
        boxShadow: "var(--shadow-primary)",
      }}
      aria-hidden
    >
      {/* Highlighter over a highlighted line of text: Jason's original
          annotated.com idea was a yellow highlighter. */}
      <svg
        width={Math.round(size * 0.82)}
        height={Math.round(size * 0.82)}
        viewBox="4 4 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ color: "hsl(var(--background))" }}
      >
          <rect x="12" y="15" width="30" height="5" rx="2.5" fill="currentColor" opacity="0.55"/>
          <rect x="9" y="26" width="38" height="13" rx="3" fill="#FFE24A"/>
          <rect x="12" y="30" width="32" height="5" rx="2.5" fill="#1A1D2E"/>
          <rect x="12" y="45" width="22" height="5" rx="2.5" fill="currentColor" opacity="0.55"/>
          <g transform="translate(47 37) rotate(35)">
            <rect x="-4.5" y="-21" width="9" height="15" rx="2" fill="currentColor"/>
            <path d="M-4.5 -6h9l-2 6h-5z" fill="currentColor"/>
            <path d="M-2.5 0h5l-1.2 3h-2.6z" fill="#FFE24A" stroke="currentColor" strokeWidth="1"/>
          </g>
      </svg>
    </span>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  // Use a plain anchor with an absolute path so the link always navigates to
  // the landing page (`/`), regardless of whether the surrounding app uses
  // wouter's hash router or path router. Inside the hash-routed feed app,
  // wouter's <Link href="/"> would otherwise produce `#/`, which keeps the
  // user on the feed instead of returning to the landing page.
  return (
    <a
      href="/"
      className="inline-flex min-h-11 items-center gap-2 hover-elevate rounded-md px-2 py-1 -ml-2"
      data-testid="link-home"
      aria-label="Annotated home"
    >
      <QuoteMark size={size} />
      <span className="text-[1.0625rem] font-bold tracking-[-0.02em]">Annotated</span>
    </a>
  );
}
