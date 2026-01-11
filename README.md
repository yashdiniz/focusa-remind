# Focusa Remind

Focusa Remind is a Telegram and Slack bot for creating and managing reminders with recurrence support, hosted on Vercel and using Vercel's [AI SDK](https://ai-sdk.dev/).

## Features

- Create reminders from Telegram bot (with future plans for web UI)
- Recurring reminders via [`rrule`](https://github.com/icalendar/rrule), using [rrule.js](https://github.com/jkbrzt/rrule)
- PostgreSQL with Drizzle ORM & migrations

## Tech Stack

- Next.js 15 (React 19)
- Drizzle ORM + PostgreSQL
- Grammy (Telegram bot)

## Setup

### Prerequisites

- Node.js ≥ 18
- Yarn 1.x
- PostgreSQL (using NeonDB for free tier)
- You will need to setup your own cron jobs to make sure the reminders reliably trigger (I use n8n)

### Installation

```bash
git clone https://github.com/yashdiniz/focusa-remind
cd focusa-remind
yarn install
cp .env.example .env   # configure env vars
```

Setup `.env` file as follows:

- Get `DATABASE_URL` from NeonDB.
- Get `GROQ_API_KEY` from the [Groq Dashboard](https://console.groq.com/keys)
- Get `TELEGRAM_BOT_TOKEN` by setting up a Telegram bot via the [Botfather](https://telegram.me/BotFather)
- Use a random string for `AUTH_SECRET`. This is used as an API key for `/api/testchat` endpoint.

### Database

```bash
yarn db:generate   # generate migrations
yarn db:migrate    # apply migrations
```

### Development

```bash
yarn dev
```

### Production

```bash
yarn build
yarn start
```

## Environment Variables

See `.env.example` for all required keys:

- `DATABASE_URL` – Postgres connection string
- `GROQ_API_KEY` – Groq API key for accessing models
- `TELEGRAM_BOT_TOKEN` – Bot token from @BotFather
- `SLACK_BOT_TOKEN` – Bot token from [Slack API](https://api.slack.com)

## Usage

### Telegram Bot

1. Start the bot: [@focusaRemind_bot](https://t.me/focusaRemind_bot)
2. Use natural language commands:
   - `Remind me to Buy milk at 6pm`
   - `Remind me to Call mom every Monday & Thursday at 9am`
3. The bot schedules and delivers reminders via tool calls, generates the necessary `rrule`s at the specified times

## Scripts

- `yarn dev` – start dev server
- `yarn build` – build app
- `yarn start` – run prod build
- `yarn db:generate` – generate migrations
- `yarn db:migrate` – run migrations
- `yarn test` – run tests
