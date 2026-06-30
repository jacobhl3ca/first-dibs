import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "First Dibs — shows by the artists you love",
  description: "Upcoming live shows near you by your favorite artists, with AI picks and voice previews.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
