"use client";

import { ChatDialog } from "./ChatDialog";

interface ChatDialogWrapperProps {
  chatConfigured: boolean;
}

export function ChatDialogWrapper({ chatConfigured }: ChatDialogWrapperProps) {
  return <ChatDialog chatConfigured={chatConfigured} />;
}

