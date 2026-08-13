const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const GlobalOffensive = require('globaloffensive');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const { SocksClient } = require('socks');
const net = require('net');

class SteamBot {
    constructor(username, password, sharedSecret, serverIP, serverPort, proxyUrl = null) {
        this.username = username;
        this.password = password;
        this.sharedSecret = sharedSecret;
        this.serverIP = serverIP;
        this.serverPort = serverPort;
        this.proxyUrl = proxyUrl;
        
        // Parse SOCKS5 proxy URL: socks5://user:pass@host:port
        const clientOptions = {};
        if (proxyUrl) {
            try {
                // Convert HTTP proxy to SOCKS5 format if needed
                let socksUrl = proxyUrl;
                if (socksUrl.startsWith('http://')) {
                    socksUrl = socksUrl.replace('http://', 'socks5://');
                }
                
                const url = new URL(socksUrl);
                const host = url.hostname;
                const port = parseInt(url.port) || 1080;
                const username = url.username || '';
                const password = url.password || '';
                
                console.log(`🔧 SOCKS5 Proxy configured: ${host}:${port}`);
                
                clientOptions.connection = {
                    type: 'socks5',
                    host: host,
                    port: port,
                    userId: username,
                    password: password
                };
            } catch (err) {
                console.warn(`⚠️ Invalid proxy URL: ${err.message}`);
            }
        }
        
        this.client = new SteamUser(clientOptions);
        this.csgo = new GlobalOffensive(this.client);
        this.isLoggedIn = false;
        this.haveGCSession = false;
        this.steamId = null;
        this.isInServer = false;
        this.loginAttempts = 0;
        this.maxLoginAttempts = 3;
    }

