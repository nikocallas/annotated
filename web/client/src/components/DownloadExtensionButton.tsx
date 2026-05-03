import type { CSSProperties } from "react";

export const EXTENSION_DOWNLOAD_HREF = "/downloads/annotated-extension.zip";
export const EXTENSION_DOWNLOAD_FILENAME = "annotated-extension.zip";

export function ChromeLogo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden
    >
      <circle cx="24" cy="24" r="11.5" fill="#fff" />
      <path
        fill="#1a73e8"
        d="M24 12.5h17.5A20 20 0 0 0 6.7 14l8.6 14.7A11.5 11.5 0 0 1 24 12.5z"
      />
      <path
        fill="#34a853"
        d="M14.1 30.3 5.6 15.6A20 20 0 0 0 19 43.6l8.6-14.7a11.5 11.5 0 0 1-13.5-1.6"
        opacity=".95"
      />
      <path
        fill="#fbbc04"
        d="M28.7 35.5 20.1 43.7A20 20 0 0 0 43.7 14H26a11.5 11.5 0 0 1 2.7 21.5"
        opacity=".95"
      />
      <circle cx="24" cy="24" r="6" fill="#1a73e8" />
    </svg>
  );
}

export function DownloadExtensionButton({
  size = "md",
  variant = "primary",
  label = "Download Chrome Extension",
  className = "",
  style,
}: {
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "outline";
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const sizeClasses =
    size === "lg"
      ? "px-6 py-3 text-base gap-3"
      : size === "sm"
      ? "px-3 py-1.5 text-sm gap-2"
      : "px-4 py-2 text-sm gap-2";

  const variantClasses =
    variant === "outline"
      ? "border border-border bg-background text-foreground hover:bg-foreground/5"
      : "bg-primary text-primary-foreground hover:opacity-95";

  const iconSize = size === "lg" ? 22 : size === "sm" ? 16 : 18;

  return (
    <a
      href={EXTENSION_DOWNLOAD_HREF}
      download={EXTENSION_DOWNLOAD_FILENAME}
      className={`inline-flex items-center justify-center rounded-md font-semibold transition-shadow shadow-sm hover:shadow-md ${sizeClasses} ${variantClasses} ${className}`}
      style={style}
      data-testid="button-download-extension"
      aria-label="Download Chrome extension"
    >
      <ChromeLogo size={iconSize} />
      <span>{label}</span>
    </a>
  );
}
