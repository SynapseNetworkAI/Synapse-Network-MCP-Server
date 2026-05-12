# Bugfix Records

Use this directory for live MCP E2E failures that must be fixed before release.

Each record should include:

- Date and environment profile.
- Command that failed, with secrets redacted.
- Sanitized error output.
- Root cause.
- Fix summary and changed files.
- Verification commands.
- Final status.

Never include Agent Keys, owner private keys, owner JWTs, provider secrets, admin credentials, wallet seeds, raw authorization headers, or private Gateway payloads.
