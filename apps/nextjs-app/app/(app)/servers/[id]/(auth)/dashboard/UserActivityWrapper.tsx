import type * as React from "react";
import { getDefaultStartDate, setEndDateToEndOfDay } from "@/dates";
import { getUserActivityPerDay } from "@/lib/db/users";
import type { ServerPublic } from "@/lib/types";
import { UserActivityChart } from "./UserActivityChart";

interface Props {
  server: ServerPublic;
  startDate: string;
  endDate: string;
}

export const UserActivityWrapper: React.FC<Props> = async ({
  server,
  startDate,
  endDate,
}) => {
  const data = await getUserActivityPerDay({
    serverId: server.id,
    startDate: startDate || getDefaultStartDate(),
    endDate: setEndDateToEndOfDay(endDate),
  });

  return <UserActivityChart data={data} />;
};
