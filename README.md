# CS2 Commend Bot

Modern CS2 commend bot with Discord integration support.

## Setup

### 1. Install Node.js
Download from: https://nodejs.org/ (v18 or newer)

### 2. Clone and Install
```bash
git clone https://github.com/EMILISTFYPRO/cs2-commend-bot.git
cd cs2-commend-bot
npm install --legacy-peer-deps
```

### 3. Create config.json
```bash
copy config.json.example config.json
```

Edit `config.json` and add your **Steam Web API Key** from: https://steamcommunity.com/dev/apikey

### 4. Manage Database
Add bot accounts and customer balances:
```bash
npm run manage-db
```

**Menu options:**
- Add bot accounts (Steam credentials)
- Add customer balances
- View accounts and balances
- Check commend history

### 5. Test the bot
```bash
npm start test 76561198000000000 5 5 5
```

This sends commends to Steam ID `76561198000000000` with 5 friendly, 5 teaching, 5 leader commends.

## Database

The bot uses SQLite with 3 tables:

**accounts** - Bot Steam accounts
- username
- password
- shared_secret (optional for 2FA)

**balances** - Customer commend balances
- discord_id
- steam_id
- balance (number of commends)

**commends** - History of all commends sent
- account_id
- target_steamid
- commend_type
- status
- timestamp

## Discord Bot Integration

To use with your Discord bot:

```javascript
const commendBot = require('./bot.js');

// Check balance
const balance = await commendBot.checkBalance(discordId);

// Send commends
await commendBot.sendCommends(targetSteamId, {
    friendly: 10,
    teaching: 10,
    leader: 10
});

// Deduct from balance
await commendBot.deductBalance(discordId, 30);

// Add balance (when customer pays)
await commendBot.addBalance(discordId, steamId, 100);
```

## Notes

- One IP can do ~20 commends per 5 minutes
- Accounts are stored with passwords (keep secure!)
- No external Steam integration yet (framework ready for integration)

## Future Improvements

- [ ] Real Steam API integration
- [ ] Proxy support
- [ ] Automatic Steam Guard handling
- [ ] Web dashboard
- [ ] Rate limiting per IP
