# Collaboration Workflow

The `main` branch is the shared integration branch. Each session works in its own branch and worktree.

## Start a session

From the primary checkout:

```sh
git fetch origin
git worktree add ../ai-quest-world-session-name -b codex/session-name origin/main
```

Open the new directory in the separate terminal, IDE, or Codex session. Use one branch per independent task, such as `codex/uarp-validation` or `codex/local-persistence`.

## Daily loop

Before starting work:

```sh
git fetch origin
git rebase origin/main
```

After a coherent change:

```sh
npm test
git diff --check
git add <files>
git commit -m "feat: describe the change"
git push -u origin HEAD
```

Use a focused commit. Do not commit `.env`, credentials, private keys, local databases, build output, or generated caches.

## Merge flow

1. Push the session branch to GitHub.
2. Open a Pull Request from the session branch into `main`.
3. Run the required checks and inspect the diff.
4. Resolve conflicts by updating the session branch from `origin/main`.
5. Merge the Pull Request into `main`.
6. In every other session, synchronize before continuing:

```sh
git fetch origin
git rebase origin/main
```

Keep `main` as the only shared integration branch. Do not use one branch from two active sessions.

## Conflict recovery

If a rebase stops:

```sh
git status
git add <resolved-files>
git rebase --continue
```

Abort only the current rebase if the change cannot be reconciled:

```sh
git rebase --abort
```

Never use force-push on `main`. Coordinate before force-pushing a private session branch.

## Close a session

After its Pull Request is merged and the worktree is no longer needed:

```sh
git worktree remove ../ai-quest-world-session-name
git branch -d codex/session-name
```

Keep source-specific Harness code under `adapters/`; keep UARP factual and keep Game Core independent of adapters and UI.
