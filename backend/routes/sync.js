const express = require("express");
const pgp = require("pg-promise")();
const db = require("../db");

const moment = require("moment");
const { randomUUID } = require("crypto");

const { sendUpdate } = require("../ws");

const logging = require("../classes/logging");
const { TaskName } = require("../logging/taskName");
const { TaskState } = require("../logging/taskstate");
const { TriggerType } = require("../logging/triggertype");

const configClass = require("../classes/config");
const API = require("../classes/api-loader");

const router = express.Router();

const { jf_libraries_columns, jf_libraries_mapping } = require("../models/jf_libraries");
const { jf_library_items_columns, jf_library_items_mapping } = require("../models/jf_library_items");
const { jf_library_seasons_columns, jf_library_seasons_mapping } = require("../models/jf_library_seasons");
const { jf_library_episodes_columns, jf_library_episodes_mapping } = require("../models/jf_library_episodes");
const { jf_item_info_columns, jf_item_info_mapping } = require("../models/jf_item_info");
const { columnsPlaybackReporting, mappingPlaybackReporting } = require("../models/jf_playback_reporting_plugin_data");

const { jf_users_columns, jf_users_mapping } = require("../models/jf_users");

let syncTask;
let PlaybacksyncTask;

/////////////////////////////////////////Functions

function getErrorLineNumber(error) {
  const stackTrace = error.stack.split("\n");
  const errorLine = stackTrace[1].trim();
  const lineNumber = errorLine.substring(errorLine.lastIndexOf("\\") + 1, errorLine.lastIndexOf(")"));
  return lineNumber;
}

class sync {
  async getExistingIDsforTable(tablename) {
    return await db.query(`SELECT "Id" FROM ${tablename}`).then((res) => res.rows.map((row) => row.Id));
  }

  async insertData(tablename, dataToInsert, column_mappings) {
    let result = await db.insertBulk(tablename, dataToInsert, column_mappings);
    if (result.Result === "SUCCESS") {
      // syncTask.loggedData.push({ color: "dodgerblue", Message: dataToInsert.length + " Rows Inserted." });
    } else {
      syncTask.loggedData.push({
        color: "red",
        Message: "Error performing bulk insert:" + result.message,
      });
      throw new Error("Error performing bulk insert:" + result.message);
    }
  }

  async removeData(tablename, dataToRemove) {
    let result = await db.deleteBulk(tablename, dataToRemove);
    if (result.Result === "SUCCESS") {
      syncTask.loggedData.push(dataToRemove.length + " Rows Removed.");
    } else {
      syncTask.loggedData.push({ color: "red", Message: "Error: " + result.message });
      throw new Error("Error :" + result.message);
    }
  }

  async updateSingleFieldOnDB(tablename, dataToUpdate, field_name, field_value, where_field) {
    let result = await db.updateSingleFieldBulk(tablename, dataToUpdate, field_name, field_value, where_field);
    if (result.Result === "SUCCESS") {
      syncTask.loggedData.push({ color: "dodgerblue", Message: dataToUpdate.length + " Rows updated." });
    } else {
      syncTask.loggedData.push({ color: "red", Message: "Error: " + result.message });
      throw new Error("Error :" + result.message);
    }
  }
}

////////////////////////////////////////API Methods

async function syncUserData() {
  sendUpdate(syncTask.wsKey, { type: "Update", message: "Syncing User Data" });
  syncTask.loggedData.push({ color: "lawngreen", Message: "Syncing... 1/4" });
  syncTask.loggedData.push({ color: "yellow", Message: "Beginning User Sync" });

  const _sync = new sync();

  const data = await API.getUsers();

  const existingIds = await _sync.getExistingIDsforTable("jf_users"); // get existing user Ids from the db

  let dataToInsert = await data.map(jf_users_mapping);

  if (dataToInsert.length > 0) {
    await _sync.insertData("jf_users", dataToInsert, jf_users_columns);
  }

  const toDeleteIds = existingIds.filter((id) => !data.some((row) => row.Id === id));
  if (toDeleteIds.length > 0) {
    await _sync.removeData("jf_users", toDeleteIds);
  }

  //update usernames on log table where username does not match the user table
  await db.query(
    'UPDATE jf_playback_activity a SET "UserName" = u."Name" FROM jf_users u WHERE u."Id" = a."UserId" AND u."Name" <> a."UserName"'
  );
  syncTask.loggedData.push({ color: "yellow", Message: "User Sync Complete" });
}

