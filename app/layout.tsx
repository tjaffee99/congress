import type { Metadata } from "next";
import { Libre_Franklin, Newsreader } from "next/font/google";
import "./globals.css";

const sans = Libre_Franklin({ variable: "--font-sans", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "American Atlas — A Day-by-Day Look at US Government",
  description: "Explore the U.S. House, Senate, executive branch, Supreme Court, and congressional leadership on any date since March 4, 1789.",
  openGraph: { title: "American Atlas", description: "A day-by-day look at US government", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${sans.variable} ${serif.variable}`}>{children}</body></html>;
}
