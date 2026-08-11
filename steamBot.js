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

            // Timeout after 30 seconds
            setTimeout(() => {
                if (!this.isLoggedIn) {
                    reject(new Error('Steam login timeout'));
                }
            }, 30000);
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

                // Send commend via Steam
                // Using steam-user's built-in commend functionality
                this.client.sendMessage(targetSteamID, {
                    type: 'commend',
                    commendType: commendType,
                    timestamp: Math.floor(Date.now() / 1000)
                });

                console.log(`✅ ${commendType} commend sent to ${targetSteamID}`);
                resolve();

                // Timeout after 5 seconds
                setTimeout(() => {
                    if (!resolve) {
                        reject(new Error('Commend send timeout'));
                    }
                }, 5000);

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
