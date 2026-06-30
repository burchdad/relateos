import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teifke / Relationships",
  description: "AI-native relationship intelligence command center"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  );
}
