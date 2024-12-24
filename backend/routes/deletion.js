const express = require("express");
const router = express.Router();
const DeletionRules = require("../models/jf_deletion_rules");
const db = require("../db");

// Get all deletion rules
router.get("/rules", async (req, res) => {
  try {
    const rules = await DeletionRules.getRules();
    res.json(rules);
  } catch (error) {
    console.error("[DELETION-ROUTES] Error getting rules:", error);
    res.status(500).json({ error: "Failed to get deletion rules" });
  }
});

// Get a specific rule
router.get("/rules/:id", async (req, res) => {
  try {
    const rule = await DeletionRules.getRuleById(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.json(rule);
  } catch (error) {
    console.error("[DELETION-ROUTES] Error getting rule:", error);
    res.status(500).json({ error: "Failed to get deletion rule" });
  }
});

// Create a new rule
router.post("/rules", async (req, res) => {
  try {
    const rule = await DeletionRules.createRule(req.body);
    res.status(201).json(rule);
  } catch (error) {
    console.error("[DELETION-ROUTES] Error creating rule:", error);
    res.status(500).json({ error: "Failed to create deletion rule" });
  }
});

// Update a rule
router.put("/rules/:id", async (req, res) => {
  try {
    const rule = await DeletionRules.updateRule(req.params.id, req.body);
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.json(rule);
  } catch (error) {
    console.error("[DELETION-ROUTES] Error updating rule:", error);
    res.status(500).json({ error: "Failed to update deletion rule" });
  }
});

// Delete a rule
router.delete("/rules/:id", async (req, res) => {
  try {
    await DeletionRules.deleteRule(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("[DELETION-ROUTES] Error deleting rule:", error);
    res.status(500).json({ error: "Failed to delete rule" });
  }
});

// Get deletion history
router.get("/history", async (req, res) => {
  try {
    const query = `
      SELECT 
        h.*,
        l.NAME as library_name,
        r.rule_name
      FROM jf_deletion_history h
      JOIN jf_libraries l ON l.ID = h.library_id
      JOIN jf_deletion_rules r ON r.ID = h.rule_id
      ORDER BY h.deleted_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await db.query(query, [limit, offset]);
    
    // Get total count
    const countResult = await db.query('SELECT COUNT(*) FROM jf_deletion_history');
    const total = parseInt(countResult.rows[0].count);

    res.json({
      items: result.rows,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error("[DELETION-ROUTES] Error getting history:", error);
    res.status(500).json({ error: "Failed to get deletion history" });
  }
});

// Get deletion statistics
router.get("/stats", async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_deletions,
        SUM(CASE WHEN media_type = 'movie' THEN 1 ELSE 0 END) as movies_deleted,
        SUM(CASE WHEN media_type = 'show' THEN 1 ELSE 0 END) as shows_deleted,
        SUM(CASE WHEN media_type = 'episode' THEN 1 ELSE 0 END) as episodes_deleted,
        MIN(deleted_at) as first_deletion,
        MAX(deleted_at) as last_deletion
      FROM jf_deletion_history
    `);

    const byLibrary = await db.query(`
      SELECT 
        l.NAME as library_name,
        COUNT(*) as deletions
      FROM jf_deletion_history h
      JOIN jf_libraries l ON l.ID = h.library_id
      GROUP BY l.NAME
      ORDER BY deletions DESC
    `);

    const byRule = await db.query(`
      SELECT 
        r.rule_name,
        COUNT(*) as deletions
      FROM jf_deletion_history h
      JOIN jf_deletion_rules r ON r.ID = h.rule_id
      GROUP BY r.rule_name
      ORDER BY deletions DESC
    `);

    res.json({
      overview: stats.rows[0],
      by_library: byLibrary.rows,
      by_rule: byRule.rows
    });
  } catch (error) {
    console.error("[DELETION-ROUTES] Error getting stats:", error);
    res.status(500).json({ error: "Failed to get deletion statistics" });
  }
});

// Preview deletion rules (dry run)
router.get("/preview", async (req, res) => {
  try {
    const preview = await DeletionRules.previewRules();
    res.json(preview);
  } catch (error) {
    console.error("[DELETION-ROUTES] Error previewing rules:", error);
    res.status(500).json({ error: "Failed to preview deletion rules" });
  }
});

// Preview specific rule
router.get("/preview/:id", async (req, res) => {
  try {
    const preview = await DeletionRules.previewRule(req.params.id);
    res.json(preview);
  } catch (error) {
    console.error("[DELETION-ROUTES] Error previewing rule:", error);
    res.status(500).json({ error: "Failed to preview deletion rule" });
  }
});

// Manually trigger rule processing
router.post("/process", async (req, res) => {
  try {
    const dryRun = req.query.dryRun === 'true';
    const result = await DeletionRules.processRules(dryRun);
    res.json({
      message: dryRun ? "Dry run completed successfully" : "Rule processing triggered successfully",
      result
    });
  } catch (error) {
    console.error("[DELETION-ROUTES] Error processing rules:", error);
    res.status(500).json({ error: "Failed to process deletion rules" });
  }
});

module.exports = router;
