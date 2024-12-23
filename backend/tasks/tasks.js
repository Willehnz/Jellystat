const { BackupTask } = require("./BackupTask");
const { RecentlyAddedItemsSyncTask } = require("./RecentlyAddedItemsSyncTask");
const { FullSyncTask } = require("./FullSyncTask");
const DeletionRulesTask = require("./DeletionRulesTask");

const tasks = {
    FullSyncTask: FullSyncTask,
    RecentlyAddedItemsSyncTask: RecentlyAddedItemsSyncTask,
    BackupTask: BackupTask,
    DeletionRulesTask: DeletionRulesTask
};

// Start the deletion rules task
DeletionRulesTask.start(null, 3600000); // Run every hour

module.exports = tasks;
