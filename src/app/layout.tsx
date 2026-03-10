import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "카페 메뉴 🌸",
  description: "봄 향기 가득한 카페 메뉴판",
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
