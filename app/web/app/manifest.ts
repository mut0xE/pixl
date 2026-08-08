import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pixl",
    short_name: "Pixl",
    description: "Shared on-chain pixel canvas on Solana.",
    start_url: "/",
    display: "standalone",
    background_color: "#06070b",
    theme_color: "#06070b",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
