# Plan: Host GNU Backgammon as an Internal Analysis Service in Azure

## Context

You want to stand up GNU Backgammon (`gnubg`) as a long-lived service in Azure to support three use cases:

1. Post-hoc match analysis (bulk evaluation of completed games).
2. Replay mode annotations — labelling each move using gnubg's built-in classifications (very good / good / doubtful / bad / very bad; gnubg also exposes per-move equity error, which you can bucket further as "blunder" if desired).
3. Occasional live play against an Expert++-strength AI.

Key constraints you gave:

- **The engine and its model files must not be re-downloaded or re-bundled on every app build.** Bake them into a Docker image once; redeploy only when the engine code / wrapper changes.
- **Internal service only** — called from the existing Backgammon FastAPI, not exposed to the public internet.
- **Cheap when idle** — a few dollars/month is fine; zero-idle isn't required. No cold start latency on live play is a nice-to-have.
- Primary access pattern is batch/analysis; live play is secondary.

The good news: gnubg's "big model" reputation is misleading. The neural-net weights (`gnubg.wd`) are ~500 KB. Even with the full one-sided + two-sided bearoff databases and auxiliary data, the whole `gnubg-data` payload is under ~100 MB. It fits comfortably in a Docker image.

## Recommended Architecture

A dedicated small VM in the **existing `vnet-backgammon` VNet**, reachable **only** from the main Backgammon app VM over VNet-internal IP. No public IP, no TLS, no Caddy — the Backgammon FastAPI is the only caller.

> Naming note: to avoid collision with the existing `vm-backgammon` application VM, the new engine VM is named `vm-gnubg`, and the new service directory in the repo is `gnubg/` rather than `backgammon/`.

```
┌──────────────────────────── vnet-backgammon (10.0.0.0/16) ──────────────────────────────┐
│                                                                                         │
│   snet-vm (10.0.1.0/24)                                                                 │
│   ┌──────────────────────────┐       HTTP (private)        ┌──────────────────────────┐ │
│   │ vm-backgammon (existing) │ ──────────────────────────► │  vm-gnubg (new)          │ │
│   │  - FastAPI (app)         │  POST /analyze /hint /eval  │  - FastAPI wrapper :8001 │ │
│   │  - Caddy (public :443)   │                             │  - gnubg -t subprocess   │ │
│   │  - <public IP>           │                             │  - no public IP          │ │
│   └──────────────────────────┘                             └──────────────────────────┘ │
│           │                                                                             │
│           ▼                                                                             │
│   snet-postgres → PostgreSQL Flexible Server (unchanged)                                │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Why a dedicated VM rather than a sidecar on `vm-backgammon`?

- **Deploy decoupling.** You explicitly don't want gnubg rebuilding on app deploys. A separate VM with its own `docker-compose.yml` means a `git push` to the main app never touches gnubg.
- **Blast radius.** A gnubg rollout can't break the Backgammon web app, and vice versa.
- **Resource isolation.** A rollout/bench of gnubg (Expert++ rollouts can pin a CPU for minutes) won't starve FastAPI.
- Cost of separation is ~$8/mo for a B1s — squarely inside your stated budget.

### Why not Container Apps / ACI (scale-to-zero)?

Considered and rejected because:
- Image pull on cold start for a ~150–300 MB image is 10–30 s — noticeable for live play, annoying even for analysis.
- Container Apps' minimum envelope for a private-only workload (VNet integration) lands at a similar price to a B1s once you factor in the Environment.
- You said a few dollars idle is fine, which eliminates the main reason to prefer scale-to-zero.

### Why not just a systemd service, no Docker?

You already have a Docker+compose pattern working on `vm-backgammon`. Matching it keeps the mental model one, not two.

## Azure Resources To Add

All in the existing `rg-backgammon` resource group, same region as the existing app, existing `vnet-backgammon`:

| Resource | Name | Notes |
|---|---|---|
| VM | `vm-gnubg` | `Standard_B1s` (1 vCPU, 1 GiB). No public IP. Ubuntu 24.04. In `snet-vm`. |
| NIC | `nic-gnubg` | Private IP only. |
| NSG rule (on existing `nsg-backgammon` or a new `nsg-gnubg`) | `allow-internal-8001` | Source = `10.0.1.0/24` (snet-vm), dest port `8001`. No other inbound except SSH from your IP. |
| (Optional) Data disk | — | Not needed. 30 GB OS disk is enough; the full gnubg image + data is ~500 MB. |

**Everything else is reused**: resource group, VNet, subnet, DNS (nothing public to wire), SSH key, Azure subscription.

**Provisioning path**: extend the existing Terraform in `infra/`. The current stack already runs on azurerm `~> 4.0` (see `infra/main.tf`), so add a new `infra/gnubg.tf` with the VM, NIC, and NSG rule resources, plus a `cloud-init-gnubg.yaml.tpl` that installs Docker (mirroring `infra/cloud-init.yaml.tpl`). One `terraform apply` provisions it alongside the existing stack. The new VM has no public IP, so the NIC omits `public_ip_address_id`.

## Container Image Design

New directory at repo root: `gnubg/` (sibling of `backend/`, `frontend/`, `ml/`).

```
gnubg/
├── Dockerfile
├── docker-compose.yml          # single service, no Caddy, binds :8001 to host
├── pyproject.toml              # FastAPI + uvicorn + pydantic + pytest
├── app/
│   ├── main.py                 # FastAPI app
│   ├── engine.py               # gnubg subprocess manager
│   ├── parser.py               # parse gnubg "hint" / "analyse match" output
│   └── schemas.py              # request/response Pydantic models
├── tests/
│   └── test_engine.py          # fixture matches in tests/fixtures/*.sgf
├── deploy.sh                   # build → save tar → scp → ssh docker load
└── README.md
```

### Dockerfile sketch

```dockerfile
FROM python:3.12-slim

