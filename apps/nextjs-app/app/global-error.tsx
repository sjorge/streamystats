"use client";

import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect } from "react";

type Props = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function GlobalError({ error, reset }: Props) {
  // Avoid logging in production builds; keep this effect minimal.
  useEffect(() => {
    void error;
  }, [error]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  const handleGoToSetup = useCallback(() => {
    window.location.href = "/setup";
  }, []);

  return (
    <html lang="en">
      <body style={{ backgroundColor: "#0A0A0A" }}>
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg bg-gray-900 p-8 shadow-lg border border-gray-800">
            <div className="text-center">
              <h2 className="mb-2 text-xl font-semibold text-white">
                Something went wrong
              </h2>
              <p className="mb-6 text-gray-300">
                An unexpected error occurred. Please try again.
              </p>
              <div className="space-y-3">
                <Button
                  onClick={handleReset}
                  className="w-full"
                  variant="default"
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
                <Button
                  onClick={handleGoToSetup}
                  className="w-full"
                  variant="outline"
                >
                  Go to Setup
                </Button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

