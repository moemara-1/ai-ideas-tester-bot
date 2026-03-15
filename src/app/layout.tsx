import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "B2B Web Bot",
  description: "Autonomous idea intelligence and experiment orchestration platform",
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
