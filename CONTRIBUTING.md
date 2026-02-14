# Contributing to Hephaestus

Thanks for contributing.

## Development Workflow
1. Create a branch from `main`.
2. Keep changes focused and small.
3. Run local checks before opening a PR.
4. Open a PR with clear scope and test notes.

## Branch Naming
- `feat/<short-name>`
- `fix/<short-name>`
- `docs/<short-name>`
- `chore/<short-name>`

## Commit Style
Use concise, imperative commit messages.

Examples:
- `Add language switcher for web UI`
- `Fix OpenAI provider error logging`
- `Update Render blueprint for free plan`

## Pull Request Checklist
- [ ] The change is scoped and documented.
- [ ] Behavior changes are explained in the PR description.
- [ ] Relevant tests or manual verification steps are included.
- [ ] No secrets were committed.

## Code Guidelines
- Prefer readable code and explicit naming.
- Avoid broad refactors in feature PRs.
- Keep API contracts backward compatible when possible.
- Add comments only when logic is non-obvious.

## Security
- Never commit credentials or API keys.
- Rotate any key that was exposed.
- Use `.env` files locally; use platform secrets in production.

## Reporting Issues
For bugs, include:
- expected behavior
- actual behavior
- reproduction steps
- logs and environment details
