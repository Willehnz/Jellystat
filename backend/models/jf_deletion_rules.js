const db = require("../db");
const configClass = require("../classes/config");
const axios = require("axios");
const { WebhookClient } = require("discord.js");

class DeletionRules {
  constructor() {
    this.config = new configClass();
  }

  async getRules() {
    try {
      const query = `
        SELECT dr.*, l.NAME as library_name 
        FROM jf_deletion_rules dr
        JOIN jf_libraries l ON l.ID = dr.library_id
        ORDER BY dr.created_at DESC
      `;
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      console.error("[DELETION-RULES] Error getting rules:", error);
      throw error;
    }
  }

  async getRuleById(id) {
    try {
      const query = `
        SELECT dr.*, l.NAME as library_name 
        FROM jf_deletion_rules dr
        JOIN jf_libraries l ON l.ID = dr.library_id
        WHERE dr.ID = $1
      `;
      const result = await db.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      console.error("[DELETION-RULES] Error getting rule:", error);
      throw error;
    }
  }

  async createRule(ruleData) {
    try {
      const query = `
        INSERT INTO jf_deletion_rules (
          library_id, rule_name, media_type, days_since_watched,
          enabled, exclusions, warning_days
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      const values = [
        ruleData.library_id,
        ruleData.rule_name,
        ruleData.media_type,
        ruleData.days_since_watched,
        ruleData.enabled,
        JSON.stringify(ruleData.exclusions || {}),
        ruleData.warning_days || 3
      ];
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error("[DELETION-RULES] Error creating rule:", error);
      throw error;
    }
  }

  async updateRule(id, ruleData) {
    try {
      const query = `
        UPDATE jf_deletion_rules
        SET library_id = $1,
            rule_name = $2,
            media_type = $3,
            days_since_watched = $4,
            enabled = $5,
            exclusions = $6,
            warning_days = $7,
            updated_at = NOW()
        WHERE ID = $8
        RETURNING *
      `;
      const values = [
        ruleData.library_id,
        ruleData.rule_name,
        ruleData.media_type,
        ruleData.days_since_watched,
        ruleData.enabled,
        JSON.stringify(ruleData.exclusions || {}),
        ruleData.warning_days || 3,
        id
      ];
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error("[DELETION-RULES] Error updating rule:", error);
      throw error;
    }
  }

  async deleteRule(id) {
    try {
      const query = "DELETE FROM jf_deletion_rules WHERE ID = $1";
      await db.query(query, [id]);
      return true;
    } catch (error) {
      console.error("[DELETION-RULES] Error deleting rule:", error);
      throw error;
    }
  }

  async previewRules() {
    try {
      const rules = await this.getRules();
      const preview = [];

      for (const rule of rules) {
        if (!rule.enabled) {
          preview.push({
            rule_name: rule.rule_name,
            status: 'disabled',
            items: []
          });
          continue;
        }

        const rulePreview = await this.previewRule(rule.ID);
        preview.push(rulePreview);
      }

      return preview;
    } catch (error) {
      console.error("[DELETION-RULES] Error previewing rules:", error);
      throw error;
    }
  }

  async previewRule(ruleId) {
    try {
      const rule = await this.getRuleById(ruleId);
      if (!rule) throw new Error("Rule not found");

      const itemsToProcess = await this.findItemsForDeletion(rule);
      const itemsGrouped = {
        to_delete: [],
        warning_soon: [],
        protected: []
      };

      for (const item of itemsToProcess) {
        const daysUntilDeletion = this.calculateDaysUntilDeletion(item, rule);
        const itemInfo = {
          title: item.title,
          days_since_watched: item.days_since_watched,
          days_until_deletion: daysUntilDeletion,
          last_watched: item.last_watch_date
        };

        if (daysUntilDeletion <= 0) {
          itemsGrouped.to_delete.push(itemInfo);
        } else if (daysUntilDeletion <= rule.warning_days) {
          itemsGrouped.warning_soon.push(itemInfo);
        } else {
          itemsGrouped.protected.push(itemInfo);
        }
      }

      return {
        rule_name: rule.rule_name,
        library_name: rule.library_name,
        media_type: rule.media_type,
        days_threshold: rule.days_since_watched,
        warning_days: rule.warning_days,
        status: rule.enabled ? 'enabled' : 'disabled',
        summary: {
          total_items: itemsToProcess.length,
          to_delete: itemsGrouped.to_delete.length,
          warning_soon: itemsGrouped.warning_soon.length,
          protected: itemsGrouped.protected.length
        },
        items: itemsGrouped
      };
    } catch (error) {
      console.error("[DELETION-RULES] Error previewing rule:", error);
      throw error;
    }
  }

  async processRules(dryRun = false) {
    try {
      const rules = await this.getRules();
      const config = await this.config.getConfig();
      const externalServices = JSON.parse(config.external_services || '{}');
      const results = [];

      for (const rule of rules) {
        if (!rule.enabled) continue;

        const itemsToDelete = await this.findItemsForDeletion(rule);
        const ruleResults = {
          rule_name: rule.rule_name,
          processed: [],
          warnings: []
        };

        for (const item of itemsToDelete) {
          const daysUntilDeletion = this.calculateDaysUntilDeletion(item, rule);
          
          if (daysUntilDeletion <= 0) {
            if (!dryRun) {
              await this.deleteItem(item, rule, externalServices);
            }
            ruleResults.processed.push({
              title: item.title,
              action: dryRun ? 'would_delete' : 'deleted',
              days_since_watched: item.days_since_watched
            });
          } else if (daysUntilDeletion <= rule.warning_days) {
            if (!dryRun) {
              await this.sendDeletionWarning(item, rule, daysUntilDeletion, externalServices);
            }
            ruleResults.warnings.push({
              title: item.title,
              days_until_deletion: daysUntilDeletion,
              action: dryRun ? 'would_warn' : 'warned'
            });
          }
        }

        results.push(ruleResults);
      }

      return {
        mode: dryRun ? 'dry_run' : 'live',
        timestamp: new Date().toISOString(),
        results
      };
    } catch (error) {
      console.error("[DELETION-RULES] Error processing rules:", error);
      throw error;
    }
  }

  async findShowsForDeletion(rule) {
    try {
      // For shows, we check if ANY episode has been watched recently
      const query = `
        WITH show_last_watched AS (
          SELECT 
            s.parent_id as show_id,
            MAX(pa.date_watched) as last_watch_date
          FROM jf_library_episodes e
          JOIN jf_library_seasons s ON e.parent_id = s.ID
          JOIN jf_playback_activity pa ON pa.item_id = e.ID
          GROUP BY s.parent_id
        )
        SELECT 
          i.*,
          lw.last_watch_date,
          EXTRACT(DAY FROM NOW() - lw.last_watch_date) as days_since_watched
        FROM jf_library_items i
        JOIN show_last_watched lw ON lw.show_id = i.ID
        WHERE i.library_id = $1
        AND NOT i.archived
        AND EXTRACT(DAY FROM NOW() - lw.last_watch_date) >= $2
      `;
      const result = await db.query(query, [rule.library_id, rule.days_since_watched]);
      return result.rows;
    } catch (error) {
      console.error("[DELETION-RULES] Error finding shows for deletion:", error);
      throw error;
    }
  }

  async findEpisodesForDeletion(rule) {
    try {
      // For episodes, we check individual episode watch dates
      const query = `
        WITH episode_last_watched AS (
          SELECT 
            item_id,
            MAX(date_watched) as last_watch_date
          FROM jf_playback_activity
          GROUP BY item_id
        )
        SELECT 
          e.*,
          s.parent_id as show_id,
          lw.last_watch_date,
          EXTRACT(DAY FROM NOW() - lw.last_watch_date) as days_since_watched
        FROM jf_library_episodes e
        JOIN jf_library_seasons s ON e.parent_id = s.ID
        JOIN episode_last_watched lw ON lw.item_id = e.ID
        WHERE s.library_id = $1
        AND NOT e.archived
        AND EXTRACT(DAY FROM NOW() - lw.last_watch_date) >= $2
      `;
      const result = await db.query(query, [rule.library_id, rule.days_since_watched]);
      return result.rows;
    } catch (error) {
      console.error("[DELETION-RULES] Error finding episodes for deletion:", error);
      throw error;
    }
  }

  async findItemsForDeletion(rule) {
    try {
      if (rule.media_type === 'show') {
        return this.findShowsForDeletion(rule);
      } else if (rule.media_type === 'episode') {
        return this.findEpisodesForDeletion(rule);
      } else {
        // For movies and other media types
        const query = `
          WITH last_watched AS (
            SELECT 
              item_id,
              MAX(date_watched) as last_watch_date
            FROM jf_playback_activity
            GROUP BY item_id
          )
          SELECT 
            i.*,
            lw.last_watch_date,
            EXTRACT(DAY FROM NOW() - lw.last_watch_date) as days_since_watched
          FROM jf_library_items i
          JOIN last_watched lw ON lw.item_id = i.ID
          WHERE i.library_id = $1
          AND NOT i.archived
          AND EXTRACT(DAY FROM NOW() - lw.last_watch_date) >= $2
        `;
        const result = await db.query(query, [rule.library_id, rule.days_since_watched]);
        return result.rows;
      }
    } catch (error) {
      console.error("[DELETION-RULES] Error finding items for deletion:", error);
      throw error;
    }
  }

  calculateDaysUntilDeletion(item, rule) {
    const daysSinceWatched = parseInt(item.days_since_watched);
    return rule.days_since_watched - daysSinceWatched;
  }

  async deleteItem(item, rule, externalServices) {
    try {
      // Delete from Jellyfin
      await this.deleteFromJellyfin(item);

      // Delete from external services
      if (externalServices.sonarr?.enabled && rule.media_type === 'show') {
        await this.deleteFromSonarr(item, externalServices.sonarr);
      }
      if (externalServices.radarr?.enabled && rule.media_type === 'movie') {
        await this.deleteFromRadarr(item, externalServices.radarr);
      }
      if (externalServices.jellyseerr?.enabled) {
        await this.deleteFromJellyseerr(item, externalServices.jellyseerr);
      }

      // Record deletion in history
      await this.recordDeletion(item, rule);

      // Send deletion notification
      await this.sendDeletionNotification(item, rule, externalServices);

    } catch (error) {
      console.error("[DELETION-RULES] Error deleting item:", error);
      throw error;
    }
  }

  async deleteFromJellyfin(item) {
    try {
      const config = await this.config.getConfig();
      const url = `${config.JF_HOST}/Items/${item.jellyfin_id}`;
      await axios.delete(url, {
        headers: {
          'X-MediaBrowser-Token': config.JF_API_KEY
        }
      });
    } catch (error) {
      console.error("[DELETION-RULES] Error deleting from Jellyfin:", error);
      throw error;
    }
  }

  async deleteFromSonarr(item, sonarrConfig) {
    try {
      const url = `${sonarrConfig.url}/api/v3/series/${item.sonarr_id}`;
      await axios.delete(url, {
        params: { deleteFiles: sonarrConfig.delete_files },
        headers: { 'X-Api-Key': sonarrConfig.api_key }
      });
    } catch (error) {
      console.error("[DELETION-RULES] Error deleting from Sonarr:", error);
    }
  }

  async deleteFromRadarr(item, radarrConfig) {
    try {
      const url = `${radarrConfig.url}/api/v3/movie/${item.radarr_id}`;
      await axios.delete(url, {
        params: { deleteFiles: radarrConfig.delete_files },
        headers: { 'X-Api-Key': radarrConfig.api_key }
      });
    } catch (error) {
      console.error("[DELETION-RULES] Error deleting from Radarr:", error);
    }
  }

  async deleteFromJellyseerr(item, jellyseerrConfig) {
    try {
      const url = `${jellyseerrConfig.url}/api/v1/media/${item.jellyseerr_id}`;
      await axios.delete(url, {
        headers: { 'X-Api-Key': jellyseerrConfig.api_key }
      });
    } catch (error) {
      console.error("[DELETION-RULES] Error deleting from Jellyseerr:", error);
    }
  }

  async recordDeletion(item, rule) {
    try {
      const query = `
        INSERT INTO jf_deletion_history (
          item_id, library_id, rule_id, title, media_type,
          last_watched, metadata, sonarr_id, radarr_id, jellyseerr_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;
      const values = [
        item.ID,
        rule.library_id,
        rule.ID,
        item.title,
        rule.media_type,
        item.last_watch_date,
        JSON.stringify(item),
        item.sonarr_id,
        item.radarr_id,
        item.jellyseerr_id
      ];
      await db.query(query, values);
    } catch (error) {
      console.error("[DELETION-RULES] Error recording deletion:", error);
      throw error;
    }
  }

  async sendDeletionWarning(item, rule, daysUntilDeletion, externalServices) {
    if (!externalServices.discord?.enabled) return;

    try {
      const webhookClient = new WebhookClient({ url: externalServices.discord.webhook_url });
      const mentionRole = externalServices.discord.mention_role_id ? `<@&${externalServices.discord.mention_role_id}>` : '';
      
      await webhookClient.send({
        content: `${mentionRole} **Deletion Warning**\n${item.title} will be deleted in ${daysUntilDeletion} days due to inactivity (Rule: ${rule.rule_name})`,
        username: 'Jellystat Deletion Manager'
      });
    } catch (error) {
      console.error("[DELETION-RULES] Error sending deletion warning:", error);
    }
  }

  async sendDeletionNotification(item, rule, externalServices) {
    if (!externalServices.discord?.enabled) return;

    try {
      const webhookClient = new WebhookClient({ url: externalServices.discord.webhook_url });
      const mentionRole = externalServices.discord.mention_role_id ? `<@&${externalServices.discord.mention_role_id}>` : '';
      
      await webhookClient.send({
        content: `${mentionRole} **Media Deleted**\n${item.title} has been deleted due to inactivity (Rule: ${rule.rule_name})`,
        username: 'Jellystat Deletion Manager'
      });
    } catch (error) {
      console.error("[DELETION-RULES] Error sending deletion notification:", error);
    }
  }
}

module.exports = new DeletionRules();
