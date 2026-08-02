import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./scenes.css";

export const metadata: Metadata = {
  title: "42 HIGHLIGHTS — 42 Warsaw",
  description:
    "Projects completed, peers helping and campus life at 42 Warsaw — live on the Social Space wall.",
  icons: { icon: "/brand/42-warsaw.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e3e7ef",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
