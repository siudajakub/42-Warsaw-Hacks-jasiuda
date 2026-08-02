import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Emits a self-contained server bundle instead of shipping node_modules to
  // the TV box. Measured: 344MB image, against ~1.1GB for a naive copy.
  output: "standalone",
  poweredByHeader: false,
  // No `images` config on purpose: the avatar component renders a plain <img>
  // rather than next/image. The optimiser would add a round-trip through the
  // server for every face on the wall, and on a box with flaky uplink the
  // monogram fallback is what we actually want to see.
};

export default config;
