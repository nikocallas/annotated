import type { Request } from "express";
import {
  createClient,
  type Session,
  type SupabaseClient,
  type User as SupabaseUser,
} from "@supabase/supabase-js";
import type { User } from "@shared/schema";
import { storage as defaultStorage, type IStorage } from "./storage";

export class ApiAuthError extends Error {
  constructor(
    readonly statusCode: 401 | 403 | 503,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "ApiAuthError";
  }
}

export interface RefreshedAuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

export interface AuthService {
  optionalActor(req: Request): Promise<User | undefined>;
  requireActor(req: Request): Promise<User>;
  synchronizeActor(req: Request): Promise<User>;
  refreshSession(refreshToken: string): Promise<RefreshedAuthSession>;
  deleteIdentity(user: User): Promise<void>;
}

function bearerToken(req: Request): string | null {
  const header = req.header("authorization")?.trim() ?? "";
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) {
    throw new ApiAuthError(401, "Invalid authorization header");
  }
  return match[1].trim();
}

function providerFor(user: SupabaseUser): "x" | "google" {
  const raw = String(user.app_metadata?.provider ?? "").toLowerCase();
  if (raw === "twitter" || raw === "x") return "x";
  if (raw === "google") return "google";
  throw new ApiAuthError(403, "Only Google and X accounts are supported");
}

function profileFields(user: SupabaseUser) {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (metadata.full_name as string | undefined) ||
    (metadata.name as string | undefined) ||
    (metadata.user_name as string | undefined) ||
    (user.email ? user.email.split("@")[0] : undefined) ||
    "Annotated user";
  const rawHandle =
    (metadata.user_name as string | undefined) ||
    (metadata.preferred_username as string | undefined) ||
    (user.email ? user.email.split("@")[0] : undefined) ||
    user.id.slice(0, 8);
  const username =
    rawHandle.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) ||
    `user${user.id.replace(/-/g, "").slice(0, 8)}`;
  const avatarUrl =
    (metadata.avatar_url as string | undefined) ||
    (metadata.picture as string | undefined) ||
    null;
  return { displayName: displayName.slice(0, 100), username, avatarUrl };
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error
    && (error as { code?: unknown }).code === "23505";
}

export function createAuthService(
  appStorage: IStorage = defaultStorage,
  options: {
    supabaseUrl?: string;
    publishableKey?: string;
    client?: SupabaseClient;
    serviceRoleKey?: string;
  } = {},
): AuthService {
  const url = options.supabaseUrl ?? process.env.SUPABASE_URL;
  const key = options.publishableKey ?? process.env.SUPABASE_ANON_KEY;
  const client = options.client ?? (url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null);
  const serviceRoleKey = options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  function configuredClient(): SupabaseClient {
    if (!client) {
      throw new ApiAuthError(503, "Authentication is not configured");
    }
    return client;
  }

  async function verifiedUser(accessToken: string): Promise<SupabaseUser> {
    const { data, error } = await configuredClient().auth.getUser(accessToken);
    if (error || !data.user) {
      throw new ApiAuthError(401, "Invalid or expired session");
    }
    providerFor(data.user);
    return data.user;
  }

  async function existingAppUser(user: SupabaseUser): Promise<User | undefined> {
    const provider = providerFor(user);
    return appStorage.getUserByAuth(provider, user.id);
  }

  async function synchronize(user: SupabaseUser): Promise<User> {
    const provider = providerFor(user);
    const existing = await existingAppUser(user);
    if (existing) return existing;

    const profile = profileFields(user);
    for (let attempt = 0; attempt < 8; attempt++) {
      const suffix = user.id.replace(/-/g, "").slice(0, 6 + Math.min(attempt, 4));
      const username = attempt === 0
        ? profile.username
        : `${profile.username.slice(0, Math.max(1, 29 - suffix.length))}_${suffix}`;
      const taken = await appStorage.getUserByUsername(username);
      if (taken) continue;
      try {
        return await appStorage.createUser({
          username,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          bio: null,
          authProvider: provider,
          authId: user.id,
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // A simultaneous website/extension callback may have inserted this
        // exact identity after our first read. Treat that committed row as
        // success; otherwise retry with the next deterministic username.
        const raced = await existingAppUser(user);
        if (raced) return raced;
      }
    }
    throw new ApiAuthError(503, "Unable to complete sign-in");
  }

  async function actorFromRequest(req: Request, createIfMissing: boolean): Promise<User | undefined> {
    const token = bearerToken(req);
    if (!token) return undefined;
    const authUser = await verifiedUser(token);
    const appUser = await existingAppUser(authUser);
    if (appUser) return appUser;
    if (createIfMissing) return synchronize(authUser);
    throw new ApiAuthError(403, "Complete sign-in before using this action");
  }

  async function resultForSession(session: Session | null): Promise<RefreshedAuthSession> {
    if (!session?.access_token || !session.refresh_token || !session.user) {
      throw new ApiAuthError(401, "Unable to refresh session");
    }
    const user = await synchronize(session.user);
    return {
      user,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ?? null,
    };
  }

  return {
    optionalActor(req) {
      return actorFromRequest(req, false);
    },
    async requireActor(req) {
      const actor = await actorFromRequest(req, false);
      if (!actor) throw new ApiAuthError(401, "Sign in required");
      return actor;
    },
    async synchronizeActor(req) {
      const actor = await actorFromRequest(req, true);
      if (!actor) throw new ApiAuthError(401, "Sign in required");
      return actor;
    },
    async refreshSession(refreshToken) {
      if (!refreshToken) throw new ApiAuthError(401, "Refresh token required");
      const { data, error } = await configuredClient().auth.refreshSession({ refresh_token: refreshToken });
      if (error) throw new ApiAuthError(401, "Unable to refresh session");
      return resultForSession(data.session);
    },
    async deleteIdentity(user) {
      if (!url || !serviceRoleKey) throw new ApiAuthError(503, "Account deletion is not configured");
      const admin = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await admin.auth.admin.deleteUser(user.authId);
      if (error) throw new ApiAuthError(503, "Unable to delete OAuth identity");
    },
  };
}

export const authService = createAuthService();
