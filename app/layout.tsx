import type { Metadata } from "next";
import { Libre_Franklin, Newsreader } from "next/font/google";
import "./globals.css";

const sans = Libre_Franklin({ variable: "--font-sans", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-serif", subsets: ["latin"] });

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
      alt: "American Atlas timeline and Senate map",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [socialImage],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${sans.variable} ${serif.variable}`}>{children}</body></html>;
}
