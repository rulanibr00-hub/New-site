export function publicSiteUrl(demo: boolean) {
  const configured = process.env.TOO_TURY_SITE_URL;
  if (demo || !configured) return undefined;

  try {
    const url = new URL(configured);
    return url.protocol === "https:" && url.href === `${url.origin}/` ? url : undefined;
  } catch {
    return undefined;
  }
}
