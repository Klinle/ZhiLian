"use client";

import React from "react";
import dynamic from "next/dynamic";

const FloatingChatAssistant = dynamic(
  () => import("@/components/floating-chat-assistant"),
  { ssr: false }
);

export default function ClientAssistantWrapper() {
  return <FloatingChatAssistant />;
}
