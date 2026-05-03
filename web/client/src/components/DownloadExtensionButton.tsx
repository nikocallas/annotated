import type { CSSProperties } from "react";

export const EXTENSION_DOWNLOAD_HREF = "/downloads/annotated-extension.zip";
export const EXTENSION_DOWNLOAD_FILENAME = "annotated-extension.zip";
export const CHROME_ICON_SRC = "/chrome-icon.jpg";

export function ChromeLogo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <img
      src={CHROME_ICON_SRC}
      width={size}
      height={size}
      className={className}
      alt="Chrome browser logo"
      loading="eager"
      decoding="async"
      style={{ display: "inline-block" }}
    />
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
