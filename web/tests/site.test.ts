import { afterEach, describe, expect, it, vi } from "vitest";
import { siteHost, siteUrl } from "@/lib/site";

describe("siteUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses NEXT_PUBLIC_SITE_URL when set", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://leetfut-eta.vercel.app");
    expect(siteUrl()).toBe("https://leetfut-eta.vercel.app");
  });

  it("normalizes a host without a scheme", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "leetfut-eta.vercel.app");
    expect(siteUrl()).toBe("https://leetfut-eta.vercel.app");
  });

  it("strips a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://leetfut-eta.vercel.app/");
    expect(siteUrl()).toBe("https://leetfut-eta.vercel.app");
  });

  it("derives the host for display", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://leetfut-eta.vercel.app");
    expect(siteHost()).toBe("leetfut-eta.vercel.app");
  });
});
