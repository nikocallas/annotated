import { Link } from "wouter";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2 hover-elevate rounded-md px-2 py-1 -ml-2" data-testid="link-home">
      <span
        className="inline-flex items-center justify-center rounded-lg"
        style={{
          width: size,
          height: size,
          background: "var(--gradient-primary)",
          boxShadow: "var(--shadow-primary)",
        }}
        aria-label="annotated"
      >
        <svg
          width={Math.round(size * 0.7)}
          height={Math.round(size * 0.7)}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M8 24L13 7H17L22 24M10.5 19H19.5"
            stroke="hsl(var(--primary-foreground))"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="25" cy="22.5" r="1.8" fill="hsl(var(--primary-foreground))" />
        </svg>
      </span>
      <span
        className="text-lg font-semibold tracking-tight"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        annotated
      </span>
    </Link>
  );
}
