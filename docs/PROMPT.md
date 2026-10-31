Read AGENTS.md and PLAN.md fully before doing anything.

Goal: complete milestone M0 (Scaffold) only. Do not start M1.

Work on a new branch `m0-scaffold`. Create the repo layout from PLAN.md section 5, then work through the M0 tasks in order. Where PLAN.md leaves something open (such as the Go module path), pick the suggested default and tell me.

When done:
- run `make check` and fix anything that fails
- tick the M0 checkboxes and add a line per task to the Progress Log
- give me a short summary: what you built, how you verified it, and any assumptions

Stop after M0. Do not begin the spike.

---

Read AGENTS.md and PLAN.md fully. Then read the Progress Log to see what has been done.

Goal: start milestone <M1 | M2 | M3 | M4>.

First confirm the previous milestone's gate is met (check the Progress Log and any results files). If it is not met, stop and tell me what is missing instead of continuing.

If the gate is met:
1. Create a branch named `<milestone>-<short-topic>` (or a git worktree if another agent is active).
2. List the milestone's tasks in the order you will do them and flag any that look ambiguous or risky. Ask me before starting if a wrong guess would be expensive.
3. Work one task at a time. After each task: run `make check`, tick its checkbox, add a Progress Log line, and commit.

Stay inside this milestone. If you find a problem outside it, log a note instead of fixing it. Stop at the milestone's gate and report the results against the gate criteria.

---

Read AGENTS.md and PLAN.md. Then recover the current state:
1. Read the Progress Log.
2. Run `git status`, `git branch --show-current`, and `git log --oneline -10`.
3. Run `make check` to see whether the tree is healthy.

Tell me in a few lines: which milestone and task we are in, what is done, what is half-finished, and whether any tests or checks fail.

Then continue with the next unchecked task on the current branch. If there are uncommitted changes you did not make, or the branch looks like another agent's, stop and ask before touching anything.

Follow the usual rules: one task at a time, run `make check`, tick the checkbox, add a Progress Log line, and stop at the milestone gate.
