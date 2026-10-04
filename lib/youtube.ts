const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

export function assertYouTubeUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("That does not look like a valid URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http(s) YouTube links are allowed.");
  }

  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) {
    throw new Error("Only YouTube links are supported.");
  }

  const path = parsed.pathname;
  const isWatch = path === "/watch" && parsed.searchParams.has("v");
  const isShort = path.startsWith("/shorts/");
  const isEmbed = path.startsWith("/embed/");
  const isLive = path.startsWith("/live/");
  const isYoutuBe = host.includes("youtu.be") && path.length > 1;

  if (!isWatch && !isShort && !isEmbed && !isLive && !isYoutuBe) {
    throw new Error("Paste a single video link (watch, shorts, or youtu.be).");
  }

  if (parsed.searchParams.has("list") && !parsed.searchParams.get("v")) {
    throw new Error("Playlists are not supported. Open one video and copy that link.");
  }

  return parsed.toString();
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "youtube-media";
}