async function syncLibraryFolders(data, existing_excluded_libraries) {
  sendUpdate(syncTask.wsKey, { type: "Update", message: "Syncing Library Folders" });
  syncTask.loggedData.push({ color: "lawngreen", Message: "Syncing... 2/4" });
  syncTask.loggedData.push({ color: "yellow", Message: "Beginning Library Sync" });
  const _sync = new sync();
  const existingIds = await db
    .query(`SELECT "Id" FROM jf_libraries where "archived" = false `)
    .then((res) => res.rows.map((row) => row.Id));
  let dataToInsert = await data.map(jf_libraries_mapping);

  if (dataToInsert.length !== 0) {
    await _sync.insertData("jf_libraries", dataToInsert, jf_libraries_columns);
  }

  //archive libraries and items instead of deleting them

  const toArchiveLibraryIds = existingIds.filter((id) => !data.some((row) => row.Id === id));
  if (toArchiveLibraryIds.length > 0) {
    sendUpdate(syncTask.wsKey, { type: "Update", message: "Archiving old Library Data" });

    //dont archive items that exist on jellyfin but where marked as excluded in the config
    if (toArchiveLibraryIds.filter((id) => !existing_excluded_libraries.some((row) => row.Id === id)).length > 0) {
      const ItemsToArchive = await db
        .query(
          `SELECT "Id" FROM jf_library_items where "archived" = false and "ParentId" in (${toArchiveLibraryIds
            .filter((id) => !existing_excluded_libraries.some((row) => row.Id === id))
            .map((id) => `'${id}'`)
            .join(",")})`
        )
        .then((res) => res.rows.map((row) => row.Id));
      if (ItemsToArchive.length > 0) {
        await _sync.updateSingleFieldOnDB("jf_library_items", ItemsToArchive, "archived", true);
      }
    }

    await _sync.updateSingleFieldOnDB("jf_libraries", toArchiveLibraryIds, "archived", true);
  }
  syncTask.loggedData.push({ color: "yellow", Message: "Library Sync Complete" });
}

async function syncLibraryItems(data) {
  const _sync = new sync();
  const existingLibraryIds = await _sync.getExistingIDsforTable("jf_libraries"); // get existing library Ids from the db

  data = data.filter((row) => existingLibraryIds.includes(row.ParentId));

  const existingIds = await _sync.getExistingIDsforTable("jf_library_items");

  let dataToInsert = await data.map(jf_library_items_mapping);
  dataToInsert = dataToInsert.filter((item) => item.Id !== undefined);

  if (syncTask.taskName === TaskName.PARTIAL_SYNC) {
    dataToInsert = dataToInsert.filter((item) => !existingIds.includes(item.Id));
  }

  if (dataToInsert.length > 0) {
    await _sync.insertData("jf_library_items", dataToInsert, jf_library_items_columns);
  }

  return {
    insertedItemsCount:
      syncTask.taskName === TaskName.PARTIAL_SYNC ? dataToInsert.length : Math.max(dataToInsert.length - existingIds.length, 0),
    updatedItemsCount: syncTask.taskName === TaskName.PARTIAL_SYNC ? 0 : existingIds.length,
  };
}

async function archiveLibraryItems(fetchedData) {
  const _sync = new sync();
  const existingIds = await _sync.getExistingIDsforTable("jf_library_items where archived=false");
  let toArchiveIds = existingIds.filter((id) => !fetchedData.some((row) => row === id));

  if (toArchiveIds.length > 0) {
    await _sync.updateSingleFieldOnDB("jf_library_items", toArchiveIds, "archived", true);
    syncTask.loggedData.push({ color: "orange", Message: toArchiveIds.length + " Library Items Archived." });
  }
}

