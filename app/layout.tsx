import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HydrHost — Emoji Phone Network",
  description:
    "HydrHost plug-in for Phone Service. Get your unique 8-block emoji phone number, manage contacts and dial anyone instantly.",
  keywords: ["phone", "emoji", "HydrHost", "communication", "signal generator"],
  authors: [{ name: "HydrHost" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased nature-bg min-h-screen">
        {children}
        <script src="https://www-infinity4.github.io/Mint-For-Infinity/infinity-wallet-menu.js" defer></script>
      </body>
    </html>
  );
}
