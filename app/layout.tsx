import type { Metadata } from "next";
import { Libre_Franklin, Newsreader } from "next/font/google";
import "./globals.css";

const sans = Libre_Franklin({ variable: "--font-sans", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "American State — A Day-by-Day Atlas of U.S. Government",
  description: "Explore the U.S. House, Senate, executive branch, Supreme Court, and congressional leadership on any date since March 4, 1789.",
  openGraph: { title: "American State", description: "Who governed America on this day?", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${sans.variable} ${serif.variable}`}>{children}</body></html>;
}
