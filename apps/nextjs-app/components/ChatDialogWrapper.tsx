"use client";

import type { User } from "@/lib/types";
import { ChatDialog } from "./ChatDialog";

interface ChatDialogWrapperProps {
  chatConfigured: boolean;
  me?: User;
  serverUrl?: string;
}

export function ChatDialogWrapper({
  chatConfigured,
  me,
  serverUrl,
}: ChatDialogWrapperProps) {
  return (
    <ChatDialog chatConfigured={chatConfigured} me={me} serverUrl={serverUrl} />
  );
}
