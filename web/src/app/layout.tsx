import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "everything - 모든 로컬 서비스, 하나의 검색",
  description: "AI 에이전트를 위한 로컬 데이터 인프라",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
