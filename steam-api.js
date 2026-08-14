'use strict';

require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const STEAM_API_BASE = 'https://api.steampowered.com';

// Load API key: prefer environment variable, fall back to config.json
function getApiKey() {
    if (process.env.STEAM_API_KEY) {
        return process.env.STEAM_API_KEY;
    }
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config.steamWebAPIKey || null;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Validate that a string looks like a 64-bit Steam ID (17 numeric digits).
 * @param {string} steamId
 * @returns {boolean}
 */
function validateSteamId(steamId) {
    return /^\d{17}$/.test(String(steamId));
}

/**
 * Fetch a player's public profile summary from the Steam Web API.
 * @param {string} steamId - 64-bit Steam ID
 * @returns {Promise<Object|null>} Player summary object or null on failure
 */
async function getPlayerProfile(steamId) {
    if (!validateSteamId(steamId)) {
        throw new Error(`Invalid Steam ID: ${steamId}`);
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('Steam Web API key is not configured');
    }

    try {
        const response = await axios.get(
            `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/`,
            {
                params: {
                    key: apiKey,
                    steamids: steamId
                }
            }
        );

        const players = response.data &&
            response.data.response &&
            response.data.response.players;

        if (!players || players.length === 0) {
            return null;
        }

        return players[0];
    } catch (error) {
        const status = error.response && error.response.status;
        throw new Error(
            `Failed to fetch Steam profile for ${steamId}: ${status ? `HTTP ${status}` : error.message}`
        );
    }
}

/**
 * Fetch a player's CS2 (App ID 730) stats from the Steam Web API.
 * @param {string} steamId - 64-bit Steam ID
 * @returns {Promise<Object|null>} Stats object or null when profile is private
 */
async function getPlayerStats(steamId) {
    if (!validateSteamId(steamId)) {
        throw new Error(`Invalid Steam ID: ${steamId}`);
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('Steam Web API key is not configured');
    }

    try {
        const response = await axios.get(
            `${STEAM_API_BASE}/ISteamUserStats/GetUserStatsForGame/v0002/`,
            {
                params: {
                    key: apiKey,
                    steamid: steamId,
                    appid: 730
                }
            }
        );

        return (response.data && response.data.playerstats) || null;
    } catch (error) {
        // 401/403 means the profile/stats are private or restricted – return null
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            return null;
        }
        const status = error.response && error.response.status;
        throw new Error(
            `Failed to fetch Steam stats for ${steamId}: ${status ? `HTTP ${status}` : error.message}`
        );
    }
}

module.exports = {
    validateSteamId,
    getPlayerProfile,
    getPlayerStats
};
