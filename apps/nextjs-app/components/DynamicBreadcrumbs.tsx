"use client";

import { getUserById } from "@/lib/db/users";
import { basePath } from "@/lib/utils";
import { House } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";

const _map: Record<string, string> = {
  "backup-and-import": "Backup & Import",
  "database-backup-restore": "Database Backup & Restore",
  "jellystats-import": "Jellystats Import",
  "playback-reporting-import": "Playback Reporting Import",
  settings: "Settings",
  activities: "Activities",
  history: "History",
  items: "Items",
  users: "Users",
  library: "Library",
  dashboard: "Dashboard",
  watchtime: "Watchtime",
  chat: "AI Chat",
  ai: "AI Recommendations",
  general: "General",
  security: "Security",
};

export const DynamicBreadcrumbs: React.FC = () => {
  const params = useParams();
  const { id } = params as { id: string };
  const pathname = usePathname();
  const [dynamicLabels, setDynamicLabels] = useState<Record<string, string>>(
    {},
  );

  const pathSegments = pathname
    .split("/")
    .filter((segment) => segment)
    .slice(2);

  useEffect(() => {
    const fetchDynamicLabels = async () => {
      const labels: Record<string, string> = {};
      for (let i = 0; i < pathSegments.length; i++) {
        const segment = pathSegments[i];
        const prevSegment = pathSegments[i - 1];

        // Fetch user name if previous segment is "users"
        if (prevSegment === "users" && !_map[segment]) {
          const user = await getUserById({ userId: segment, serverId: id });
          if (user?.name) {
            labels[segment] = user.name;
          }
        }
      }
      if (Object.keys(labels).length > 0) {
        setDynamicLabels(labels);
      }
    };

    fetchDynamicLabels();
  }, [pathname, id, pathSegments.join("/")]);

  const getLabel = (segment: string): string => {
    return dynamicLabels[segment] || _map[segment] || segment;
  };

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href={`${basePath}/servers/${id}/dashboard`}>
            <House className="h-4 w-4 ml-1" />
          </BreadcrumbLink>
        </BreadcrumbItem>
        {pathSegments.map((segment, index) => {
          const url = `${basePath}/servers/${id}/${pathSegments
            .slice(0, index + 1)
            .join("/")}`;
          return (
            <React.Fragment key={url}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={url}>{getLabel(segment)}</BreadcrumbLink>
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
