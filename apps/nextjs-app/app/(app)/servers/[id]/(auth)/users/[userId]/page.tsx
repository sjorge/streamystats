import { Container } from "@/components/Container";
import { PageTitle } from "@/components/PageTitle";
import { getUserHistory } from "@/lib/db/history";
import { getServer } from "@/lib/db/server";
import { getMostWatchedItems } from "@/lib/db/statistics";
import {
  getUserById,
  getUserGenreStats,
  getUserWatchStats,
  getWatchTimePerWeekDay,
} from "@/lib/db/users";
import { formatDuration } from "@/lib/utils";
import { showAdminStatistics } from "@/utils/adminTools";
import { redirect } from "next/navigation";
import { HistoryTable } from "../../history/HistoryTable";
import { GenreStatsGraph } from "./GenreStatsGraph";
import { TopItemsList } from "./TopItems";
import UserBadges from "./UserBadges";
import { UserSimilarity } from "./UserSimilarity";
import { WatchTimePerDay } from "./WatchTimePerDay";

export default async function User({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; userId: string }>;
  searchParams: Promise<{
    page?: string;
    search?: string;
    sort_by?: string;
    sort_order?: string;
  }>;
}) {
  const { id, userId } = await params;
  const { page = "1", search, sort_by, sort_order } = await searchParams;
  const server = await getServer({ serverId: id });

  if (!server) {
    redirect("/");
  }

  const user = await getUserById({ userId: userId, serverId: server.id });
  if (!user) {
    redirect("/");
  }

  const showAdminStats = await showAdminStatistics();

  // Get additional user statistics and history
  const currentPage = Number.parseInt(page);
  const [
    watchStats,
    watchTimePerWeekday,
    userHistory,
    genreStats,
    mostWatched,
  ] = await Promise.all([
    getUserWatchStats({ serverId: server.id, userId: user.id }),
    getWatchTimePerWeekDay({
      serverId: server.id,
      userId: showAdminStats ? undefined : user.id,
    }),
    getUserHistory(server.id, user.id, {
      page: currentPage,
      perPage: 50,
      search: search || undefined,
      sortBy: sort_by || undefined,
      sortOrder: (sort_order as "asc" | "desc") || undefined,
    }),
    getUserGenreStats({ userId: user.id, serverId: server.id }),
    getMostWatchedItems({ serverId: server.id, userId: user.id }),
  ]);

  return (
    <Container className="flex flex-col w-screen md:w-[calc(100vw-256px)]">
      <PageTitle title={user.name || "N/A"} />
      <div className="flex flex-col gap-4">
        <UserBadges user={user} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-sm">Total Plays</p>
            <p className="text-xl font-bold">{watchStats.total_plays}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm">Total Watch Time</p>
            <p className="text-xl font-bold">
              {formatDuration(watchStats.total_watch_time)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm">Longest day streak</p>
            <p className="text-xl font-bold">
              {formatDuration(watchStats.longest_streak, "days")}
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <GenreStatsGraph data={genreStats} />
        <WatchTimePerDay data={watchTimePerWeekday} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <TopItemsList
          title="Top Movies"
          type="movie"
          items={mostWatched.Movie}
          server={server}
        />
        <TopItemsList
          title="Top TV Shows"
          type="series"
          items={mostWatched.Series}
          server={server}
        />
      </div>
      <div className="mt-6">
        <UserSimilarity serverId={server.id} userId={user.id} />
      </div>
      <HistoryTable server={server} data={userHistory} hideUserColumn={true} />
    </Container>
  );
}