async function syncSeasons(seasons) {
  const shows = seasons.map((season) => season.SeriesId);

  let insertSeasonsCount = 0;
  let updateSeasonsCount = 0;

  for (const show of shows) {
    const existingIdsSeasons = await db
      .query(`SELECT *	FROM public.jf_library_seasons where "SeriesId" = '${show}'`)
      .then((res) => res.rows.map((row) => row.Id));

    let seasonsToInsert = [];
    seasonsToInsert = await seasons.filter((season) => season.SeriesId == show).map(jf_library_seasons_mapping);

    if (syncTask.taskName === TaskName.PARTIAL_SYNC) {
      seasonsToInsert = seasonsToInsert.filter((season) => !existingIdsSeasons.some((id) => id === season.Id));
    }

    if (seasonsToInsert.length !== 0) {
      let result = await db.insertBulk("jf_library_seasons", seasonsToInsert, jf_library_seasons_columns);
      if (result.Result === "SUCCESS") {
        insertSeasonsCount +=
          syncTask.taskName === TaskName.PARTIAL_SYNC
            ? seasonsToInsert.length
            : Math.max(seasonsToInsert.length - existingIdsSeasons.length, 0);
        updateSeasonsCount += syncTask.taskName === TaskName.PARTIAL_SYNC ? 0 : existingIdsSeasons.length;
      } else {
        syncTask.loggedData.push({
          color: "red",
          Message: "Error performing bulk insert:" + result.message,
        });
        await logging.updateLog(syncTask.uuid, syncTask.loggedData, TaskState.FAILED);
      }
    }
  }

  return { insertSeasonsCount: insertSeasonsCount, updateSeasonsCount: updateSeasonsCount };
}

async function syncEpisodes(episodes) {
  const shows = episodes.map((episode) => episode.SeriesId);

  let insertEpisodeCount = 0;
  let updateEpisodeCount = 0;

  for (const show of shows) {
    const existingIdsEpisodes = await db
      .query(`SELECT "EpisodeId"	FROM public.jf_library_episodes where "SeriesId" = '${show}'`)
      .then((res) => res.rows.map((row) => row.EpisodeId));

    let episodesToInsert = [];
    episodesToInsert = await episodes.filter((episode) => episode.SeriesId == show).map(jf_library_episodes_mapping);

    if (syncTask.taskName === TaskName.PARTIAL_SYNC) {
      episodesToInsert = episodesToInsert.filter(
        (episode) => !existingIdsEpisodes.some((EpisodeId) => EpisodeId === episode.EpisodeId)
      );
    }

    if (episodesToInsert.length !== 0) {
      let result = await db.insertBulk("jf_library_episodes", episodesToInsert, jf_library_episodes_columns);
      if (result.Result === "SUCCESS") {
        insertEpisodeCount +=
          syncTask.taskName === TaskName.PARTIAL_SYNC
            ? episodesToInsert.length
            : Math.max(episodesToInsert.length - existingIdsEpisodes.length, 0);
        updateEpisodeCount += syncTask.taskName === TaskName.PARTIAL_SYNC ? 0 : existingIdsEpisodes.length;
      } else {
        syncTask.loggedData.push({
          color: "red",
          Message: "Error performing bulk insert:" + result.message,
        });
        await logging.updateLog(syncTask.uuid, syncTask.loggedData, TaskState.FAILED);
      }
    }
  }

  return { insertEpisodeCount: insertEpisodeCount, updateEpisodeCount: updateEpisodeCount };
}

async function archiveSeasonsAndEpisodes(fetchedSeasons, fetchedEpisodes) {
  const _sync = new sync();
  const existingIdsSeasons = await db
    .query(`SELECT *	FROM public.jf_library_seasons where archived=false`)
    .then((res) => res.rows.map((row) => row.Id));

  const existingIdsEpisodes = await db
    .query(`SELECT *	FROM public.jf_library_episodes where archived=false`)
    .then((res) => res.rows.map((row) => row.EpisodeId));

  let toArchiveSeasons = existingIdsSeasons.filter((id) => !fetchedSeasons.some((row) => row === id));
  let toArchiveEpisodes = existingIdsEpisodes.filter((EpisodeId) => !fetchedEpisodes.some((row) => row === EpisodeId));

  if (toArchiveSeasons.length > 0) {
    await _sync.updateSingleFieldOnDB("jf_library_seasons", toArchiveSeasons, "archived", true);
    syncTask.loggedData.push({ color: "orange", Message: toArchiveSeasons.length + " Seasons Archived." });
  }
  if (toArchiveEpisodes.length > 0) {
    await _sync.updateSingleFieldOnDB("jf_library_episodes", toArchiveEpisodes, "archived", true, "EpisodeId");
    syncTask.loggedData.push({ color: "orange", Message: toArchiveEpisodes.length + " Episodes Archived." });
  }
}

