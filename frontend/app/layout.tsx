import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Night Shift",
  description: "Autonomous issue-to-PR workflow UI built with Next.js App Router.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased light" style={{ colorScheme: "light" }}>
      <body className="flex min-h-full flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
