import type { MetadataRoute } from "next";
import { SAMPLE_USERNAMES } from "@/lib/samples";

import { siteUrl } from "@/lib/site";

const BASE = siteUrl();

// Home + the showcase profiles (indexable example cards). Per-user pages are
// generated on demand, so they aren't enumerated here.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    ...SAMPLE_USERNAMES.map((username) => ({
      url: `${BASE}/${username}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
