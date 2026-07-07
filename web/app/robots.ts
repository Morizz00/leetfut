import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

const BASE = siteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
