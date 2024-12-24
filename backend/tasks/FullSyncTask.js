const db = require("../db");
const moment = require("moment");
const sync = require("../routes/sync");
const { TaskName } = require("../logging/taskName");
const { TaskState } = require("../logging/taskstate");
const { TriggerType } = require("../logging/triggertype");

async function FullSyncTask() {
  try {
    await db.query(
      `UPDATE jf_logging SET "Result"='${TaskState.FAILED}' WHERE "Name"='${TaskName.FULL_SYNC}' AND "Result"='${TaskState.RUNNING}'`
    );
  } catch (error) {
    console.log("Error Cleaning up Sync Tasks: " + error);
  }

  let interval = 10000;
  let taskDelay = 1440; //in minutes

  async function fetchTaskSettings() {
    try {
      //get interval from db
      const settingsjson = await db.query('SELECT settings FROM app_config where "ID"=1').then((res) => res.rows);

      if (settingsjson.length > 0) {
        const settings = settingsjson[0].settings || {};

        let synctasksettings = settings.Tasks?.JellyfinSync || {};

        if (synctasksettings.Interval) {
          taskDelay = synctasksettings.Interval;
        } else {
          synctasksettings.Interval = taskDelay;

          if (!settings.Tasks) {
            settings.Tasks = {};
          }
          if (!settings.Tasks.JellyfinSync) {
            settings.Tasks.JellyfinSync = {};
          }
          settings.Tasks.JellyfinSync = synctasksettings;

          let query = 'UPDATE app_config SET settings=$1 where "ID"=1';

          await db.query(query, [settings]);
        }
      }
    } catch (error) {
      console.log("Sync Task Settings Error: " + error);
    }
  }

  async function intervalCallback() {
    clearInterval(intervalTask);
    try {
      let current_time = moment();
      const { rows: config } = await db.query('SELECT * FROM app_config where "ID"=1');

      if (config.length === 0 || config[0].JF_HOST === null || config[0].JF_API_KEY === null) {
        return;
      }

      const last_execution = await db
        .query(
          `SELECT "TimeRun","Result"
           FROM public.jf_logging
           WHERE "Name"='${TaskName.FULL_SYNC}'
           ORDER BY "TimeRun" DESC
           LIMIT 1`
        )
        .then((res) => res.rows);

      const last_execution_partialSync = await db
        .query(
          `SELECT "TimeRun","Result"
           FROM public.jf_logging
           WHERE "Name"='${TaskName.PARTIAL_SYNC}'
           AND "Result"='${TaskState.RUNNING}'
           ORDER BY "TimeRun" DESC
           LIMIT 1`
        )
        .then((res) => res.rows);

      if (last_execution.length !== 0) {
        await fetchTaskSettings();
        let last_execution_time = moment(last_execution[0].TimeRun).add(taskDelay, "minutes");

        if (
          !current_time.isAfter(last_execution_time) ||
          last_execution[0].Result === TaskState.RUNNING ||
          last_execution_partialSync.length > 0
        ) {
          intervalTask = setInterval(intervalCallback, interval);
          return;
        }
      }

      console.log("Running Scheduled Sync");
      await sync.fullSync(TriggerType.SCHEDULED);
      console.log("Scheduled Sync Complete");
    } catch (error) {
      console.log(error);
      return [];
    }

    intervalTask = setInterval(intervalCallback, interval);
  }

  let intervalTask = setInterval(intervalCallback, interval);
}

module.exports = {
  FullSyncTask,
};
