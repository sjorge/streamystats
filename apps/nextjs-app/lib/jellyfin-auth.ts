type JellyfinUserMeResponse = {
  Id?: string;
  Name?: string;
};

type JellyfinAuthenticateByNameResponse = {
  AccessToken?: string;
  ServerId?: string;
  User?: {
    Id?: string;
    Name?: string;
  };
};

export type JellyfinAuthUser = {
  id: string;
  name: string | null;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getUserFromEmbyToken(args: {
  serverUrl: string;
  token: string;
}): Promise<
  { ok: true; user: JellyfinAuthUser } | { ok: false; error: string }
> {
  const serverUrl = normalizeBaseUrl(args.serverUrl);
  const token = args.token.trim();
  if (!token) return { ok: false, error: "Empty X-Emby-Token" };

  try {
    const res = await fetch(`${serverUrl}/Users/Me`, {
      method: "GET",
      headers: {
        "X-Emby-Token": token,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      if (res.status === 401) {
        return { ok: false, error: "Invalid X-Emby-Token" };
      }
      return { ok: false, error: `Jellyfin returned ${res.status}` };
    }

    const json = (await res.json()) as JellyfinUserMeResponse;
    const id = asNonEmptyString(json.Id);
    if (!id) return { ok: false, error: "Jellyfin did not return a user id" };
    const name = asNonEmptyString(json.Name);

    return { ok: true, user: { id, name } };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Jellyfin request timed out" };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Jellyfin request failed",
    };
  }
}

export async function authenticateByName(args: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<
  | { ok: true; user: JellyfinAuthUser; accessToken: string | null }
  | { ok: false; error: string }
> {
  const serverUrl = normalizeBaseUrl(args.serverUrl);
  const username = args.username.trim();
  const password = args.password;

  if (!username || !password) {
    return { ok: false, error: "Username and password are required" };
  }

  try {
    const res = await fetch(`${serverUrl}/Users/AuthenticateByName`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Username: username, Pw: password }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      if (res.status === 401) {
        return { ok: false, error: "Invalid username or password" };
      }
      return { ok: false, error: `Jellyfin returned ${res.status}` };
    }

    const json = (await res.json()) as JellyfinAuthenticateByNameResponse;
    const id = asNonEmptyString(json.User?.Id);
    if (!id) return { ok: false, error: "Jellyfin did not return a user id" };
    const name = asNonEmptyString(json.User?.Name);
    const accessToken = asNonEmptyString(json.AccessToken);

    return { ok: true, user: { id, name }, accessToken };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Jellyfin request timed out" };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Jellyfin request failed",
    };
  }
}
