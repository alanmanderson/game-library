# Game Library

Monorepo for web-based multiplayer games, deployed to a single VM via Docker Compose with subdomain-per-game routing.

## Apps

| Game | Stack | Database | Subdomain |
|------|-------|----------|-----------|
| [AI Pinochle](apps/ai-pinochle/) | React + FastAPI | PostgreSQL | pinochle.games.alanmanderson.com |
| [Backgammon](apps/backgammon/) | React + FastAPI | PostgreSQL | backgammon.games.alanmanderson.com |
| [Bughouse](apps/bughouse/) | React + FastAPI | PostgreSQL | bughouse.games.alanmanderson.com |
| [Forbidden Island](apps/forbidden-island/) | React + Fastify | In-memory | fi.games.alanmanderson.com |
| [Lemonade Stand](apps/lemonadestand/) | React + .NET 8 | SQLite | lemonade.games.alanmanderson.com |
| [Spades](apps/spades/) | Flask | SQLite | spades.games.alanmanderson.com |
| [Telestrations](apps/telestrations/) | Vanilla TS + Express | In-memory | telestrations.games.alanmanderson.com |

## Architecture

```
VM
└── Docker Compose
    ├── caddy              (reverse proxy, TLS)     ports 80, 443
    ├── postgres           (shared database)        internal only
    ├── ai-pinochle        (game)                   internal only
    ├── backgammon         (game)                   internal only
    ├── bughouse           (game)                   internal only
    ├── forbidden-island   (game)                   internal only
    ├── lemonadestand      (game)                   internal only
    ├── spades             (game)                   internal only
    └── telestrations      (game)                   internal only
```

Only Caddy exposes external ports. Games communicate internally via Docker networking.

## Local Development

Each game can be run independently from its own directory. See the README in each `apps/<game>/` directory.

## Deployment

```bash
cd infra
cp .env.example .env   # fill in real values
docker compose up -d
```

To rebuild and restart a single game without affecting others:

```bash
docker compose build backgammon
docker compose up -d backgammon
```

To reload Caddy config without restarting (preserves active connections):

```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## DNS

Set up a wildcard A record (`*.games.alanmanderson.com`) pointing to the VM's IP, or individual A records per subdomain. Caddy handles TLS certificates automatically via Let's Encrypt.

## Repository Structure

```
game-library/
├── apps/
│   ├── ai-pinochle/
│   ├── backgammon/
│   ├── bughouse/
│   ├── forbidden-island/
│   ├── lemonadestand/
│   ├── spades/
│   └── telestrations/
├── services/
│   └── auth/              # Future: shared auth service
├── infra/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   ├── init-databases.sql
│   └── .env.example
└── README.md
```