# gnubg + its weights + bearoff DBs are all apt-installable.
# The `gnubg` package on Ubuntu 24.04 ships the neural-net weights and the
# standard bearoff databases under /usr/share/games/gnubg/. This layer is
# cached; the model is baked in once and never re-fetched.
RUN apt-get update && apt-get install -y --no-install-recommends \
        gnubg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir .
COPY app ./app

EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

The `gnubg` Debian package pulls in the weights (`gnubg.wd`) and the standard bearoff databases (`gnubg_os0.bd`, etc.) as part of its normal install — no manual downloads, no extra curl steps. This is the "don't redownload the model on every build" win: it's an apt layer that caches like any other. If a future gnubg version ever splits the data into a separate package (e.g. `gnubg-data`), add it to the same `apt-get install` line and the cache behavior is unchanged.

### Engine wrapper design (`app/engine.py`)

gnubg supports `gnubg -t -p script.py` (batch, one-shot) and a persistent TTY mode that accepts commands on stdin. For live play we want low latency, so the wrapper keeps **one long-lived `gnubg -t` subprocess** per worker and communicates over stdin/stdout with a small request queue. For batch match analysis, a single `analyse match` invocation handles a whole SGF file and writes a classified report.

Concurrency: gnubg is CPU-bound and single-threaded; with 1 vCPU on a B1s, serialize requests through an `asyncio.Lock`. If live-play latency suffers, upgrade to `B2s` (~$30/mo) — still well inside your budget ceiling.

### API surface

Keep it small. All JSON, no auth (network ACL is the boundary).

| Endpoint | Body | Returns |
|---|---|---|
| `GET /health` | — | `{ "status": "ok", "gnubg_version": "1.07.01" }` |
| `POST /hint` | `{ "position_id": "...", "match_id": "...", "dice": [3,1] }` | Ranked list of candidate moves w/ equity, error vs best |
| `POST /evaluate` | `{ "position_id": "...", "match_id": "..." }` | Cubeless + cubeful equity |
| `POST /analyze-match` | `{ "sgf": "<gnubg SGF>" }` | Per-move classifications (`very good` … `blunder`), error in equity, match summary (PR, error rate per player) |

Position/match IDs are gnubg's native compact textual encoding — round-trips cleanly without needing to invent a JSON board representation. The match-analysis response maps directly to gnubg's own move categories (very good / good / doubtful / bad / very bad), which are what the replay mode annotations want; the parser just forwards the label and the equity error per ply.

## App Integration

Inside `backend/app/`, add one thin client module:

- `backend/app/services/gnubg_client.py` — `httpx.AsyncClient` pointing at `http://10.0.1.X:8001` (private IP, set via env var `GNUBG_URL`). Methods: `hint()`, `evaluate()`, `analyze_match()`. Timeouts: 5 s for hint/evaluate, 120 s for analyze. Matches the existing `backend/app/services/` convention.
- One new env var in `backend/app/config.py`: `GNUBG_URL` (default unset → client disabled, `/api/gnubg/*` routes 503).
- Optional thin passthrough routes under `backend/app/api/gnubg_routes.py` if you want to call the engine from the browser client via the main FastAPI as a gateway. Mount under `/api/gnubg` to match the existing `/api/*` prefix used by `routes.py` and `auth_routes.py`.

This keeps the Backgammon app entirely functional if `vm-gnubg` is down or deallocated — the integration is strictly additive.

## Deployment Workflow

