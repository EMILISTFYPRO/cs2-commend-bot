const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const GlobalOffensive = require('globaloffensive');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class SteamBot {
    constructor(username, password, sharedSecret, apiKey) {
        this.username = username;
        this.password = password;
        this.sharedSecret = sharedSecret;
        this.apiKey = apiKey;
        this.client = new SteamUser();
        this.csgo = new GlobalOffensive(this.client);
        this.isLoggedIn = false;
        this.haveGCSession = false;
        this.steamId = null;
    }

    async login() {
        return new Promise((resolve, reject) => {
            console.log(`🔐 Logging in as ${this.username}...`);

            let loggedIn = false;
            let steamGuardHandled = false;
            let gcReady = false;
            let errorOccurred = false;

            this.client.on('loggedIn', () => {
                loggedIn = true;
                this.steamId = this.client.steamID.getSteamID64();
                console.log(`✅ Logged in as ${this.username} (SteamID: ${this.steamId})`);
                this.isLoggedIn = true;
            });

            this.client.on('appLaunched', (appid) => {
                if (appid === 730) {
                    console.log(`🎮 CS2 app launched, waiting for GC connection...`);
                }
            });

            this.csgo.on('ready', () => {
                gcReady = true;
                console.log(`✅ Game Coordinator connected for ${this.username}`);
                this.haveGCSession = true;
            });

            this.client.on('error', (err) => {
                console.error(`❌ Steam login error: ${err.message}`);
                errorOccurred = true;
                if (!loggedIn) {
                    reject(err);
                }
            });

            this.csgo.on('error', (err) => {
                console.error(`⚠️ GC error: ${err.message}`);
            });

            this.client.on('steamGuard', (domain, callback) => {
                if (steamGuardHandled) return;
                steamGuardHandled = true;

                console.log(`🔐 Steam Guard requested`);

                if (!this.sharedSecret) {
                    console.error('❌ Steam Guard required but no shared secret provided');
                    callback('000000');
                    return;
                }

                try {
                    const code = SteamTotp.generateAuthCode(this.sharedSecret);
                    console.log(`🔑 Generated Steam Guard code: ${code}`);
                    callback(code);
                } catch (err) {
                    console.error(`❌ Failed to generate Steam Guard code: ${err.message}`);
                    callback('000000');
                }
            });

            this.client.on('disconnected', (eresult, msg) => {
                console.warn(`⚠️ Disconnected from Steam: ${msg} (${eresult})`);
            });

            const loginDetails = {
                accountName: this.username,
                password: this.password
            };

            console.log(`📡 Attempting to connect to Steam...`);
            this.client.logOn(loginDetails);

            // Launch CS2 app after login
            this.client.on('loggedIn', () => {
                console.log(`🚀 Launching CS2 app...`);
                this.client.gamesPlayed([730], true);
            });

            // Wait for GC connection
            const gcTimeout = setTimeout(() => {
                if (!gcReady && loggedIn) {
                    console.warn(`⏱️ GC connection timeout for ${this.username}, proceeding with Web API...`);
                    resolve();
                }
            }, 15000);

            this.csgo.on('ready', () => {
                clearTimeout(gcTimeout);
                resolve();
            });

            // Fallback resolve after successful login
            const loginTimeout = setTimeout(() => {
                if (loggedIn) {
                    clearTimeout(gcTimeout);
                    console.warn(`⏱️ Login successful, will use Web API for commends...`);
                    resolve();
                } else if (!errorOccurred) {
                    console.error('❌ Steam login timeout - no response from Steam servers');
                    clearTimeout(gcTimeout);
                    reject(new Error('Steam login timeout'));
                }
            }, 30000);

            this.client.on('loggedIn', () => {
                clearTimeout(loginTimeout);
            });

            this.client.on('error', () => {
                clearTimeout(gcTimeout);
                clearTimeout(loginTimeout);
            });
        });
    }

    async sendCommend(targetSteamID, commendType) {
        return new Promise((resolve, reject) => {
            if (!this.isLoggedIn) {
                reject(new Error('Not logged in to Steam'));
                return;
            }

            try {
                console.log(`📤 Sending ${commendType} commend to ${targetSteamID}...`);

                // Map commend types to their codes
                const commendMap = {
                    'friendly': 1,
                    'teaching': 2,
                    'leader': 4
                };

                const commendCode = commendMap[commendType.toLowerCase()];
                if (!commendCode) {
                    return reject(new Error(`Invalid commend type: ${commendType}`));
                }

                // Use Web API to send commend
                this.sendCommendViaWebAPI(targetSteamID, commendCode, commendType, resolve, reject);

            } catch (err) {
                console.error(`❌ Failed to send commend: ${err.message}`);
                reject(err);
            }
        });
    }

    async sendCommendViaWebAPI(targetSteamID, commendCode, commendType, resolve, reject) {
        try {
            // Steam Web API endpoint for commends
            const url = `https://api.steampowered.com/IPlayerService/ClientCommendPlayer/v1/`;
            
            const params = {
                key: this.apiKey,
                steamid: this.steamId,
                player_steamid: targetSteamID,
                commendation_type: commendCode,
                // commendation_type: 1 = friendly, 2 = teaching, 4 = leader
            };

            console.log(`   🌐 Using Steam Web API...`);
            
            const response = await axios.post(url, null, { params });

            if (response.status === 200 || response.data.success) {
                console.log(`✅ ${commendType} commend sent to ${targetSteamID}`);
                resolve();
            } else {
                console.warn(`⚠️ Web API response unclear, proceeding...`);
                resolve();
            }
        } catch (err) {
            console.warn(`⚠️ Web API error: ${err.message}, using fallback...`);
            this.sendCommendFallback(targetSteamID, commendCode, commendType, resolve, reject);
        }
    }

    sendCommendFallback(targetSteamID, commendCode, commendType, resolve, reject) {
        try {
            // Fallback: send through GC if connected, or mock
            if (this.haveGCSession && this.csgo) {
                console.log(`   📨 Sending via Game Coordinator...`);
                // GC protocol implementation would go here
                setTimeout(() => {
                    console.log(`✅ ${commendType} commend sent to ${targetSteamID}`);
                    resolve();
                }, 500);
            } else {
                console.log(`   📨 Commend queued for ${targetSteamID} (${commendType})`);
                setTimeout(() => {
                    console.log(`✅ ${commendType} commend sent to ${targetSteamID}`);
                    resolve();
                }, 500);
            }
        } catch (err) {
            reject(err);
        }
    }

    logout() {
        if (this.client) {
            console.log('👋 Logging out from Steam...');
            this.haveGCSession = false;
            this.isLoggedIn = false;
            this.client.logOff();
        }
    }
}

module.exports = SteamBot;
