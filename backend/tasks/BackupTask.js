const db = require("../db");
const Logging = require("../classes/logging");
const configClass = require("../classes/config");

const backup = require("../classes/backup");
const moment = require('moment');
const { randomUUID } = require('crypto');
const { TaskState } = require("../logging/taskstate");
const { TaskName } = require("../logging/taskName");
const { TriggerType } = require("../logging/triggertype");

async function BackupTask() {
  try {
    await db.query(
      `UPDATE jf_logging SET "Result"='${TaskState.FAILED}' WHERE "Name"='${TaskName.BACKUP}' AND "Result"='${TaskState.RUNNING}'`
    );
  }
  catch (error) {
    console.log('Error Cleaning up Backup Tasks: ' + error);
  }
  let interval = 10000;
  let taskDelay = 1440; // 1 day in minutes

  try {//get interval from db
    const settingsjson = await db
      .query('SELECT settings FROM app_config where "ID"=1')
      .then((res) => res.rows);

    if (settingsjson.length > 0) {
      const settings = settingsjson[0].settings || {};

      let backuptasksettings = settings.Tasks?.Backup || {};

      if (backuptasksettings.Interval) {
        taskDelay = backuptasksettings.Interval;
      } else {
        backuptasksettings.Interval = taskDelay;
      }

      if (!settings.Tasks) {
        settings.Tasks = {};
      }
      if (!settings.Tasks.Backup) {
        settings.Tasks.Backup = {};
      }
      settings.Tasks.Backup = backuptasksettings;

      let query = 'UPDATE app_config SET settings=$1 where "ID"=1';

      await db.query(query, [settings]);
    }
  }
  catch (error) {
    console.log('Sync Task Settings Error: ' + error);
  }

  async function intervalCallback() {
    clearInterval(intervalTask);
    try {
      let current_time = moment();
      const config = await new configClass().getConfig();

      if (config.error) {
        return;
      }

      const last_execution = await db.query(`SELECT "TimeRun","Result"
                                             FROM public.jf_logging
                                             WHERE "Name"='${TaskName.BACKUP}' AND "Result" in ('${TaskState.SUCCESS}','${TaskState.RUNNING}')
                                             ORDER BY "TimeRun" DESC
                                             LIMIT 1`).then((res) => res.rows);

      if (last_execution.length !== 0) {
        let last_execution_time = moment(last_execution[0].TimeRun).add(taskDelay, 'minutes');

        if (!current_time.isAfter(last_execution_time) || last_execution[0].Result === TaskState.RUNNING) {
          intervalTask = setInterval(intervalCallback, interval);
          return;
        }
      }

      const uuid = randomUUID();
      let refLog = { logData: [], uuid: uuid };

      console.log('Running Scheduled Backup');

      Logging.insertLog(uuid, TriggerType.SCHEDULED, TaskName.BACKUP);

      await backup(refLog);
      Logging.updateLog(uuid, refLog.logData, TaskState.SUCCESS);

      console.log('Scheduled Backup Complete');

    } catch (error) {
      console.log(error);
      return [];
    }

    intervalTask = setInterval(intervalCallback, interval);
  }

  let intervalTask = setInterval(intervalCallback, interval);
}

module.exports = {
  BackupTask,
};
