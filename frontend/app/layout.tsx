import type { Metadata } from "next";
import "./globals.css";
import ClientAssistantWrapper from "@/components/client-assistant-wrapper";

export const metadata: Metadata = {
  title: "CogniLink · 知链",
  description: "大模型应用工程敏捷实训系统 — 一站式自适应 LLMOps 智慧学习与代码实操平台",
  icons: {
    icon: "/logo.png",
  },
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
