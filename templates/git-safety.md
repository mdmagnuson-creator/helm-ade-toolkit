# Git Safety

## Worktrees

Always work in a git worktree, not the main checkout. Use the worktree tool or `git worktree add` to create an isolated working directory for your branch. This prevents interference with the user's working tree.

## Committing

Always commit your changes when you are done working. Do not leave uncommitted work behind. Stage and commit with a clear message before finishing.

## Do Not Revert Others' Changes

NEVER unstage, discard, or revert changes that you did not make. If the working tree has uncommitted changes that are not yours, **stop and ask the user** what to do. Do not assume they should be stashed, reset, or discarded.
