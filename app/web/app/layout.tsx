import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { PwaRegister } from "../components/PwaRegister";

export const metadata: Metadata = {
  title: "Pixl",
  description: "MagicBlock pixel canvas",
  applicationName: "Pixl",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pixl",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#06070b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
