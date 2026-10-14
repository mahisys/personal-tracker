import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Command Center",
    short_name: "Command",
    description: "Personal, MahiSys and Loan DSA in one place",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5ff",
    theme_color: "#6d5df6",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add task", url: "/tasks?new=1" },
      { name: "Add expense", url: "/books?new=expense" },
      { name: "New loan file", url: "/dsa?new=1" },
    ],
  };
}
