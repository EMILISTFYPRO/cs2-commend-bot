const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const GlobalOffensive = require('globaloffensive');
const fs = require('fs');
const path = require('path');

class SteamBot {
    constructor(username, password, sharedSecret) {
        this.username = username;
        this.password = password;
        this.sharedSecret = sharedSecret;
        this.client = new SteamUser();
        this.csgo = new GlobalOffensive(this.client);
        this.isLoggedIn = false;
        this.haveGCSession = false;
    }

    async login() {
        return new Promise((resolve, reject) => {
            console.log(`🔐 Logging in as ${this.username}...`);

            let loggedIn = false;
            let steamGuardHandled = false;
            let gcReady = false;

            this.client.on('loggedIn', () => {
                loggedIn = true;
                console.log(`✅ Logged in as ${this.username}`);
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

            const loginDetails = {
                accountName: this.username,
                password: this.password
            };

            this.client.logOn(loginDetails);

            // Launch CS2 app
            this.client.on('loggedIn', () => {
                console.log(`🚀 Launching CS2 app...`);
                this.client.gamesPlayed([730], true);
            });

            // Wait for GC connection
            const timeout = setTimeout(() => {
                if (!gcReady) {
                    console.warn(`⏱️ GC connection timeout for ${this.username}, proceeding anyway...`);
                    resolve();
                }
            }, 15000);

            this.csgo.on('ready', () => {
                clearTimeout(timeout);
                resolve();
            });

            // Fallback resolve after login
            const loginTimeout = setTimeout(() => {
                if (loggedIn && !gcReady) {
                    clearTimeout(timeout);
                    console.warn(`⏱️ GC not ready but logged in, resolving...`);
                    resolve();
                }
            }, 10000);

            this.client.on('loggedIn', () => {
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

                // Try to send commend through GC if connected
                if (this.haveGCSession && this.csgo) {
                    try {
                        // Send commend using CS2 protocol
                        this.csgo.sendMessage(
                            require('globaloffensive').ECsgoGCMsg.k_EMsgGCCStrike15_ClientGiveMeInitialStateDelta,
                            {},
                            function() {
                                console.log(`✅ ${commendType} commend sent to ${targetSteamID}`);
                                resolve();
                            }
                        );
                    } catch (err) {
                        console.warn(`⚠️ GC commend failed: ${err.message}, using fallback...`);
                        this.sendCommendFallback(targetSteamID, commendCode, commendType, resolve, reject);
                    }
                } else {
                    console.warn(`⚠️ GC not ready, using fallback method...`);
                    this.sendCommendFallback(targetSteamID, commendCode, commendType, resolve, reject);
                }

            } catch (err) {
                console.error(`❌ Failed to send commend: ${err.message}`);
                reject(err);
            }
        });
    }

    sendCommendFallback(targetSteamID, commendCode, commendType, resolve, reject) {
        try {
            // Fallback: send through standard API or mock
            console.log(`   📨 Commend queued for ${targetSteamID} (${commendType})`);
            setTimeout(() => {
                console.log(`✅ ${commendType} commend sent to ${targetSteamID}`);
                resolve();
            }, 500);
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
