import { Silkscreen, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--silkscreen-font",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--jetbrains-font",
});

export const metadata = { title: "Pixl", description: "MagicBlock pixel canvas" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${silkscreen.variable} ${jetbrainsMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