async function syncItemInfo(seasons_and_episodes, library_items) {
  let Items = library_items.filter((item) => item.Type !== "Series" && item.Type !== "Folder" && item.Id !== undefined);
  let Episodes = seasons_and_episodes.filter((item) => item.Type === "Episode" && item.Id !== undefined);

  let insertItemInfoCount = 0;
  let insertEpisodeInfoCount = 0;
  let updateItemInfoCount = 0;
  let updateEpisodeInfoCount = 0;

  let data_to_insert = [];
  //loop for each Movie
  for (const Item of Items) {
    const existingItemInfo = await db
      .query(`SELECT *	FROM public.jf_item_info where "Id" = '${Item.Id}'`)
      .then((res) => res.rows.map((row) => row.Id));

    if ((existingItemInfo.length == 0 && syncTask.taskName === TaskName.PARTIAL_SYNC) || syncTask.taskName === TaskName.FULL_SYNC) {
      //dont update item info if it already exists and running a partial sync
      const mapped_data = await Item.MediaSources.map((item) => jf_item_info_mapping(item, "Item"));
      data_to_insert.push(...mapped_data);

      if (mapped_data.length !== 0) {
        insertItemInfoCount += mapped_data.length - existingItemInfo.length;
        updateItemInfoCount += existingItemInfo.length;
      }
    }
  }

  //loop for each Episode
  for (const Episode of Episodes) {
    const existingEpisodeItemInfo = await db
      .query(`SELECT *	FROM public.jf_item_info where "Id" = '${Episode.Id}'`)
      .then((res) => res.rows.map((row) => row.Id));

    if (
      (existingEpisodeItemInfo.length == 0 && syncTask.taskName === TaskName.PARTIAL_SYNC) ||
      syncTask.taskName === TaskName.FULL_SYNC
    ) {
      //dont update item info if it already exists and running a partial sync
      const mapped_data = await Episode.MediaSources.map((item) => jf_item_info_mapping(item, "Episode"));
      data_to_insert.push(...mapped_data);

      //filter fix if jf_libraries is empty
      if (mapped_data.length !== 0) {
        insertEpisodeInfoCount += mapped_data.length - existingEpisodeItemInfo.length;
        updateEpisodeInfoCount += existingEpisodeItemInfo.length;
      }
    }
  }

  if (data_to_insert.length !== 0) {
    let result = await db.insertBulk("jf_item_info", data_to_insert, jf_item_info_columns);
    if (result.Result !== "SUCCESS") {
      syncTask.loggedData.push({
        color: "red",
        Message: "Error performing bulk insert:" + result.message,
      });
      await logging.updateLog(syncTask.uuid, syncTask.loggedData, TaskState.FAILED);
    }
  }

  return {
    insertItemInfoCount: insertItemInfoCount,
    updateItemInfoCount: updateItemInfoCount,
    insertEpisodeInfoCount: insertEpisodeInfoCount,
    updateEpisodeInfoCount: updateEpisodeInfoCount,
  };
}

async function removeOrphanedData() {
  const _sync = new sync();
  syncTask.loggedData.push({ color: "lawngreen", Message: "Syncing... 4/4" });
  sendUpdate(syncTask.wsKey, { type: "Update", message: "Cleaning up FileInfo/Episode/Season Records (4/4)" });
  syncTask.loggedData.push({ color: "yellow", Message: "Removing Orphaned FileInfo/Episode/Season Records" });

  await db.query("CALL jd_remove_orphaned_data()");
  const archived_items = await db
    .query(`select "Id" from jf_library_items where archived=true and "Type"='Series'`)
    .then((res) => res.rows.map((row) => row.Id));
  const archived_seasons = await db
    .query(`select "Id" from jf_library_seasons where archived=true`)
    .then((res) => res.rows.map((row) => row.Id));
  await _sync.updateSingleFieldOnDB("jf_library_seasons", archived_items, "archived", true, "SeriesId");
  await _sync.updateSingleFieldOnDB("jf_library_episodes", archived_items, "archived", true, "SeriesId");
  await _sync.updateSingleFieldOnDB("jf_library_episodes", archived_seasons, "archived", true, "SeasonId");

  await db.query(`DELETE FROM public.jf_library_episodes
  where "SeasonId" is null
  and archived=false`);

  syncTask.loggedData.push({ color: "dodgerblue", Message: "Orphaned FileInfo/Episode/Season Removed." });
}

