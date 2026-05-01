import { Link } from "wouter";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2 hover-elevate rounded-md px-2 py-1 -ml-2" data-testid="link-home">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="annotated"
      >
        <rect x="3" y="3" width="26" height="26" rx="6" fill="hsl(var(--primary))" />
        <path
          d="M10 22L13 10H15.5L18.5 22M11.5 18H17"
          stroke="hsl(var(--primary-foreground))"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="22.5" cy="22" r="2" fill="hsl(var(--primary-foreground))" />
      </svg>
      <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
        annotated
      </span>
    </Link>
  );
}
