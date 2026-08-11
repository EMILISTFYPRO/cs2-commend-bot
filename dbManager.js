const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('commends.db');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(q) {
    return new Promise(resolve => rl.question(q, resolve));
}

// Initialize tables
function initializeTables() {
    return new Promise((resolve) => {
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
            `, () => {
                console.log('✅ Database tables initialized');
                resolve();
            });
        });
    });
}

// Import bots from bots.txt
async function importBotsFromFile() {
    const filePath = path.join(__dirname, 'bots.txt');
    
    if (!fs.existsSync(filePath)) {
        console.log('⚠️  bots.txt not found. Create one with format: username:password');
        return;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
        console.log('⚠️  bots.txt is empty');
        return;
    }

    let imported = 0;
    let skipped = 0;

    for (const line of lines) {
        const [username, password] = line.split(':').map(s => s.trim());
        
        if (!username || !password) {
            console.log(`⚠️  Skipped invalid line: ${line}`);
            skipped++;
            continue;
        }

        try {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO accounts (username, password, shared_secret) VALUES (?, ?, ?)',
                    [username, password, null],
                    (err) => {
                        if (err) {
                            if (err.message.includes('UNIQUE constraint failed')) {
                                console.log(`⚠️  Account already exists: ${username}`);
                                skipped++;
                            } else {
                                console.error(`❌ Error adding ${username}:`, err.message);
                                skipped++;
                            }
                        } else {
                            console.log(`✅ Imported: ${username}`);
                            imported++;
                        }
                        resolve();
                    }
                );
            });
        } catch (err) {
            skipped++;
        }
    }

    console.log(`\n📊 Import complete: ${imported} added, ${skipped} skipped`);
}

async function menu() {
    console.log('\n=== CS2 Commend Bot - Database Manager ===');
    console.log('1. Add single bot account');
    console.log('2. Import bots from bots.txt');
    console.log('3. Add customer balance');
    console.log('4. List accounts');
    console.log('5. List balances');
    console.log('6. View commend history');
    console.log('7. Delete account');
    console.log('8. Exit');
    
    const choice = await question('\nSelect option (1-8): ');
    
    switch(choice) {
        case '1':
            await addAccount();
            break;
        case '2':
            await importBotsFromFile();
            break;
        case '3':
            await addBalance();
            break;
        case '4':
            await listAccounts();
            break;
        case '5':
            await listBalances();
            break;
        case '6':
            await viewHistory();
            break;
        case '7':
            await deleteAccount();
            break;
        case '8':
            console.log('Goodbye!');
            rl.close();
            db.close();
            process.exit(0);
        default:
            console.log('Invalid option');
            await menu();
    }
    
    await menu();
}

async function addAccount() {
    const username = await question('Steam username: ');
    const password = await question('Steam password: ');
    const sharedSecret = await question('Shared secret (or press enter to skip): ');
    
    db.run(
        'INSERT INTO accounts (username, password, shared_secret) VALUES (?, ?, ?)',
        [username, password, sharedSecret || null],
        (err) => {
            if (err) console.error('❌ Error:', err.message);
            else console.log('✅ Account added!');
        }
    );
}

async function addBalance() {
    const discordId = await question('Discord ID: ');
    const steamId = await question('Steam ID: ');
    const amount = await question('Amount of commends: ');
    
    db.run(
        'INSERT OR REPLACE INTO balances (discord_id, steam_id, balance) VALUES (?, ?, ?)',
        [discordId, steamId, parseInt(amount)],
        (err) => {
            if (err) console.error('❌ Error:', err.message);
            else console.log('✅ Balance added!');
        }
    );
}

async function listAccounts() {
    db.all('SELECT id, username, created_at FROM accounts', (err, rows) => {
        if (err) {
            console.error('❌ Error:', err.message);
            return;
        }
        if (rows.length === 0) {
            console.log('No accounts found');
            return;
        }
        console.log('\n=== Bot Accounts ===');
        rows.forEach(row => {
            console.log(`ID: ${row.id} | Username: ${row.username} | Created: ${row.created_at}`);
        });
    });
}

async function listBalances() {
    db.all('SELECT discord_id, steam_id, balance FROM balances', (err, rows) => {
        if (err) {
            console.error('❌ Error:', err.message);
            return;
        }
        if (rows.length === 0) {
            console.log('No balances found');
            return;
        }
        console.log('\n=== Customer Balances ===');
        rows.forEach(row => {
            console.log(`Discord: ${row.discord_id} | Steam: ${row.steam_id} | Balance: ${row.balance}`);
        });
    });
}

async function viewHistory() {
    const targetId = await question('Target Steam ID: ');
    
    db.all(
        'SELECT a.username, c.commend_type, c.status, c.timestamp FROM commends c JOIN accounts a ON c.account_id = a.id WHERE c.target_steamid = ?',
        [targetId],
        (err, rows) => {
            if (err) {
                console.error('❌ Error:', err.message);
                return;
            }
            if (rows.length === 0) {
                console.log('No commend history found');
                return;
            }
            console.log(`\n=== Commend History for ${targetId} ===`);
            rows.forEach(row => {
                console.log(`${row.username} | ${row.commend_type} | ${row.status} | ${row.timestamp}`);
            });
        }
    );
}

async function deleteAccount() {
    const id = await question('Account ID to delete: ');
    
    db.run('DELETE FROM accounts WHERE id = ?', [id], (err) => {
        if (err) console.error('❌ Error:', err.message);
        else console.log('✅ Account deleted!');
    });
}

// Initialize tables before starting menu
initializeTables().then(() => menu());
