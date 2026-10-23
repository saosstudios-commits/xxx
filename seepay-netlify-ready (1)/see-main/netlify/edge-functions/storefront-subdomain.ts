export default async (request: Request, context: { rewrite: (url: URL) => Promise<Response> }) => {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const platformDomain = "seepay.shop";

  // Only rewrite the root path for a vendor subdomain, not every URL.
  if (url.pathname !== "/" || !host.endsWith("." + platformDomain)) {
    return fetch(request);
  }

  const shop = host.slice(0, -(platformDomain.length + 1));
  const reserved = new Set(["www", "app", "dashboard", "api", "admin"]);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(shop) || reserved.has(shop)) {
    return fetch(request);
  }

  url.pathname = "/store.html";
  url.searchParams.set("shop", shop);
  return context.rewrite(url);
};
