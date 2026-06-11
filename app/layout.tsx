import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KEIBA ROYALE | みんなで遊べる競馬ベッティング",
  description:
    "歴代の名馬たちが走る！友達とポイントを賭けて遊べる競馬シミュレーションゲーム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
