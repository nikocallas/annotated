import type { CSSProperties } from "react";

// The Chrome Web Store listing is the canonical install path. VITE_CHROME_WEB_STORE_URL
// overrides the baked-in default (e.g. for staging listings). The packaged zip remains
// only as an internal fallback if the env var is somehow set to empty — visible copy
// must never instruct users to download or sideload it.
export const EXTENSION_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/annotated/eaealcbiidjigfndjchchbnjdjicbajb";
export const EXTENSION_DOWNLOAD_FALLBACK_HREF = "/downloads/annotated-extension.zip";
export const EXTENSION_DOWNLOAD_FILENAME = "annotated-extension.zip";
export const CHROME_ICON_SRC = "/chrome-icon.png";

const STORE_URL_OVERRIDE = (import.meta.env.VITE_CHROME_WEB_STORE_URL as string | undefined)?.trim();
const RESOLVED_STORE_URL =
  STORE_URL_OVERRIDE && STORE_URL_OVERRIDE.length > 0
    ? STORE_URL_OVERRIDE
    : EXTENSION_WEB_STORE_URL;
export const EXTENSION_INSTALL_HREF = RESOLVED_STORE_URL || EXTENSION_DOWNLOAD_FALLBACK_HREF;
export const EXTENSION_IS_STORE_LINK = Boolean(RESOLVED_STORE_URL);

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
  label = "Get the Chrome Extension",
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

  const linkProps = EXTENSION_IS_STORE_LINK
    ? { target: "_blank", rel: "noopener noreferrer" as const }
    : { download: EXTENSION_DOWNLOAD_FILENAME };

  return (
    <a
      href={EXTENSION_INSTALL_HREF}
      {...linkProps}
      className={`inline-flex items-center justify-center rounded-md font-semibold transition-shadow shadow-sm hover:shadow-md ${sizeClasses} ${variantClasses} ${className}`}
      style={style}
      data-testid="button-download-extension"
      aria-label="Get the Chrome extension"
    >
      <ChromeLogo size={iconSize} />
      <span>{label}</span>
    </a>
  );
}
