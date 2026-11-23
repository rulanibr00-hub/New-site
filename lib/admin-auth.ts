import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_SECONDS, revokeAdminToken, validateAdminToken, verifyPasswordAndCreateSession } from "./admin-credentials.mjs";

const secureCookie = "__Host-too-tury-admin";
const localCookie = "too-tury-admin-local";

function loopbackHost(host: string) {
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/i.test(host);
}

async function requestHost() {
  const request = await headers();
  return (request.get("x-forwarded-host") ?? request.get("host") ?? "").toLowerCase();
}

export async function adminActionOrigin() {
  const request = await headers();
  const rawOrigin = request.get("origin");
  if (!rawOrigin) return null;

  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    return null;
  }
  if (origin.origin !== rawOrigin || origin.host !== await requestHost()) return null;
  if (origin.protocol !== "https:" && (origin.protocol !== "http:" || !loopbackHost(origin.host))) return null;

  return origin;
}

export async function isAdmin() {
  try {
    const jar = await cookies();
    const token = jar.get(secureCookie)?.value;
    if (token) return validateAdminToken(token);
    if (loopbackHost(await requestHost())) return validateAdminToken(jar.get(localCookie)?.value);
  } catch {
    // Requests fail closed when session storage is unavailable.
  }
  return false;
}

export async function requireAdmin() {
  if (!await isAdmin()) redirect("/admin/login");
}

export async function requireAdminAction() {
  if (!await adminActionOrigin()) throw new Error("Запрос отклонён.");
  await requireAdmin();
}

function cookieOptions(origin: URL) {
  return {
    secure: origin.protocol === "https:",
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
  };
}

export async function startAdminSession(password: string, origin: URL) {
  const result = await verifyPasswordAndCreateSession(password);
  if (result.status !== "ok" || !result.token) return result.status;

  const jar = await cookies();
  const options = cookieOptions(origin);
  jar.set(options.secure ? secureCookie : localCookie, result.token, { ...options, maxAge: ADMIN_SESSION_SECONDS });
  return result.status;
}

export async function endAdminSession(origin: URL) {
  const jar = await cookies();
  const options = cookieOptions(origin);
  const name = options.secure ? secureCookie : localCookie;
  revokeAdminToken(jar.get(name)?.value);
  jar.set(name, "", { ...options, maxAge: 0 });
}
