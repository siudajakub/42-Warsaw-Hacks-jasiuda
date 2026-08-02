import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  { ignores: [".next/**", "node_modules/**", "docs/**", "public/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // The wall renders intra avatars from a remote CDN and monogram
      // fallbacks; next/image adds an optimiser round-trip we do not want on a
      // box that may be offline. Plain <img> is deliberate here.
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
