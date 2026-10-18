import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "American Atlas — A Day-by-Day Look at US Government";
const description = "Explore the U.S. House, Senate, executive branch, Supreme Court, and congressional leadership on any date since July 4, 1776.";
const socialImage = "/american-atlas-social-2026.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://congress.theojaffee.net"),
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "American Atlas",
    type: "website",
    images: [{
      url: socialImage,
      width: 1200,
      height: 630,
      type: "image/png",
      alt: "American Atlas House map with its control panel and timeline",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [socialImage],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F0EB" },
    { media: "(prefers-color-scheme: dark)", color: "#1F2124" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