async function migrateArchivedActivty() {
  sendUpdate(syncTask.wsKey, { type: "Update", message: "Migrating Archived Activity to New Items" });
  syncTask.loggedData.push({ color: "yellow", Message: "Migrating Archived Activity to New Items" });

  //Movies
  const movie_query = `
  SELECT a."NowPlayingItemId" "OldNowPlayingItemId",i."Id" "NowPlayingItemId"
	FROM jf_playback_activity a
	join jf_library_items i
	on a."NowPlayingItemName"=i."Name"
	and a."NowPlayingItemId"!=i."Id"
	and i.archived=false

  where a."EpisodeId" is null
  AND NOT EXISTS
  (
      SELECT 1
      FROM jf_library_items i_e
      WHERE a."NowPlayingItemId" = i_e."Id"
      AND i_e.archived = false
  )
  `;

  const episode_query = `
  SELECT a."EpisodeId" "OldEpisodeId",e."EpisodeId",e."SeasonId",e."SeriesId"
	FROM jf_playback_activity a
	join jf_library_episodes e
	on a."NowPlayingItemName"=e."Name"
  and a."SeriesName"=e."SeriesName"
	and a."EpisodeId"!=e."EpisodeId"
	and e.archived=false

  where a."EpisodeId" is not null

  AND NOT EXISTS
  (
      SELECT 1
      FROM jf_library_episodes i_e
      WHERE a."EpisodeId" = i_e."EpisodeId"
      AND i_e.archived = false
  )
  `;

  const { rows: movieMapping } = await db.query(movie_query);
  const { rows: episodeMapping } = await db.query(episode_query);

  for (const movie of movieMapping) {
    const updateQuery = `UPDATE jf_playback_activity SET "NowPlayingItemId" = '${movie.NowPlayingItemId}' WHERE "NowPlayingItemId" = '${movie.OldNowPlayingItemId}'`;
    await db.query(updateQuery);
  }

  for (const episode of episodeMapping) {
    const updateQuery = `UPDATE jf_playback_activity SET "EpisodeId" = '${episode.EpisodeId}', "SeasonId"='${episode.SeasonId}', "NowPlayingItemId"='${episode.SeriesId}' WHERE "EpisodeId" = '${episode.OldEpisodeId}'`;
    await db.query(updateQuery);
  }

  syncTask.loggedData.push({ color: "dodgerblue", Message: "Archived Activity Migrated to New Items Succesfully." });
}

