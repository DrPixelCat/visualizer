import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apex Pathing",
  description: "2D trajectory visualizer and editor for autonomous robots.",
};

// Root shell keeps browser chrome locked while the editor owns all scrolling.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden bg-[var(--background)] text-slate-200">
        {children}
      </body>
    </html>
  );
}
