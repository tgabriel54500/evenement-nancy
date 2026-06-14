# CLAUDE.md

<!-- capybavibe:start -->
## capybavibe — parallel Claude sessions, shared folder

This project is open in **capybavibe**: several Claude sessions run in parallel
in **the same folder** (one shared folder — no worktree). To keep them from
clobbering each other, the app sets a **per-file lock** automatically. Variables injected
into your terminal:

- `$CAPYBAVIBE_REPO_MAP` — pre-generated repo map. **Read it before exploring the code.**
- `$CAPYBAVIBE_NOTES` — `NOTES.md` shared across all sessions. **Read it after the repo-map.**
- `$CAPYBAVIBE_SESSION` — your session's identity (owner of your locks).
- `$CAPYBAVIBE_LOCKS` — shared locks folder (managed by the app, do not touch it).

### Shared notes (`$CAPYBAVIBE_NOTES`)
- **Curated** common memory: structure, conventions, DRY (where things live), pitfalls,
  user preferences ("do NOT do X"), in-progress architecture decisions.
- **Read it** at startup so you don't relearn what another session already knows.
- **Enrich it** when you discover a durable fact useful to others: add it via
  the Edit tool (the lock applies), in the right section, in one concise line.
  Do NOT put throwaway notes specific to your task in it.

### Locking (automatic, via hooks)
- When you edit a file (Write/Edit/MultiEdit), a hook **reserves** it for your session.
- If you try to edit a file **already reserved by another session**, the edit is
  **denied** ("locked by session X"). In that case: **switch to another file**
  or wait for it to be released. Do not force it, do not work around it.
- A file you stop touching releases itself after a delay.

### Messaging between sessions
- Send a one-line note to a sibling session (or all of them):
  `bash "$CAPYBAVIBE_DIR"/hooks/msg-send.sh <session-id|all> "message"`.
  Live session ids: `ls "$CAPYBAVIBE_DIR"/sessions/`.
- Delivery is automatic — queued messages are injected into the target's context on
  its next tool call. **Never poll for messages yourself.**
- When an edit is denied (file locked), you are **queued automatically**: a message
  arrives when the file is released. Switch to other work meanwhile.
- Etiquette: one terse factual line, only for things siblings need NOW
  ("API X signature changed — adapt"). No chat. Durable facts go to `$CAPYBAVIBE_NOTES`.

### Golden rule (otherwise the lock is useless)
- **ALWAYS edit via the Write / Edit / MultiEdit / NotebookEdit tools.** NEVER write
  to a file via Bash (`sed -i`, `echo >`, `>>`, formatters type `prettier --write`): these writes **bypass the lock** and
  can overwrite another session's work in this shared folder.
<!-- capybavibe:end -->
