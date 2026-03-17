import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "게으른 메뉴판 — Lazy Menu",
  description: "말 한마디로 메뉴판을 바꾸세요. 카페 사장님을 위한 음성 인식 메뉴 관리 솔루션.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
