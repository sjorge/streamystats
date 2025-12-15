"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import React, { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);

    // Define a state variable to track whether there is an error or not
    this.state = {
      hasError: false,
      error: undefined,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // You can use your own error logging service here
    console.error({ error, errorInfo });
  }

  render(): ReactNode {
    // Check if the error is thrown
    if (this.state.hasError) {
      // You can render any custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage =
        this.state.error?.toString() || "Unknown error occurred";
      const stackTrace = this.state.error?.stack || "";

      // Create GitHub issue URL with pre-filled information
      const issueTitle = encodeURIComponent(
        `Error: ${errorMessage.substring(0, 100)}`,
      );
      const issueBody = encodeURIComponent(
        `## Error Details\n\`\`\`\n${errorMessage}\n\n${stackTrace}\n\`\`\`\n\n## Steps to Reproduce\n1. \n2. \n3. \n\n## Additional Information\n`,
      );
      const newIssueUrl = `https://github.com/fredrikburmester/streamystats/issues/new?title=${issueTitle}&body=${issueBody}`;

      return (
        <div className="flex flex-col items-center justify-center min-h-[90svh] bg-black text-white w-full">
          <h1 className="text-3xl font-extrabold mb-2">Error</h1>

          <div className="max-w-md text-center mb-8">
            <p className="mb-4 text-sm">
              The application encountered an unexpected error. Try refreshing or
              submit an issue.
            </p>

            <div className="bg-gray-800 p-4 rounded-md mb-6 max-h-56 overflow-auto">
              <pre className="text-left text-sm text-gray-300 whitespace-pre-wrap">
                {errorMessage}
                {stackTrace && `\n\n${stackTrace}`}
              </pre>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button variant={"default"}>
              <Link
                href={newIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Submit GitHub Issue
              </Link>
            </Button>

            <Button variant={"outline"}>
              <Link href="/">Go Back Home</Link>
            </Button>
          </div>
        </div>
      );
    }

    // Return children components in case of no error
    return this.props.children;
  }
}

export default ErrorBoundary;
