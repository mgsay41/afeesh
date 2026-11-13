import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "أفيش — خمّن الفيلم",
    short_name: "أفيش",
    description: "لعبة جماعية: خمّن الفيلم أو المسلسل المصري من الممثلين",
    start_url: "/",
    display: "standalone",
    background_color: "#120a24",
    theme_color: "#120a24",
    lang: "ar",
    dir: "rtl",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