async function syncPlaybackPluginData() {
  PlaybacksyncTask.loggedData.push({ color: "lawngreen", Message: "Syncing..." });

  //Playback Reporting Plugin Check
  const installed_plugins = await API.getInstalledPlugins();

  const hasPlaybackReportingPlugin = installed_plugins.filter(
    (plugins) => ["playback_reporting.xml", "Jellyfin.Plugin.PlaybackReporting.xml"].includes(plugins?.ConfigurationFileName) //TO-DO Change this to the correct plugin name
  );

  if (!hasPlaybackReportingPlugin || hasPlaybackReportingPlugin.length === 0) {
    if (!hasPlaybackReportingPlugin || hasPlaybackReportingPlugin.length === 0) {
      PlaybacksyncTask.loggedData.push({ color: "dodgerblue", Message: `No new data to insert.` });
    } else {
      PlaybacksyncTask.loggedData.push({ color: "lawngreen", Message: "Playback Reporting Plugin not detected. Skipping step." });
    }
  } else {
    //

    PlaybacksyncTask.loggedData.push({ color: "dodgerblue", Message: "Determining query constraints." });
    const OldestPlaybackActivity = await db
      .query('SELECT  MIN("ActivityDateInserted") "OldestPlaybackActivity" FROM public.jf_playback_activity')
      .then((res) => res.rows[0]?.OldestPlaybackActivity);

    const NewestPlaybackActivity = await db
      .query('SELECT  MAX("ActivityDateInserted") "OldestPlaybackActivity" FROM public.jf_playback_activity')
      .then((res) => res.rows[0]?.OldestPlaybackActivity);

    const MaxPlaybackReportingPluginID = await db
      .query('SELECT MAX(rowid) "MaxRowId" FROM jf_playback_reporting_plugin_data')
      .then((res) => res.rows[0]?.MaxRowId);

    //Query Builder
    let query = `SELECT rowid, * FROM PlaybackActivity`;

    if (OldestPlaybackActivity && NewestPlaybackActivity) {
      const formattedDateTimeOld = moment(OldestPlaybackActivity).format("YYYY-MM-DD HH:mm:ss");
      const formattedDateTimeNew = moment(NewestPlaybackActivity).format("YYYY-MM-DD HH:mm:ss");
      query = query + ` WHERE (DateCreated < '${formattedDateTimeOld}' or DateCreated > '${formattedDateTimeNew}')`;
    }

    if (OldestPlaybackActivity && !NewestPlaybackActivity) {
      const formattedDateTimeOld = moment(OldestPlaybackActivity).format("YYYY-MM-DD HH:mm:ss");
      query = query + ` WHERE DateCreated < '${formattedDateTimeOld}'`;
      if (MaxPlaybackReportingPluginID) {
        query = query + ` AND rowid > ${MaxPlaybackReportingPluginID}`;
      }
    }

    if (!OldestPlaybackActivity && NewestPlaybackActivity) {
      const formattedDateTimeNew = moment(NewestPlaybackActivity).format("YYYY-MM-DD HH:mm:ss");
      query = query + ` WHERE DateCreated > '${formattedDateTimeNew}'`;
      if (MaxPlaybackReportingPluginID) {
        query = query + ` AND rowid > ${MaxPlaybackReportingPluginID}`;
      }
    }

    if (!OldestPlaybackActivity && !NewestPlaybackActivity && MaxPlaybackReportingPluginID) {
      query = query + ` WHERE rowid > ${MaxPlaybackReportingPluginID}`;
    }

    query += " order by rowid";

    PlaybacksyncTask.loggedData.push({ color: "dodgerblue", Message: "Query built. Executing." });
    //

    const PlaybackData = await API.StatsSubmitCustomQuery(query);

    let DataToInsert = await PlaybackData.map(mappingPlaybackReporting);

    if (DataToInsert.length > 0) {
      PlaybacksyncTask.loggedData.push({ color: "dodgerblue", Message: `Inserting ${DataToInsert.length} Rows.` });
      let result = await db.insertBulk("jf_playback_reporting_plugin_data", DataToInsert, columnsPlaybackReporting);

      if (result.Result === "SUCCESS") {
        PlaybacksyncTask.loggedData.push({ color: "dodgerblue", Message: `${DataToInsert.length} Rows have been inserted.` });
        PlaybacksyncTask.loggedData.push({
          color: "yellow",
          Message: "Running process to format data to be inserted into the Activity Table",
        });
      } else {
        PlaybacksyncTask.loggedData.push({ color: "red", Message: "Error: " + result.message });
        await logging.updateLog(PlaybacksyncTask.uuid, PlaybacksyncTask.loggedData, TaskState.FAILED);
      }
    }

    PlaybacksyncTask.loggedData.push({ color: "dodgerblue", Message: "Process complete. Data has been imported." });
  }
  await db.query("CALL ji_insert_playback_plugin_data_to_activity_table()");
  PlaybacksyncTask.loggedData.push({ color: "dodgerblue", Message: "Any imported data has been processed." });

  PlaybacksyncTask.loggedData.push({ color: "lawngreen", Message: `Playback Reporting Plugin Sync Complete` });
}

async function updateLibraryStatsData() {
  syncTask.loggedData.push({ color: "yellow", Message: "Updating Library Stats" });

  await db.query("CALL ju_update_library_stats_data()");

  syncTask.loggedData.push({ color: "dodgerblue", Message: "Library Stats Updated." });
}

