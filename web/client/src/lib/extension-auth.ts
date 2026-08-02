export const ANNOTATED_EXTENSION_ID = "eaealcbiidjigfndjchchbnjdjicbajb";
export const EXTENSION_AUTH_FLOW_KEY = "annotated_extension_auth";
export const EXTENSION_AUTH_FLOW_MAX_AGE_MS = 10 * 60 * 1000;

export interface ExtensionAuthFlow {
  extensionId: typeof ANNOTATED_EXTENSION_ID;
  ts: number;
}

export function isAnnotatedExtensionId(value: unknown): value is typeof ANNOTATED_EXTENSION_ID {
  return value === ANNOTATED_EXTENSION_ID;
}

export function parseStoredExtensionAuthFlow(
  raw: string | null,
  now = Date.now(),
): ExtensionAuthFlow | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { extensionId?: unknown; ts?: unknown };
    if (!isAnnotatedExtensionId(parsed.extensionId)) return null;
    if (typeof parsed.ts !== "number" || !Number.isFinite(parsed.ts)) return null;
    if (parsed.ts > now + 60_000 || now - parsed.ts > EXTENSION_AUTH_FLOW_MAX_AGE_MS) return null;
    return { extensionId: ANNOTATED_EXTENSION_ID, ts: parsed.ts };
  } catch {
    return null;
  }
}
