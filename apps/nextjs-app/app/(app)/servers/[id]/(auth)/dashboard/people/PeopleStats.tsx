import type { MediaTypeFilter } from "@/lib/db/people-stats";
import {
  getTopDirectorActorCombinations,
  getTopPeopleByPlayCount,
  getTopPeopleByWatchTime,
} from "@/lib/db/people-stats";
import type { ServerPublic } from "@/lib/types";
import { DirectorActorCombinations } from "./DirectorActorCombinations";
import { PeopleSection } from "./PeopleSection";

interface Props {
  server: ServerPublic;
  mediaType: MediaTypeFilter;
}

export async function PeopleStats({ server, mediaType }: Props) {
  const [
    topActorsByWatchTime,
    topActorsByPlayCount,
    topDirectorsByWatchTime,
    topDirectorsByPlayCount,
    directorActorCombos,
  ] = await Promise.all([
    getTopPeopleByWatchTime(server.id, "Actor", mediaType, 20),
    getTopPeopleByPlayCount(server.id, "Actor", mediaType, 20),
    getTopPeopleByWatchTime(server.id, "Director", mediaType, 20),
    getTopPeopleByPlayCount(server.id, "Director", mediaType, 20),
    getTopDirectorActorCombinations(server.id, mediaType, 15),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PeopleSection
        title="Top Actors by Watch Time"
        description="Most watched actors based on total viewing time"
        iconType="clock"
        people={topActorsByWatchTime}
        server={server}
        variant="watchtime"
        emptyMessage="No actor statistics available yet. Watch some content to see stats!"
      />

      <PeopleSection
        title="Top Actors by Play Count"
        description="Most frequently watched actors"
        iconType="play"
        people={topActorsByPlayCount}
        server={server}
        variant="playcount"
        emptyMessage="No actor statistics available yet."
      />

      <PeopleSection
        title="Top Directors by Watch Time"
        description="Most watched directors based on total viewing time"
        iconType="film"
        people={topDirectorsByWatchTime}
        server={server}
        variant="watchtime"
        emptyMessage="No director statistics available yet."
      />

      <PeopleSection
        title="Top Directors by Play Count"
        description="Most frequently watched directors"
        iconType="trending"
        people={topDirectorsByPlayCount}
        server={server}
        variant="playcount"
        emptyMessage="No director statistics available yet."
      />

      <DirectorActorCombinations
        combinations={directorActorCombos}
        server={server}
      />
    </div>
  );
}
