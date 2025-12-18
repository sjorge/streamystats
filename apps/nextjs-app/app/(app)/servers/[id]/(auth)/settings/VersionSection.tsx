export const VersionSection = () => {
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-semibold mb-4">Version Information</h2>
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Version</p>
            <p className="font-mono text-foreground bg-muted px-2 py-1 rounded-md inline-block">
              {process.env.NEXT_PUBLIC_VERSION || "Not available"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">
              Commit SHA
            </p>
            <p className="font-mono text-foreground bg-muted px-2 py-1 rounded-md inline-block">
              {process.env.NEXT_PUBLIC_COMMIT_SHA?.substring(0, 7) ||
                "Not available"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
