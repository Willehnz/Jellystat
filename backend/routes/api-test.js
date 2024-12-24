const express = require("express");
const router = express.Router();
const axios = require("axios");

// Test Jellyfin connection
router.post("/test/jellyfin", async (req, res) => {
  const { url, apiKey } = req.body;
  try {
    const response = await axios.get(`${url}/System/Info`, {
      headers: { "X-MediaBrowser-Token": apiKey }
    });
    res.json({
      success: true,
      serverInfo: {
        version: response.data.Version,
        serverName: response.data.ServerName
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Test Sonarr connection
router.post("/test/sonarr", async (req, res) => {
  const { url, apiKey } = req.body;
  try {
    const response = await axios.get(`${url}/api/v3/system/status`, {
      headers: { "X-Api-Key": apiKey }
    });
    res.json({
      success: true,
      serverInfo: {
        version: response.data.version,
        buildTime: response.data.buildTime
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Test Radarr connection
router.post("/test/radarr", async (req, res) => {
  const { url, apiKey } = req.body;
  try {
    const response = await axios.get(`${url}/api/v3/system/status`, {
      headers: { "X-Api-Key": apiKey }
    });
    res.json({
      success: true,
      serverInfo: {
        version: response.data.version,
        buildTime: response.data.buildTime
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Test Jellyseerr connection
router.post("/test/jellyseerr", async (req, res) => {
  const { url, apiKey } = req.body;
  try {
    const response = await axios.get(`${url}/api/v1/status`, {
      headers: { "X-Api-Key": apiKey }
    });
    res.json({
      success: true,
      serverInfo: {
        version: response.data.version,
        totalRequests: response.data.totalRequests
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Test Discord webhook
router.post("/test/discord", async (req, res) => {
  const { webhookUrl } = req.body;
  try {
    await axios.post(webhookUrl, {
      content: "🔍 Jellystat connection test successful!",
      username: "Jellystat Deletion Manager"
    });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

module.exports = router;
