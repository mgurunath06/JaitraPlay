import type { IdentityProfile } from "./types";
export async function identityRequest(action: "get" | "save" | "delete", profile?: IdentityProfile) {
  if (window.jaitra) return window.jaitra.identity(action, profile);
  if (!import.meta.env.DEV) throw new Error("App bridge unavailable");
  const response = await fetch("/api/v1/identity/jaitra", {
    method: action === "get" ? "GET" : action === "save" ? "PUT" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: action === "save" ? JSON.stringify(profile) : undefined,
    signal: AbortSignal.timeout(5000), cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not access Jaitra’s saved profile");
  return response.json() as Promise<IdentityProfile | null | { saved?: boolean; deleted?: boolean }>;
}
