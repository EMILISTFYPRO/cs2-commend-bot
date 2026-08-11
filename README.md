# CS2 Commend Bot

Modern Steam commend bot with database tracking and Discord integration support.

## Installation

```bash
npm install
```

## Setup

1. Create `config.json`:
```json
{
    "apiKey": "your-key-here"
}
```

2. Create `bots.txt` with bot credentials:
```
username1:password1:sharedsecret1
username2:password2:sharedsecret2
username3:password3:sharedsecret3
```

3. Import bots into database:
```bash
npm run manage-db
# Select option 2: Import bots from bots.txt
```

## Usage

### Manage Database
```bash
npm run manage-db
```
Options:
1. Add bot account manually
2. Import bots from bots.txt
3. Add customer balance
4. List accounts
5. List balances
6. View commend history
7. Delete account

### Test Bot
```bash
npm start test 76561198000000000 5 5 5
```
Sends 5 friendly, 5 teaching, and 5 leader commends to the target Steam ID.

## Features

✅ Real Steam authentication with Steam Guard 2FA
✅ Bulk bot import from file
✅ Commend tracking database
✅ Customer balance management
✅ Error logging and retry
✅ Discord bot integration ready

## Database

The bot uses SQLite with three main tables:
- `accounts`: Bot Steam accounts
- `commends`: Commend history
- `balances`: Customer balances

## License

ISC
