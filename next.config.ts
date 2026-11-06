import type { NextConfig } from "next";
import { legacyTitleRedirects } from "./lib/legacy-title-ids";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Old /title/<tmdb_id> links → /title/<media_type>/<tmdb_id> (real 308s).
  async redirects() {
    return legacyTitleRedirects();
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" },
    ],
  },
};

export default nextConfig;
