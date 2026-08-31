import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const siteUrl = "https://www-infinity4.github.io/Hydrhost/";
const previewUrl = `${siteUrl}share-preview.svg`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "HydrHost — Emoji Phone Network",
  description:
    "HydrHost plug-in for Phone Service. Get your unique 8-block emoji phone number, manage contacts and dial anyone instantly.",
  keywords: ["phone", "emoji", "HydrHost", "communication", "signal generator"],
  authors: [{ name: "HydrHost" }],
  alternates: { canonical: siteUrl },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "HydrHost — Emoji Phone Network",
    description: "A phone-first HydrHost signal and communication experiment.",
    siteName: "HydrHost",
    images: [{ url: previewUrl, width: 1200, height: 630, alt: "HydrHost — Emoji Phone Network" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "HydrHost — Emoji Phone Network",
    description: "A phone-first HydrHost signal and communication experiment.",
    images: [previewUrl],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased nature-bg min-h-screen">
        {children}
        <Script src="https://www-infinity4.github.io/Mint-For-Infinity/unified-wallet.js?v=20260831-game-rewards1" strategy="afterInteractive" />
        <Script
          src="https://www-infinity4.github.io/Mint-For-Infinity/site-community.js?v=20260831-storage2"
          strategy="afterInteractive"
          data-site-id="HYDRHOST"
          data-site-title="HydrHost"
          data-share-url={siteUrl}
        />
      </body>
    </html>
  );
}
