---
name: check-gha
description: Check the status of GitHub Actions workflow runs and diagnose failures.
argument-hint: [optional run number or "latest"]
allowed-tools:
  - Bash
  - WebFetch
---

# Check GitHub Actions Status

Check the status and output of GitHub Actions workflow runs for this repository.

## Instructions

The repo is **private**, so the GitHub API requires authentication. Use the `gh` CLI on the production VM (which has git credentials) via SSH.

### Step 1: Get workflow run status

```bash
SSH="ssh -o StrictHostKeyChecking=no azureuser@backgammon.alanmanderson.com"
$SSH "gh run list --repo alanmanderson/backgammon --limit 5"
```

If `gh` is not installed on the VM, use the GitHub API with a token. Ask the user for a GitHub personal access token, then:

```bash
curl -sf -H "Authorization: token <GITHUB_TOKEN>" \
  "https://api.github.com/repos/alanmanderson/backgammon/actions/runs?per_page=5" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for run in data['workflow_runs']:
    print(f\"{run['run_number']:>4}  {run['status']:<12} {run['conclusion'] or '':12} {run['name']:<30} {run['created_at']}\")
"
```

### Step 2: Get details for a specific run

```bash
$SSH "gh run view <RUN_ID> --repo alanmanderson/backgammon"
```

Or with curl + token:

```bash
curl -sf -H "Authorization: token <GITHUB_TOKEN>" \
  "https://api.github.com/repos/alanmanderson/backgammon/actions/runs/<RUN_ID>/jobs" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for job in data['jobs']:
    print(f\"Job: {job['name']} — {job['status']} / {job['conclusion'] or 'in progress'}\")
    for step in job['steps']:
        icon = '✓' if step['conclusion'] == 'success' else '✗' if step['conclusion'] == 'failure' else '…'
        print(f\"  {icon} {step['name']}\")
"
```

### Step 3: Get failed step logs

```bash
$SSH "gh run view <RUN_ID> --repo alanmanderson/backgammon --log-failed"
```

Or download logs via API:

```bash
curl -sfL -H "Authorization: token <GITHUB_TOKEN>" \
  "https://api.github.com/repos/alanmanderson/backgammon/actions/runs/<RUN_ID>/logs" \
  -o /tmp/gha-logs.zip
cd /tmp && unzip -o gha-logs.zip -d gha-logs && ls gha-logs/
```

Then read the relevant log file for the failed step.

### Step 4: Diagnose common failures

**Test failures (`Run backend tests` step):**
- Missing dependencies: Check if `requirements.txt` or `requirements-dev.txt` are up to date and committed
- Import errors: Check if new modules were added locally but not committed
- `JWT_SECRET` missing: The test step needs `JWT_SECRET` env var set

**Frontend build failures (`Build frontend` step):**
- Missing `npm ci` dependencies: Check `package.json` and `package-lock.json` are committed
- TypeScript errors: Run `cd frontend && npx tsc --noEmit` locally to reproduce

**Docker build failures:**
- Check `backend/Dockerfile` and `backend/.dockerignore` are committed and correct
- Check all Python dependencies in `requirements.txt` are installable

**SSH/deploy failures (`Transfer artifacts` or `Deploy on VM` step):**
- SSH key issues: Verify `SSH_PRIVATE_KEY` secret is correctly set (full key including BEGIN/END lines)
- VM unreachable: Check `VM_HOST` secret matches the VM's public IP
- Permission denied: Verify the SSH key matches what's on the VM

### Step 5: Report

Provide a summary:

| Run # | Status | Failed Step | Root Cause | Fix |
|-------|--------|-------------|------------|-----|
| ... | ... | ... | ... | ... |

If the run is still in progress, report the current status and which step is executing.

## Notes

- The repo is **private** — GitHub API requires authentication
- Prefer using `gh` CLI on the VM via SSH; fall back to API + token if `gh` is unavailable
- The `gh` CLI is not installed in the local dev environment
- Workflow runs are triggered on every push to `main`
