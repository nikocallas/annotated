import { Link } from "wouter";

export function QuoteMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg shrink-0"
      style={{
        width: size,
        height: size,
        background: "var(--gradient-primary)",
        boxShadow: "var(--shadow-primary)",
      }}
      aria-hidden
    >
      <svg
        width={Math.round(size * 0.7)}
        height={Math.round(size * 0.7)}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Stylized double quotation mark */}
        <path
          d="M9 8.5c-2.6 1.4-4.4 3.9-4.4 7.5v8h7v-8H7.6c0-2.4 1.1-4.1 3.1-5.2L9 8.5zM21 8.5c-2.6 1.4-4.4 3.9-4.4 7.5v8h7v-8h-4c0-2.4 1.1-4.1 3.1-5.2L21 8.5z"
          fill="hsl(var(--primary-foreground))"
        />
      </svg>
    </span>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 hover-elevate rounded-md px-2 py-1 -ml-2"
      data-testid="link-home"
    >
      <QuoteMark size={size} />
      <span
        className="text-lg font-semibold tracking-tight"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        Annotated
      </span>
    </Link>
  );
}