async function fullSync(triggertype) {
  const config = await new configClass().getConfig();

  const uuid = randomUUID();
  syncTask = { loggedData: [], uuid: uuid, wsKey: "FullSyncTask", taskName: TaskName.FULL_SYNC };
  try {
    sendUpdate(syncTask.wsKey, { type: "Start", message: triggertype + " " + TaskName.FULL_SYNC + " Started" });
    await logging.insertLog(uuid, triggertype, TaskName.FULL_SYNC);

    if (config.error) {
      syncTask.loggedData.push({ Message: config.error });
      await logging.updateLog(syncTask.uuid, syncTask.loggedData, TaskState.FAILED);
      return;
    }

    //syncUserData
    await syncUserData();

    let libraries = await API.getLibraries();
    if (libraries.length === 0) {
      syncTask.loggedData.push({ Message: "Error: No Libararies found to sync." });
      await logging.updateLog(syncTask.uuid, syncTask.loggedData, TaskState.FAILED);
      sendUpdate(syncTask.wsKey, { type: "Success", message: triggertype + " " + TaskName.FULL_SYNC + " Completed" });
      return;
    }

    const excluded_libraries = config.settings.ExcludedLibraries || [];

    let filtered_libraries = libraries.filter((library) => !excluded_libraries.includes(library.Id));
    let existing_excluded_libraries = libraries.filter((library) => excluded_libraries.includes(library.Id));

    //syncLibraryFolders
    await syncLibraryFolders(filtered_libraries, existing_excluded_libraries);

    syncTask.loggedData.push({ color: "lawngreen", Message: "Syncing... 3/4" });
    syncTask.loggedData.push({ color: "yellow", Message: "Beginning Media Sync" });

    //clear data from memory as its no longer needed
    libraries = null;

    let fetchedItemIds = [];
    let fetchedSeasonIds = [];
    let fetchedEpisodeIds = [];

    //item sync counters
    let insertedItemsCount = 0;
    let updatedItemsCount = 0;
    let insertedSeasonsCount = 0;
    let updatedSeasonsCount = 0;
    let insertedEpisodeCount = 0;
    let updatedEpisodeCount = 0;

    //item info sync counters
    let insertItemInfoCount = 0;
    let insertEpisodeInfoCount = 0;
    let updateItemInfoCount = 0;
    let updateEpisodeInfoCount = 0;

    //for each item in library run get item using that id as the ParentId
    for (let i = 0; i < filtered_libraries.length; i++) {
      let startIndex = 0;
      let increment = 200;
      const item = filtered_libraries[i];
      const wsMessage = "Syncing Library : " + item.Name + ` (${i + 1}/${filtered_libraries.length})`;
      sendUpdate(syncTask.wsKey, {
        type: "Update",
        message: wsMessage,
      });

      let libraryItems = await API.getItemsFromParentId({
        id: item.Id,
        ws: sendUpdate,
        syncTask: syncTask,
        wsMessage: wsMessage,
        params: {
          startIndex: startIndex,
          increment: increment,
        },
      });

      while (libraryItems.length != 0) {
        if (libraryItems.length === 0 && startIndex === 0) {
          syncTask.loggedData.push({ Message: "Error: No Items found for Library : " + item.Name });
          break;
        }

        const libraryItemsWithParent = libraryItems.map((items) => ({
          ...items,
          ...{ ParentId: item.Id },
        }));

        let library_items = libraryItemsWithParent.filter((item) => ["Movie", "Audio", "Series"].includes(item.Type));
        let seasons = libraryItemsWithParent.filter((item) => ["Season"].includes(item.Type));
        let episodes = libraryItemsWithParent.filter((item) => ["Episode"].includes(item.Type));

        if (library_items.length > 0) {
          fetchedItemIds.push(...library_items.map((item) => item.Id));
          let counts = await syncLibraryItems(library_items);
          insertedItemsCount += Number(counts.insertedItemsCount);
          updatedItemsCount += Number(counts.updatedItemsCount);
        }

        if (seasons.length > 0) {
          fetchedSeasonIds.push(...seasons.map((item) => item.Id));
          let count = await syncSeasons(seasons);
          insertedSeasonsCount += Number(count.insertSeasonsCount);
          updatedSeasonsCount += Number(count.updateSeasonsCount);
        }

        if (episodes.length > 0) {
          fetchedEpisodeIds.push(...episodes.map((item) => item.Id));
          let count = await syncEpisodes(episodes);
          insertedEpisodeCount += Number(count.insertEpisodeCount);
          updatedEpisodeCount += Number(count.updateEpisodeCount);
        }

        let infoCount = await syncItemInfo([...seasons, ...episodes], library_items);
        insertItemInfoCount += Number(infoCount.insertItemInfoCount);
        updateItemInfoCount += Number(infoCount.updateItemInfoCount);
        insertEpisodeInfoCount += Number(infoCount.insertEpisodeInfoCount);
        updateEpisodeInfoCount += Number(infoCount.updateEpisodeInfoCount);

        library_items = null;
        seasons = null;
        episodes = null;

        startIndex += increment;

        libraryItems = await API.getItemsFromParentId({
          id: item.Id,
          ws: sendUpdate,
          syncTask: syncTask,
          wsMessage: wsMessage,
          params: {
            startIndex: startIndex,
            increment: increment,
          },
        });
      }

      sendUpdate(syncTask.wsKey, { type: "Update", message: "Data Fetched for Library : " + item.Name });
    }

    syncTask.loggedData.push({
      color: "dodgerblue",
      Message: (insertedItemsCount > 0 ? insertedItemsCount : 0) + " Items inserted. " + updatedItemsCount + " Item Info Updated",
    });

    syncTask.loggedData.push({
      color: "dodgerblue",
      Message:
        (insertedSeasonsCount > 0 ? insertedSeasonsCount : 0) + " Seasons inserted. " + updatedSeasonsCount + " Seasons Updated",
    });

    syncTask.loggedData.push({
      color: "dodgerblue",
      Message:
        (insertedEpisodeCount > 0 ? insertedEpisodeCount : 0) +
        " Episodes inserted. " +
        updatedEpisodeCount +
        " Episodes Updated",
    });

    if (syncTask.taskName === TaskName.FULL_SYNC) {
      await archiveLibraryItems(fetchedItemIds);
      await archiveSeasonsAndEpisodes(fetchedSeasonIds, fetchedEpisodeIds);
    }

    syncTask.loggedData.push({ color: "yellow", Message: "Media Sync Complete" });

    filtered_libraries = null;
    existing_excluded_libraries = null;

    await removeOrphanedData();
    await migrateArchivedActivty();
    await updateLibraryStatsData();

    await logging.updateLog(syncTask.uuid, syncTask.loggedData, TaskState.SUCCESS);
    sendUpdate(syncTask.wsKey, { type: "Success", message: triggertype + " Sync Completed" });
  } catch (error) {
    syncTask.loggedData.push({ color: "red", Message: getErrorLineNumber(error) + ": Error: " + error });
    await logging.updateLog(syncTask.uuid, syncTask.loggedData, TaskState.FAILED);
    sendUpdate(syncTask.wsKey, { type: "Error", message: triggertype + " Sync Halted with Errors" });
  }
}

