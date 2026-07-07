import type { Metadata } from "next";
import "./globals.css";
import ClientAssistantWrapper from "@/components/client-assistant-wrapper";

export const metadata: Metadata = {
  title: "CogniLink",
  description: "Your intelligent knowledge management and learning companion",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className="antialiased bg-background text-foreground"
      >
        {children}
        <ClientAssistantWrapper />
      </body>
    </html>
  );
}
