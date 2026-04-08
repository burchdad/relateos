import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RelateOS",
  description: "AI-native relationship intelligence command center"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
