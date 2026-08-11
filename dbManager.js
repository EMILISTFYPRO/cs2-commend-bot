const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');
const db = new sqlite3.Database('commends.db');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(q) {
    return new Promise(resolve => rl.question(q, resolve));
}

async function menu() {
    console.log('\n=== CS2 Commend Bot - Database Manager ===');
    console.log('1. Add bot account');
    console.log('2. Add customer balance');
    console.log('3. List accounts');
    console.log('4. List balances');
    console.log('5. View commend history');
    console.log('6. Delete account');
    console.log('7. Exit');
    
    const choice = await question('\nSelect option (1-7): ');
    
    switch(choice) {
        case '1':
            await addAccount();
            break;
        case '2':
            await addBalance();
            break;
        case '3':
            await listAccounts();
            break;
        case '4':
            await listBalances();
            break;
        case '5':
            await viewHistory();
            break;
        case '6':
            await deleteAccount();
            break;
        case '7':
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

menu();
