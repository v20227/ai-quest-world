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

## Batch development cadence

The delivery unit is a complete outcome or bounded milestone slice, not an individual file.

- The integration owner defines the outcome, exclusive write scopes, and acceptance checks before dispatching work.
- Worker contexts may implement independent scopes and run fast syntax or focused smoke checks while developing.
- Do not pause the whole workstream for a full test suite or review after every small edit.
- When a coherent batch is ready, the integration owner runs the full suite, diff check, scope review, and one focused architectural review.
- Workers may commit their assigned scope in isolated task branches. The integration owner coordinates version allocation, branch synchronization, review, and all merges or pushes to `main`.
- GitHub branch pushes require an explicitly assigned scope. Workers never merge their own work or change repository permissions. Integration happens only after the batch gate passes.
- Before each commit, coordinate the next logical version event in `.sakura/RELEASE.md` and include it with the work. A fix and its recording commit count once; rebase replacements do not count again. Prefer fast-forward integration when possible; any new merge commit must carry its own counted ledger event.

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
