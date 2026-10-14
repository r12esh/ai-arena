import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Tri-Arena — 3-Model Live Comparison",
  description:
    "Compare 3 AI models head-to-head (2 Groq + 1 Google AI Studio) in real-time with simultaneous streaming.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${inter.className} dark`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen flex flex-col bg-background text-foreground antialiased font-sans"
        suppressHydrationWarning
      >
        <TooltipProvider delay={200}>
          {children}
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