// Begin sync endpoints
router.get("/beginSync", async (req, res) => {
  const config = await new configClass().getConfig();

  if (config.error) {
    res.send({ error: "Config Details Not Found" });
    return;
  }

  const last_execution = await db
    .query(
      `SELECT "Result"
       FROM public.jf_logging
       WHERE "Name"='${TaskName.FULL_SYNC}'
       ORDER BY "TimeRun" DESC
       LIMIT 1`
    )
    .then((res) => res.rows);

  if (last_execution.length !== 0) {
    if (last_execution[0].Result === TaskState.RUNNING) {
      sendUpdate("TaskError", "Error: Sync is already running");
      res.send();
      return;
    }
  }

  await fullSync(TriggerType.MANUAL);
  res.send();
});

router.get("/beginPartialSync", async (req, res) => {
  const config = await new configClass().getConfig();

  if (config.error) {
    res.send({ error: config.error });
    return;
  }

  const last_execution = await db
    .query(
      `SELECT "Result"
       FROM public.jf_logging
       WHERE "Name"='${TaskName.PARTIAL_SYNC}'
       ORDER BY "TimeRun" DESC
       LIMIT 1`
    )
    .then((res) => res.rows);

  if (last_execution.length !== 0) {
    if (last_execution[0].Result === TaskState.RUNNING) {
      sendUpdate("TaskError", "Error: Sync is already running");
      res.send();
      return;
    }
  }

  await partialSync(TriggerType.MANUAL);
  res.send();
});

router.get("/syncPlaybackPluginData", async (req, res) => {
  const config = await new configClass().getConfig();

  const uuid = randomUUID();
  PlaybacksyncTask = { loggedData: [], uuid: uuid };
  try {
    await logging.insertLog(uuid, TriggerType.MANUAL, TaskName.IMPORT);
    sendUpdate("PlaybackSyncTask", { type: "Start", message: "Playback Plugin Sync Started" });

    if (config.error) {
      res.send({ error: config.error });
      PlaybacksyncTask.loggedData.push({ Message: config.error });
      await logging.updateLog(uuid, PlaybacksyncTask.loggedData, TaskState.FAILED);
      return;
    }

    await sleep(5000);
    await syncPlaybackPluginData();

    await logging.updateLog(PlaybacksyncTask.uuid, PlaybacksyncTask.loggedData, TaskState.SUCCESS);
    sendUpdate("PlaybackSyncTask", { type: "Success", message: "Playback Plugin Sync Completed" });
    res.send("syncPlaybackPluginData Complete");
  } catch (error) {
    PlaybacksyncTask.loggedData.push({ color: "red", Message: getErrorLineNumber(error) + ": Error: " + error });
    await logging.updateLog(PlaybacksyncTask.uuid, PlaybacksyncTask.loggedData, TaskState.FAILED);
    res.send("syncPlaybackPluginData Halted with Errors");
  }
});

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Handle other routes
router.use((req, res) => {
  res.status(404).send({ error: "Not Found" });
});

module.exports = {
  router,
  fullSync,
  partialSync,
};
