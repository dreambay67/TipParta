# TipParta

TipParta is between tournaments. The deployed site is an intentionally static placeholder; it has no public data, sign-in surface, administration surface, server functions, scheduled jobs, or external provider access.

The repository retains the reusable application foundation:

- `apps/web` — the Next.js presentation layer and reusable UI modules.
- `functions/node` and `functions/settlement` — inactive source for import, settlement, email, and AI workflows.
- `packages/shared` — shared models and calculation helpers.

## Reactivating for a future tournament

1. Define a new tournament configuration, teams, schedules, and user journey.
2. Add the required Firebase configuration and provider credentials outside Git.
3. Re-enable only the required function exports and `firebase.json` function configuration.
4. Add the new data through a reviewed setup flow; never restore old tournament exports.
5. Replace the placeholder screen, test the complete journey, then deploy the selected services.

Until then, deploy only Hosting and the deny-all Firestore and Storage rules:

```powershell
pnpm firebase:deploy
```