A `gnubg/deploy.sh` that mirrors the existing `deploy.sh` pattern (local build → `docker save` → `zstd` compress → `scp` → `docker load` on target). No registry needed; matches what's already in the repo. Target IP comes from `terraform output` (add a `gnubg_private_ip` output to `infra/outputs.tf`).

```bash
# one-time: terraform apply in infra/ to create vm-gnubg + NSG rule.

# per-deploy (only when gnubg service code changes):
cd gnubg
GNUBG_IP=$(cd ../infra && terraform output -raw gnubg_private_ip)
docker build --platform linux/amd64 -t backgammon-gnubg:latest .
docker save backgammon-gnubg:latest | zstd -T0 -3 > /tmp/gnubg.tar.zst

# vm-gnubg has no public IP; tunnel through vm-backgammon as jump host.
scp -o "ProxyJump=azureuser@$APP_IP" /tmp/gnubg.tar.zst docker-compose.yml \
    azureuser@"$GNUBG_IP":/opt/gnubg/
ssh -J azureuser@"$APP_IP" azureuser@"$GNUBG_IP" \
  "cd /opt/gnubg && zstd -d < gnubg.tar.zst | docker load && docker compose up -d"
```

A `~/.ssh/config` entry (`Host vm-gnubg / ProxyJump azureuser@<app-ip>`) reduces the commands to one `ssh vm-gnubg`.

## Bring-down / Cost Control

You mentioned wanting the option to bring it up only as needed. Since it's a plain VM, that's always available:

```bash
az vm deallocate -g rg-backgammon -n vm-gnubg    # stops billing for compute
az vm start      -g rg-backgammon -n vm-gnubg    # ~30 s to SSH-ready
```

Deallocated, you pay only for the OS disk (~$1.50/mo for 30 GB Standard SSD). Running 24/7, a B1s is ~$8/mo. The FastAPI client handles `vm-gnubg` being down gracefully (timeout → 503 from the Backgammon API).

If you want automatic on-demand start, a later iteration can have the Backgammon FastAPI trigger `az vm start` on the first request and schedule a deallocate after N minutes idle. Not part of this initial plan.

## Files To Create / Modify

**New**:
- `gnubg/Dockerfile`
- `gnubg/docker-compose.yml`
- `gnubg/pyproject.toml` (or `requirements.txt` — match whichever the existing `backend/` uses; currently `backend/requirements-dev.txt`)
- `gnubg/app/main.py`, `engine.py`, `parser.py`, `schemas.py`
- `gnubg/tests/test_engine.py`, fixture SGF files
- `gnubg/deploy.sh`
- `gnubg/README.md`
- `infra/gnubg.tf` — Terraform resources: `azurerm_linux_virtual_machine.gnubg`, `azurerm_network_interface.gnubg`, a new `azurerm_network_security_rule` on the existing `nsg-backgammon` for port 8001 from `10.0.1.0/24`.
- `infra/cloud-init-gnubg.yaml.tpl` — installs Docker + creates `/opt/gnubg/`.
- `backend/app/services/gnubg_client.py` — thin httpx client.

**Modified**:
- `backend/app/config.py` — add `GNUBG_URL` setting, default `None`.
- `infra/outputs.tf` — expose `gnubg_private_ip` for the deploy script.
- `infra/variables.tf` — no changes expected unless a new SKU variable is introduced.
- `CLAUDE.md` — one short section pointing at `gnubg/` and describing the deploy pattern.

No changes to existing `Caddyfile`, `backend/Dockerfile`, database schema, or shared TypeScript types. The gnubg service has zero runtime coupling to the main app beyond the httpx call.

## Verification

End-to-end check once deployed:

1. `curl http://<gnubg-private-ip>:8001/health` from `vm-backgammon` — returns gnubg version.
2. `curl -d '{"sgf":"<paste of a sample match>"}' http://<gnubg-private-ip>:8001/analyze-match` from `vm-backgammon` — returns a classified move list.
3. `curl https://backgammon.alanmanderson.com/api/gnubg/analyze` (if passthrough route is wired) — proves the internal hop works end to end.
4. `az vm deallocate … && curl … ` from `vm-backgammon` — confirms the Backgammon API returns 503 cleanly rather than hanging.
5. `pytest` inside `gnubg/` — unit tests over the parser with canned gnubg output fixtures.
6. A stopwatch on a 20-move SGF analysis — sanity-check analyze latency on B1s; upgrade to B2s if it's painful.

## Out Of Scope (Flagged For Later)

- Auto start/stop on demand from FastAPI.
- A public-facing passthrough for a browser client (easy add later: `/api/gnubg/*` routes on the existing FastAPI, which Caddy already proxies under `/api`).
- Persisting match analyses to PostgreSQL (easy: reuse the existing DB, add a table).
- Rollouts beyond Expert++ (these can take many minutes; would want a job queue + progress endpoint).
