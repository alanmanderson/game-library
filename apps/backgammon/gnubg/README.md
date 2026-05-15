# gnubg analysis service

Internal HTTP wrapper around a long-lived `gnubg -t` subprocess. Used by
the main backgammon backend for position evaluation, best-move
selection, move quality analysis, and cube decisions.

## What it is

- Single Python 3.12 FastAPI process
- One `gnubg -t` subprocess per container, serialised via `asyncio.Lock`
- gnubg's neural-net weights + bearoff DBs ship with the Ubuntu `gnubg`
  package — nothing is re-downloaded on rebuild
- **Internal network only**: no auth, no TLS, no CORS. NSG rule on the
  Azure VNet is the boundary.

## API

| Method | Path             | Purpose                                  |
|--------|------------------|------------------------------------------|
| GET    | `/health`        | version + readiness                      |
| POST   | `/evaluate`      | cubeless equity + probs for a position   |
| POST   | `/best-move`     | ranked candidate moves for a dice roll   |
| POST   | `/analyze-move` | equity loss vs best + quality label       |
| POST   | `/cube-decision` | no double / double-take / double-pass    |

Request bodies use the main backend's board representation (26-element
`points` array, positive=white, negative=black, separate bar/off
counts). See `app/schemas.py` for the Pydantic models.

## Running locally

```bash
cd gnubg
docker compose up --build
curl http://localhost:8001/health
```

## Tests

```bash
cd gnubg
pip install -r requirements.txt
pytest                  # parser tests always run
pytest tests/test_engine.py  # integration tests; auto-skip if gnubg isn't installed
```

## Deployment

Deployed to a dedicated `vm-gnubg` VM in the same VNet as the main
backgammon app. The deploy workflow `.github/workflows/deploy-gnubg.yml`
only runs when files under `gnubg/` change — a normal app deploy never
rebuilds this image. See `plans/gnu-backgammon.md` for the full design.

### Manual bring-up (first time)

```bash
cd infra && terraform apply              # provisions vm-gnubg + NSG rule
# then trigger the deploy workflow via GitHub Actions "Run workflow"
```

The VM has no public IP; SSH is via ProxyJump through the main app VM.

## Operational notes

- The subprocess is a single point of failure. If gnubg crashes, the
  next request re-launches it (`ensure_started`). A `/health` poll from
  the caller surfaces this as `ready: false`.
- Concurrency is 1 request at a time per container. For a B1s VM this is
  fine — gnubg is CPU-bound on a 1-vCPU box. If a B2s becomes necessary,
  the concurrency model does not need to change.
- To stop billing when not needed:
  ```bash
  az vm deallocate -g rg-backgammon -n vm-gnubg
  ```
  The main backend treats an unreachable service as "gnubg disabled"
  and falls back to the ML/heuristic evaluators.
