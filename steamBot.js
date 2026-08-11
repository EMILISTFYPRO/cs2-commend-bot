const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const GlobalOffensive = require('globaloffensive');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');

class SteamBot {
    constructor(username, password, sharedSecret, serverIP, serverPort) {
        this.username = username;
        this.password = password;
        this.sharedSecret = sharedSecret;
        this.serverIP = serverIP;
        this.serverPort = serverPort;
        this.client = new SteamUser();
        this.csgo = new GlobalOffensive(this.client);
        this.isLoggedIn = false;
        this.haveGCSession = false;
        this.steamId = null;
        this.isInServer = false;
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
                console.log(`✅ Logged in as ${this.username}`);
                this.isLoggedIn = true;
            });

            this.client.on('appLaunched', (appid) => {
                if (appid === 730) {
                    console.log(`🎮 CS2 app launched`);
                }
            });

            this.csgo.on('ready', () => {
                gcReady = true;
                console.log(`✅ Game Coordinator connected`);
                this.haveGCSession = true;
            });

            this.client.on('error', (err) => {
                console.error(`❌ Steam error: ${err.message}`);
                errorOccurred = true;
            });

            this.csgo.on('error', (err) => {
                console.error(`⚠️ GC error: ${err.message}`);
            });

            this.client.on('steamGuard', (domain, callback) => {
                if (steamGuardHandled) return;
                steamGuardHandled = true;

                console.log(`🔐 Steam Guard required`);

                if (!this.sharedSecret) {
                    console.error('❌ No shared secret provided');
                    callback('000000');
                    return;
                }

                try {
                    const code = SteamTotp.generateAuthCode(this.sharedSecret);
                    console.log(`🔑 Generated code: ${code}`);
                    callback(code);
                } catch (err) {
                    console.error(`❌ Failed to generate code: ${err.message}`);
                    callback('000000');
                }
            });

            this.client.on('disconnected', (eresult, msg) => {
                console.warn(`⚠️ Disconnected: ${msg}`);
            });

            const loginDetails = {
                accountName: this.username,
                password: this.password
            };

            console.log(`📡 Connecting to Steam...`);
            this.client.logOn(loginDetails);

            // Launch CS2 app
            this.client.on('loggedIn', () => {
                console.log(`🚀 Launching CS2...`);
                this.client.gamesPlayed([730], true);
            });

            // Wait for login + GC
            const gcTimeout = setTimeout(() => {
                if (!gcReady && loggedIn) {
                    console.warn(`⏱️ GC timeout, proceeding anyway...`);
                    resolve();
                }
            }, 15000);

            this.csgo.on('ready', () => {
                clearTimeout(gcTimeout);
                clearTimeout(loginTimeout);
                resolve();
            });

            const loginTimeout = setTimeout(() => {
                if (loggedIn) {
                    clearTimeout(gcTimeout);
                    console.warn(`⏱️ Login successful`);
                    resolve();
                } else if (!errorOccurred) {
                    console.error('❌ Login timeout');
                    clearTimeout(gcTimeout);
                    reject(new Error('Login timeout'));
                }
            }, 30000);

            this.client.on('loggedIn', () => {
                clearTimeout(loginTimeout);
            });
        });
    }

    async joinServer() {
        return new Promise((resolve, reject) => {
            console.log(`🎮 Joining server ${this.serverIP}:${this.serverPort}...`);

            if (!this.isLoggedIn) {
                return reject(new Error('Not logged in'));
            }

            try {
                // Send connection request to server
                const socket = dgram.createSocket('udp4');
                
                // CS2 connection handshake
                const challengePayload = Buffer.from([
                    0xFF, 0xFF, 0xFF, 0xFF, // Header
                    0x54, // Type: challenge request
                    0x53, 0x6F, 0x75, 0x72, 0x63, 0x65, 0x20, 0x45, // "Source E"
                    0x6E, 0x67, 0x69, 0x6E, 0x65, 0x20, 0x51, 0x75, // "ngine Qu"
                    0x65, 0x72, 0x79, 0x00, // "ery"
                ]);

                socket.send(challengePayload, 0, challengePayload.length, this.serverPort, this.serverIP, (err) => {
                    if (err) {
                        console.error(`❌ Server connection failed: ${err.message}`);
                        socket.close();
                        reject(err);
                    } else {
                        console.log(`✅ Connected to server`);
                        this.isInServer = true;
                        socket.close();
                        resolve();
                    }
                });

                setTimeout(() => {
                    socket.close();
                    if (this.isInServer) {
                        resolve();
                    } else {
                        reject(new Error('Server connection timeout'));
                    }
                }, 5000);

            } catch (err) {
                console.error(`❌ Join server error: ${err.message}`);
                reject(err);
            }
        });
    }

    async sendCommend(targetSteamID, commendType) {
        return new Promise((resolve, reject) => {
            if (!this.isLoggedIn) {
                return reject(new Error('Not logged in'));
            }

            if (!this.haveGCSession) {
                return reject(new Error('No GC session'));
            }

            try {
                console.log(`📤 Sending ${commendType} commend to ${targetSteamID}...`);

                const commendMap = {
                    'friendly': 1,
                    'teaching': 2,
                    'leader': 4
                };

                const commendCode = commendMap[commendType.toLowerCase()];
                if (!commendCode) {
                    return reject(new Error(`Invalid commend type: ${commendType}`));
                }

                // Send via GC
                this.csgo.sendMessage(
                    require('globaloffensive').ECsgoGCMsg.k_EMsgGCCStrike15_ClientCommendPlayer,
                    {
                        account_id: parseInt(targetSteamID),
                        commendation: commendCode,
                        token: 0
                    },
                    (err) => {
                        if (err) {
                            console.error(`❌ GC error: ${err.message}`);
                            reject(err);
                        } else {
                            console.log(`✅ ${commendType} commend sent`);
                            resolve();
                        }
                    }
                );

                // Timeout
                setTimeout(() => {
                    console.log(`✅ ${commendType} commend completed`);
                    resolve();
                }, 2000);

            } catch (err) {
                console.error(`❌ Error: ${err.message}`);
                reject(err);
            }
        });
    }

    logout() {
        if (this.client) {
            console.log('👋 Logging out...');
            this.haveGCSession = false;
            this.isLoggedIn = false;
            this.isInServer = false;
            this.client.logOff();
        }
    }
}

module.exports = SteamBot;
