import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { ToastContainer } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "AuraWork - Workforce & Attendance Portal",
  description: "Production-ready workforce attendance and leaves tracker for agencies and small businesses.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          {children}
          <ToastContainer />
        </Providers>
      </body>
    </html>
  );
}
