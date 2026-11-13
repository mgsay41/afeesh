import type { Metadata, Viewport } from "next";
import { Cairo, Lalezar } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const cairo = Cairo({ variable: "--font-cairo", subsets: ["arabic", "latin"], weight: ["400", "600", "700", "800", "900"] });
const lalezar = Lalezar({ variable: "--font-lalezar", subsets: ["arabic", "latin"], weight: "400" });

export const metadata: Metadata = {
  title: "أفيش — خمّن الفيلم من الممثلين",
  description: "لعبة جماعية: خمّن الفيلم أو المسلسل المصري من أسماء وصور الممثلين.",
  applicationName: "أفيش",
};

export const viewport: Viewport = {
  themeColor: "#120a24",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${lalezar.variable} antialiased`}>
      <body>
        <div className="stage-bg" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
