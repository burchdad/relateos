import type { Metadata } from "next";
import SidebarNav from "@/components/SidebarNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "RelateOS",
  description: "AI-native relationship intelligence command center"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
          <SidebarNav />
          <main className="min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
