import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://casa-gastos-beto-mari.betoengmec.chatgpt.site"),
  title: "Casa — Gastos do casal",
  description: "Controle simples e compartilhado das despesas de Beto e Mari.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Casa", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "Casa — Gastos de Beto e Mari",
    description: "Gastos de Beto e Mari, simples e em dia.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Casa — Gastos de Beto e Mari" }],
  },
  twitter: { card: "summary_large_image", title: "Casa — Gastos de Beto e Mari", description: "Gastos de Beto e Mari, simples e em dia.", images: ["/og.png"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#17271f" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
