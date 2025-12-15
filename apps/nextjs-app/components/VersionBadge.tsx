export const VersionBadge = () => {
  const sha = process.env.NEXT_PUBLIC_COMMIT_SHA?.substring(0, 7);
  return (
    <div className="fixed bottom-2 right-2 z-[9999] pointer-events-none bg-gray-800 text-white text-xs px-2 py-1 rounded">
      <code suppressHydrationWarning>
        {process.env.NEXT_PUBLIC_VERSION ?? "unknown"}
        {sha && ` (${sha})`}
      </code>
    </div>
  );
};
