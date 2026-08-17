# Contributing

Contributions that improve provider portability, interview realism, evidence quality, privacy, accessibility, documentation, or Windows reliability are welcome.

Participation is also subject to [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Security vulnerabilities and suspected credential exposure must follow [`SECURITY.md`](SECURITY.md), not a public Issue.

## Before opening a pull request

1. Do not commit `.env` files, API keys, order numbers, real interview recordings, visa documents, or personally identifying application data.
2. Keep provider-specific transport code behind the shared voice or report contracts. Do not place provider credentials in browser code.
3. Preserve one continuous realtime model session per interview and the provider-neutral F-1/B2 policy boundaries.
4. Add or update tests for behavior changes.
5. Run:

   ```powershell
   npm test
   npm run build
   npm run licenses:check
   ```

6. If changing realtime provider support without live credentials, report it as `OFFLINE_PROTOCOL_TESTED` or `LIVE_VALIDATION_PENDING`, never `LIVE_VERIFIED`.

## Contributor License Agreement

This project uses AGPL/community and separate commercial licensing. Before a contribution can be merged, the contributor must agree to [`CLA.md`](CLA.md). The contributor retains copyright; the agreement gives the project steward the rights needed to keep distributing the combined project under both licensing routes.

Until an automated CLA bot is configured, add the following exact statement to the pull request description:

```text
I have read and agree to the AI Visa Interview Contributor License Agreement in CLA.md, and I have the right to submit this contribution.
```

Maintainers must record acceptance in the pull request and must not merge a contribution whose authors have not agreed.

## Pull request scope

- Keep each pull request focused and explain observable behavior changes.
- State which commands were run and their results.
- Identify any test that requires paid credentials and was not run.
- Use synthetic interview data in fixtures.
- Do not add legal, model-provider, or government endorsement claims.
