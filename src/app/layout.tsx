import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "JBIQ Commerce — Household List",
  description: "V1 prototype: household shopping list with voice input via Sarvam STT.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)",  color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {/* Phone bezel on desktop so the prototype looks like a mobile app */}
        <div className="flex min-h-dvh flex-col md:items-center md:justify-center md:bg-neutral-100">
          <div
            className={[
              "flex w-full flex-1 flex-col overflow-hidden bg-white",
              "md:flex-none md:h-[844px] md:w-[390px] md:rounded-[3rem]",
              "md:shadow-[0_0_0_12px_#1c1c1e,0_32px_64px_rgba(0,0,0,0.18)]",
            ].join(" ")}
          >
            <ThemeProvider>{children}</ThemeProvider>
          </div>
        </div>
      </body>
    </html>
  );
}
