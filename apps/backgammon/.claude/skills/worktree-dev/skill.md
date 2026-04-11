---
name: worktree-dev
description: Start an isolated worktree before making any code changes. Use this to avoid colliding with other agentic sessions working on the same repo.
argument-hint: <brief description of the task>
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - EnterWorktree
  - Agent
---

# Worktree Development

Always create a git worktree before making code changes to avoid conflicts with other concurrent agentic sessions.

## Instructions

1. **Create a worktree first** — before reading or modifying any code, use the `EnterWorktree` tool to create an isolated worktree. Use a short descriptive name based on the task (e.g., `fix-login-bug`, `add-stats-page`).

2. **Do all work inside the worktree** — all file reads, edits, writes, and test runs should happen in the worktree directory. Do not modify files in the main working directory.

3. **Commit your changes** in the worktree branch when done.

4. **Tell the user** the worktree branch name so they can review and merge. Do NOT push or merge to main automatically.

## Workflow

```
1. EnterWorktree (name based on task)
2. Make all code changes in the worktree
3. Run tests to verify changes work
4. Commit changes to the worktree branch
5. Report the branch name to the user
```

## Important

- ALWAYS create the worktree before touching any files
- NEVER modify files on the main branch directly
- If you forget to create a worktree, stop and create one before continuing
- The worktree branch is based on the current HEAD of the main repo
