const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Load config
const configPath = path.join(__dirname, 'config.json');
let config = {};

if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} else {
    console.error('❌ config.json not found! Please create it first.');
    process.exit(1);
}

// Initialize database
const db = new sqlite3.Database('commends.db', (err) => {
    if (err) console.error('Database error:', err);
    else console.log('✅ Database connected');
});

// Create tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            shared_secret TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS commends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER,
            target_steamid TEXT,
            commend_type TEXT,
            status TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS balances (
            discord_id TEXT PRIMARY KEY,
            steam_id TEXT,
            balance INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// Main commend function
async function sendCommends(targetSteamID, commendTypes) {
    console.log(`\n🎯 Starting commends for: ${targetSteamID}`);
    console.log(`📊 Commend types: ${JSON.stringify(commendTypes)}`);

    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM accounts', async (err, accounts) => {
            if (err) {
                console.error('❌ Error fetching accounts:', err);
                reject(err);
                return;
            }

            if (accounts.length === 0) {
                console.error('❌ No bot accounts found! Add accounts using: npm run manage-db');
                reject(new Error('No accounts'));
                return;
            }

            let successCount = 0;
            let failCount = 0;

            // Process each account
            for (let account of accounts) {
                try {
                    console.log(`\n👤 Using account: ${account.username}`);
                    
                    // Simulate commend (in real implementation, connect to Steam)
                    for (let [type, count] of Object.entries(commendTypes)) {
                        if (count > 0) {
                            console.log(`   ✓ ${type}: ${count} commends`);
                            
                            // Log to database
                            db.run(
                                'INSERT INTO commends (account_id, target_steamid, commend_type, status) VALUES (?, ?, ?, ?)',
                                [account.id, targetSteamID, type, 'success']
                            );
                            
                            successCount += count;
                        }
                    }

                    // Small delay between accounts
                    await new Promise(r => setTimeout(r, 1000));

                } catch (error) {
                    console.error(`   ❌ Error with ${account.username}:`, error.message);
                    failCount++;
                }
            }

            console.log(`\n✅ Commending complete!`);
            console.log(`   Success: ${successCount}`);
            console.log(`   Failed: ${failCount}`);
            
            resolve({ success: successCount, failed: failCount });
        });
    });
}

// Check player balance
function checkBalance(discordId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT balance FROM balances WHERE discord_id = ?',
            [discordId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.balance : 0);
            }
        );
    });
}

// Deduct balance
function deductBalance(discordId, amount) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE balances SET balance = balance - ? WHERE discord_id = ?',
            [amount, discordId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Add balance (when customer pays)
function addBalance(discordId, steamId, amount) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR REPLACE INTO balances (discord_id, steam_id, balance) VALUES (?, ?, COALESCE((SELECT balance FROM balances WHERE discord_id = ?), 0) + ?)',
            [discordId, steamId, discordId, amount],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Export functions for Discord bot integration
module.exports = {
    sendCommends,
    checkBalance,
    deductBalance,
    addBalance,
    db
};

// Run if executed directly
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args[0] === 'test') {
        const targetSteamID = args[1] || '76561198000000000';
        const commends = {
            friendly: parseInt(args[2]) || 5,
            teaching: parseInt(args[3]) || 5,
            leader: parseInt(args[4]) || 5
        };
        
        sendCommends(targetSteamID, commends)
            .then(() => {
                console.log('\n✅ Bot finished');
                db.close();
            })
            .catch(err => {
                console.error('❌ Bot error:', err);
                db.close();
            });
    }
}
