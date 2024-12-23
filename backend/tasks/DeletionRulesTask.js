const DeletionRules = require("../models/jf_deletion_rules");
const { TaskState } = require("../logging/taskstate");
const { TaskName } = require("../logging/taskName");
const { TriggerType } = require("../logging/triggertype");
const logging = require("../models/jf_logging");

class DeletionRulesTask {
  constructor() {
    this.taskName = TaskName.DELETION_RULES;
    this.taskState = TaskState.STOPPED;
    this.wsKey = "deletion-rules-task";
  }

  async start(ws, interval = 3600000) { // Default to running every hour
    try {
      if (this.taskState === TaskState.RUNNING) {
        console.log("[DELETION-RULES-TASK] Task already running");
        return;
      }

      this.taskState = TaskState.RUNNING;
      await this.processRules(ws);

      // Schedule periodic runs
      this.interval = setInterval(async () => {
        await this.processRules(ws);
      }, interval);

      console.log("[DELETION-RULES-TASK] Task started");
    } catch (error) {
      console.error("[DELETION-RULES-TASK] Error starting task:", error);
      this.taskState = TaskState.ERROR;
    }
  }

  async stop() {
    try {
      if (this.interval) {
        clearInterval(this.interval);
      }
      this.taskState = TaskState.STOPPED;
      console.log("[DELETION-RULES-TASK] Task stopped");
    } catch (error) {
      console.error("[DELETION-RULES-TASK] Error stopping task:", error);
      this.taskState = TaskState.ERROR;
    }
  }

  async processRules(ws) {
    try {
      // Log task start
      await logging.logTask({
        task_name: this.taskName,
        trigger_type: TriggerType.SCHEDULED,
        task_state: TaskState.RUNNING,
        message: "Starting deletion rules processing"
      });

      if (ws) {
        ws(this.wsKey, {
          type: "Update",
          message: "Processing deletion rules..."
        });
      }

      await DeletionRules.processRules();

      if (ws) {
        ws(this.wsKey, {
          type: "Update",
          message: "Deletion rules processing completed"
        });
      }

      // Log task completion
      await logging.logTask({
        task_name: this.taskName,
        trigger_type: TriggerType.SCHEDULED,
        task_state: TaskState.COMPLETED,
        message: "Deletion rules processing completed"
      });
    } catch (error) {
      console.error("[DELETION-RULES-TASK] Error processing rules:", error);
      
      if (ws) {
        ws(this.wsKey, {
          type: "Error",
          message: "Error processing deletion rules"
        });
      }

      // Log task error
      await logging.logTask({
        task_name: this.taskName,
        trigger_type: TriggerType.SCHEDULED,
        task_state: TaskState.ERROR,
        message: `Error processing deletion rules: ${error.message}`
      });

      this.taskState = TaskState.ERROR;
    }
  }

  getState() {
    return this.taskState;
  }
}

module.exports = new DeletionRulesTask();
