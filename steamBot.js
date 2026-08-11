const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const CSGO = require('csgo');
const fs = require('fs');
const path = require('path');

class SteamBot {
    constructor(username, password, sharedSecret) {
        this.username = username;
        this.password = password;
        this.sharedSecret = sharedSecret;
        this.client = new SteamUser();
        this.csgo = null;
        this.isLoggedIn = false;
    }

    async login() {
        return new Promise((resolve, reject) => {
            console.log(`🔐 Logging in as ${this.username}...`);

            this.client.on('loggedIn', () => {
                console.log(`✅ Logged in as ${this.username}`);
                this.isLoggedIn = true;
                resolve();
            });

            this.client.on('error', (err) => {
                console.error(`❌ Steam login error: ${err.message}`);
                reject(err);
            });

            this.client.on('steamGuard', (domain, callback) => {
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
        });
    }

    async connectToCSGO() {
        return new Promise((resolve, reject) => {
            console.log('🎮 Connecting to CS2 coordinator...');

            this.csgo = new CSGO(this.client, false);

            this.csgo.on('connectedToGC', () => {
                console.log(`✅ Connected to CS2 coordinator`);
                resolve();
            });

            this.csgo.on('error', (err) => {
                console.error(`❌ CS2 coordinator error: ${err.message}`);
                reject(err);
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                if (!this.csgo.haveGCSession) {
                    reject(new Error('CS2 coordinator connection timeout'));
                }
            }, 10000);
        });
    }

    async sendCommend(targetSteamID, commendType) {
        return new Promise((resolve, reject) => {
            if (!this.isLoggedIn) {
                reject(new Error('Not logged in'));
                return;
            }

            if (!this.csgo || !this.csgo.haveGCSession) {
                reject(new Error('Not connected to CS2 coordinator'));
                return;
            }

            // Map commend types to game coordinator codes
            const commendMap = {
                friendly: 1,
                teaching: 2,
                leader: 4
            };

            const commendCode = commendMap[commendType.toLowerCase()];
            if (!commendCode) {
                reject(new Error(`Invalid commend type: ${commendType}`));
                return;
            }

            try {
                console.log(`📤 Sending ${commendType} commend to ${targetSteamID}...`);

                // Send commend via CS2 coordinator
                this.csgo.sendMessage(
                    SteamUser.EMsg.ClientCMsgCommendPlayer,
                    {
                        player_steamid: targetSteamID,
                        commendation: commendCode,
                        tokens: 0
                    },
                    (err, msg) => {
                        if (err) {
                            console.error(`❌ Failed to send commend: ${err.message}`);
                            reject(err);
                        } else {
                            console.log(`✅ Commend sent successfully to ${targetSteamID}`);
                            resolve();
                        }
                    }
                );

                // Timeout after 5 seconds
                setTimeout(() => {
                    reject(new Error('Commend send timeout'));
                }, 5000);

            } catch (err) {
                reject(err);
            }
        });
    }

    logout() {
        if (this.client) {
            this.client.logOff();
            this.isLoggedIn = false;
        }
    }
}

module.exports = SteamBot;
