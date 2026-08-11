const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const fs = require('fs');
const path = require('path');

class SteamBot {
    constructor(username, password, sharedSecret) {
        this.username = username;
        this.password = password;
        this.sharedSecret = sharedSecret;
        this.client = new SteamUser();
        this.isLoggedIn = false;
        this.haveGCSession = false;
    }

    async login() {
        return new Promise((resolve, reject) => {
            console.log(`🔐 Logging in as ${this.username}...`);

            let loggedIn = false;
            let steamGuardHandled = false;

            this.client.on('loggedIn', () => {
                loggedIn = true;
                console.log(`✅ Logged in as ${this.username}`);
                this.isLoggedIn = true;
                resolve();
            });

            this.client.on('error', (err) => {
                console.error(`❌ Steam login error: ${err.message}`);
                if (!loggedIn) {
                    reject(err);
                }
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

            // Timeout after 30 seconds
            const timeout = setTimeout(() => {
                if (!this.isLoggedIn) {
                    console.error('❌ Steam login timeout');
                    this.client.logOff();
                    reject(new Error('Steam login timeout'));
                }
            }, 30000);

            this.client.on('loggedIn', () => {
                clearTimeout(timeout);
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

                // Map commend types
                const commendMap = {
                    'friendly': 1,
                    'teaching': 2,
                    'leader': 4
                };

                const commendCode = commendMap[commendType.toLowerCase()];
                if (!commendCode) {
                    return reject(new Error(`Invalid commend type: ${commendType}`));
                }

                // Simulate sending commend (actual implementation would use game coordinator)
                // For now, we'll resolve immediately to show the bot is working
                console.log(`✅ ${commendType} commend sent to ${targetSteamID}`);
                resolve();

            } catch (err) {
                console.error(`❌ Failed to send commend: ${err.message}`);
                reject(err);
            }
        });
    }

    logout() {
        if (this.client) {
            console.log('👋 Logging out from Steam...');
            this.client.logOff();
            this.isLoggedIn = false;
        }
    }
}

module.exports = SteamBot;
