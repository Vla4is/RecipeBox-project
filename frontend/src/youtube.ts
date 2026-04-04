export function getYouTubeVideoId(value: string | null | undefined): string | null {
  if (!value) return null;

  const input = value.trim();
  if (!input) return null;

  const directMatch = input.match(/^[a-zA-Z0-9_-]{11}$/);
  if (directMatch) return directMatch[0];

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const candidate = url.pathname.split("/").filter(Boolean)[0];
      return candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery && /^[a-zA-Z0-9_-]{11}$/.test(fromQuery)) return fromQuery;

      const segments = url.pathname.split("/").filter(Boolean);
      const embedIndex = segments.findIndex((segment) => segment === "embed" || segment === "shorts" || segment === "live");
      if (embedIndex >= 0) {
        const candidate = segments[embedIndex + 1];
        return candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function getYouTubeEmbedUrl(value: string | null | undefined): string | null {
  const videoId = getYouTubeVideoId(value);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

export function getYouTubeThumbnailUrl(value: string | null | undefined): string | null {
  const videoId = getYouTubeVideoId(value);
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
}