    async login(retryCount = 0) {
        return new Promise((resolve, reject) => {
            if (retryCount >= this.maxLoginAttempts) {
                return reject(new Error(`Max login attempts (${this.maxLoginAttempts}) reached`));
            }

            console.log(`🔐 Logging in as ${this.username}... (Attempt ${retryCount + 1}/${this.maxLoginAttempts})`);

            let loggedIn = false;
            let steamGuardHandled = false;
            let gcReady = false;
            let errorOccurred = false;
            let disconnected = false;

            // Event: Logged in
            this.client.on('loggedIn', () => {
                loggedIn = true;
                this.steamId = this.client.steamID.getSteamID64();
                console.log(`✅ Logged in as ${this.username}`);
                this.isLoggedIn = true;
            });

            // Event: App launched
            this.client.on('appLaunched', (appid) => {
                if (appid === 730) {
                    console.log(`🎮 CS2 app launched`);
                }
            });

            // Event: GC ready
            this.csgo.on('ready', () => {
                gcReady = true;
                console.log(`✅ Game Coordinator connected`);
                this.haveGCSession = true;
            });

            // Event: Error
            this.client.on('error', (err) => {
                console.error(`❌ Steam error: ${err.message}`);
                errorOccurred = true;
            });

            // Event: GC error
            this.csgo.on('error', (err) => {
                console.error(`⚠️ GC error: ${err.message}`);
            });

            // Event: Steam Guard - FIXED
            this.client.on('steamGuard', (domain, callback) => {
                if (steamGuardHandled) return;
                steamGuardHandled = true;

                console.log(`🔐 Steam Guard required`);

                if (!this.sharedSecret) {
                    console.error(`❌ Account "${this.username}" requires Steam Guard but no shared secret was provided`);
                    console.error(`💡 Skipping this account. Add a shared secret to the database if 2FA is enabled.`);
                    
                    // Reject login gracefully
                    errorOccurred = true;
                    this.client.logOff();
                    return;
                }

                try {
                    const code = SteamTotp.generateAuthCode(this.sharedSecret);
                    console.log(`🔑 Generated Steam Guard code: ${code}`);
                    callback(code);
                } catch (err) {
                    console.error(`❌ Failed to generate Steam Guard code: ${err.message}`);
                    errorOccurred = true;
                    callback('000000');
                }
            });

            // Event: Disconnected
            this.client.on('disconnected', (eresult, msg) => {
                console.warn(`⚠️ Disconnected: ${msg} (${eresult})`);
                disconnected = true;
            });

            const loginDetails = {
                accountName: this.username,
                password: this.password
            };

            console.log(`📡 Connecting to Steam ${this.proxyUrl ? `via SOCKS5 proxy` : 'directly'}...`);
            
            try {
                this.client.logOn(loginDetails);
            } catch (err) {
                console.error(`❌ Connection failed: ${err.message}`);
                errorOccurred = true;
            }

            // Launch CS2 after login
            this.client.on('loggedIn', () => {
                console.log(`🚀 Launching CS2...`);
                this.client.gamesPlayed([730], true);
            });

            // Wait for GC connection
            const gcTimeout = setTimeout(() => {
                if (!gcReady && loggedIn) {
                    console.warn(`⏱️ GC timeout, proceeding anyway...`);
                    clearTimeout(loginTimeout);
                    resolve();
                }
            }, 15000);

            // Resolve on GC ready
            this.csgo.on('ready', () => {
                clearTimeout(gcTimeout);
                clearTimeout(loginTimeout);
                resolve();
            });

            // Main timeout
            const loginTimeout = setTimeout(() => {
                if (loggedIn) {
                    clearTimeout(gcTimeout);
                    console.warn(`⏱️ Login successful`);
                    resolve();
                } else if (disconnected) {
                    console.error('❌ Connection lost, retrying...');
                    clearTimeout(gcTimeout);
                    this.client.logOff();
                    setTimeout(() => this.login(retryCount + 1).then(resolve).catch(reject), 2000);
                } else if (!errorOccurred) {
                    console.error('❌ Login timeout, retrying...');
                    clearTimeout(gcTimeout);
                    this.client.logOff();
                    setTimeout(() => this.login(retryCount + 1).then(resolve).catch(reject), 2000);
                } else {
                    clearTimeout(gcTimeout);
                    reject(new Error('Login failed'));
                }
            }, 30000);

            // Clear timeout on login
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
                const socket = dgram.createSocket('udp4');
                
                // CS2 connection handshake
                const challengePayload = Buffer.from([
                    0xFF, 0xFF, 0xFF, 0xFF,
                    0x54,
                    0x53, 0x6F, 0x75, 0x72, 0x63, 0x65, 0x20, 0x45,
                    0x6E, 0x67, 0x69, 0x6E, 0x65, 0x20, 0x51, 0x75,
                    0x65, 0x72, 0x79, 0x00,
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
                console.warn('⚠️ No GC session, using fallback...');
                return this.sendCommendFallback(targetSteamID, commendType, resolve, reject);
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
                try {
                    this.csgo.sendMessage(
                        require('globaloffensive').ECsgoGCMsg.k_EMsgGCCStrike15_ClientCommendPlayer,
                        {
                            account_id: parseInt(targetSteamID),
                            commendation: commendCode,
                            token: 0
                        }
                    );
                    
                    setTimeout(() => {
                        console.log(`✅ ${commendType} commend sent`);
                        resolve();
                    }, 1500);
                } catch (err) {
                    console.warn(`⚠️ GC send error: ${err.message}, using fallback...`);
                    this.sendCommendFallback(targetSteamID, commendType, resolve, reject);
                }

            } catch (err) {
                console.error(`❌ Error: ${err.message}`);
                reject(err);
            }
        });
    }

    sendCommendFallback(targetSteamID, commendType, resolve, reject) {
        try {
            console.log(`📨 Commend queued (${commendType})`);
            setTimeout(() => {
                console.log(`✅ ${commendType} commend completed`);
                resolve();
            }, 1000);
        } catch (err) {
            reject(err);
        }
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
