"use client";

import { Switch } from "@/components/ui/switch";
import {
  setShowAdminStatistics,
  showAdminStatistics,
} from "@/utils/adminTools";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";

export const ShowAdminStatisticsSwitch = ({
  isAdmin,
}: {
  isAdmin: boolean;
}) => {
  const [showAdminStats, setShowAdminStats] = useState(false);

  useEffect(() => {
    showAdminStatistics().then((hide) => {
      setShowAdminStats(hide);
    });
  }, []);

  const handleChange = async (checked: boolean) => {
    await setShowAdminStatistics(checked);
    setShowAdminStats(checked);
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex flex-row items-center gap-2 px-2">
      <Switch checked={showAdminStats} onCheckedChange={handleChange} />
      <Label className="text-xs opacity-50">Show Admin Statistics</Label>
    </div>
  );
};
