import { useCallback, useState } from "react";

type ToastType = "default" | "destructive";

interface Toast {
  id: string;
  title: string;
  description?: string;
  type?: ToastType;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    ({ title, description, type = "default" }: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, title, description, type }]);

      // Auto remove after 5 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    [],
  );

  const success = useCallback(
    (description: string) => {
      addToast({
        title: "Success",
        description,
        type: "default",
      });
    },
    [addToast],
  );

  const error = useCallback(
    (description: string) => {
      addToast({
        title: "Error",
        description,
        type: "destructive",
      });
    },
    [addToast],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { success, error, dismiss, toasts };
}
