import {
  db,
  users,
  libraries,
  activities,
  items,
  NewUser,
  NewLibrary,
  NewActivity,
} from "@streamystats/database";

// Helper function to sync users
export async function syncUsers(
  serverId: number,
  usersData: any[]
): Promise<number> {
  let syncedCount = 0;

  for (const userData of usersData) {
    try {
      const newUser: NewUser = {
        id: userData.Id,
        name: userData.Name,
        serverId,
        lastLoginDate: userData.LastLoginDate
          ? new Date(userData.LastLoginDate)
          : null,
        lastActivityDate: userData.LastActivityDate
          ? new Date(userData.LastActivityDate)
          : null,
        hasPassword: userData.HasPassword || false,
        hasConfiguredPassword: userData.HasConfiguredPassword || false,
        hasConfiguredEasyPassword: userData.HasConfiguredEasyPassword || false,
        enableAutoLogin: userData.Configuration?.EnableAutoLogin || false,
        isAdministrator: userData.Policy?.IsAdministrator || false,
        isHidden: userData.Policy?.IsHidden || false,
        isDisabled: userData.Policy?.IsDisabled || false,
        enableUserPreferenceAccess:
          userData.Policy?.EnableUserPreferenceAccess !== false,
        enableRemoteControlOfOtherUsers:
          userData.Policy?.EnableRemoteControlOfOtherUsers || false,
        enableSharedDeviceControl:
          userData.Policy?.EnableSharedDeviceControl || false,
        enableRemoteAccess: userData.Policy?.EnableRemoteAccess !== false,
        enableLiveTvManagement:
          userData.Policy?.EnableLiveTvManagement || false,
        enableLiveTvAccess: userData.Policy?.EnableLiveTvAccess !== false,
        enableMediaPlayback: userData.Policy?.EnableMediaPlayback !== false,
        enableAudioPlaybackTranscoding:
          userData.Policy?.EnableAudioPlaybackTranscoding !== false,
        enableVideoPlaybackTranscoding:
          userData.Policy?.EnableVideoPlaybackTranscoding !== false,
        enablePlaybackRemuxing:
          userData.Policy?.EnablePlaybackRemuxing !== false,
        enableContentDeletion: userData.Policy?.EnableContentDeletion || false,
        enableContentDownloading:
          userData.Policy?.EnableContentDownloading || false,
        enableSyncTranscoding: userData.Policy?.EnableSyncTranscoding !== false,
        enableMediaConversion: userData.Policy?.EnableMediaConversion || false,
        enableAllDevices: userData.Policy?.EnableAllDevices !== false,
        enableAllChannels: userData.Policy?.EnableAllChannels !== false,
        enableAllFolders: userData.Policy?.EnableAllFolders !== false,
        enablePublicSharing: userData.Policy?.EnablePublicSharing || false,
        invalidLoginAttemptCount:
          userData.Policy?.InvalidLoginAttemptCount || 0,
        loginAttemptsBeforeLockout:
          userData.Policy?.LoginAttemptsBeforeLockout || 3,
        maxActiveSessions: userData.Policy?.MaxActiveSessions || 0,
        remoteClientBitrateLimit:
          userData.Policy?.RemoteClientBitrateLimit || 0,
        authenticationProviderId:
          userData.Policy?.AuthenticationProviderId ||
          "Jellyfin.Server.Implementations.Users.DefaultAuthenticationProvider",
        passwordResetProviderId:
          userData.Policy?.PasswordResetProviderId ||
          "Jellyfin.Server.Implementations.Users.DefaultPasswordResetProvider",
        syncPlayAccess:
          userData.Policy?.SyncPlayAccess || "CreateAndJoinGroups",
      };

      await db.insert(users).values(newUser).onConflictDoUpdate({
        target: users.id,
        set: newUser,
      });
      syncedCount++;
    } catch (error) {
      console.error(`[user-sync] action=error userId=${userData.Id} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return syncedCount;
}

// Helper function to sync libraries
export async function syncLibraries(
  serverId: number,
  librariesData: any[]
): Promise<number> {
  let syncedCount = 0;

  for (const libraryData of librariesData) {
    try {
      const newLibrary: NewLibrary = {
        id: libraryData.ItemId,
        name: libraryData.Name,
        type: libraryData.CollectionType || "mixed",
        serverId,
      };

      await db.insert(libraries).values(newLibrary).onConflictDoUpdate({
        target: libraries.id,
        set: newLibrary,
      });
      syncedCount++;
    } catch (error) {
      console.error(`[library-sync] action=error libraryId=${libraryData.ItemId} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return syncedCount;
}

// Helper function to sync activities
export async function syncActivities(
  serverId: number,
  activitiesData: any[]
): Promise<number> {
  let syncedCount = 0;

  for (const activityData of activitiesData) {
    try {
      const newActivity: NewActivity = {
        id: activityData.Id.toString(),
        name: activityData.Name,
        shortOverview: activityData.ShortOverview,
        type: activityData.Type,
        date: new Date(activityData.Date),
        severity: activityData.Severity,
        serverId,
        userId: activityData.UserId || null,
        itemId: activityData.ItemId || null,
      };

      await db.insert(activities).values(newActivity).onConflictDoUpdate({
        target: activities.id,
        set: newActivity,
      });
      syncedCount++;
    } catch (error) {
      console.error(`[activity-sync] action=error activityId=${activityData.Id} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return syncedCount;
}

// Helper function to sync items
export async function syncItems(
  serverId: number,
  libraryId: string,
  itemsData: any[]
): Promise<number> {
  let syncedCount = 0;

  for (const itemData of itemsData) {
    try {
      const newItem = {
        id: itemData.Id,
        serverId,
        libraryId,
        name: itemData.Name || "",
        type: itemData.Type || "",
        originalTitle: itemData.OriginalTitle,
        etag: itemData.Etag,
        dateCreated: itemData.DateCreated
          ? new Date(itemData.DateCreated)
          : null,
        container: itemData.Container,
        sortName: itemData.SortName,
        premiereDate: itemData.PremiereDate
          ? new Date(itemData.PremiereDate)
          : null,
        path: itemData.Path,
        officialRating: itemData.OfficialRating,
        overview: itemData.Overview,
        communityRating: itemData.CommunityRating,
        runtimeTicks: itemData.RunTimeTicks || 0,
        productionYear: itemData.ProductionYear,
        isFolder: itemData.IsFolder || false,
        parentId: itemData.ParentId,
        mediaType: itemData.MediaType,
        width: itemData.Width,
        height: itemData.Height,
        seriesName: itemData.SeriesName,
        seriesId: itemData.SeriesId,
        seasonId: itemData.SeasonId,
        seasonName: itemData.SeasonName,
        indexNumber: itemData.IndexNumber,
        parentIndexNumber: itemData.ParentIndexNumber,
        videoType: itemData.VideoType,
        hasSubtitles: itemData.HasSubtitles || false,
        channelId: itemData.ChannelId,
        locationType: itemData.LocationType,
        genres: itemData.Genres || null,
        primaryImageAspectRatio: itemData.PrimaryImageAspectRatio,
        primaryImageTag: itemData.ImageTags?.Primary,
        seriesPrimaryImageTag: itemData.SeriesPrimaryImageTag,
        primaryImageThumbTag: itemData.ImageTags?.Thumb,
        primaryImageLogoTag: itemData.ImageTags?.Logo,
        rawData: itemData,
      };

      await db.insert(items).values(newItem).onConflictDoUpdate({
        target: items.id,
        set: newItem,
      });
      syncedCount++;
    } catch (error) {
      console.error(`[item-sync] action=error itemId=${itemData.Id} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return syncedCount;
}
