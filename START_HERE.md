# Start Here

The current project is no longer the older private Sites release or the unsourced
rich functional experiment. The canonical implementation is the source-controlled
beta in [`10_production_saas`](10_production_saas/README.md).

## Operator sequence

1. Read [`CURRENT_STATUS.md`](CURRENT_STATUS.md).
2. Run the beta verification:

   ```powershell
   cd 10_production_saas
   $env:APP_SECRET="replace-with-at-least-32-random-characters"
   $env:BETA_INVITE_CODE="replace-with-a-private-code"
   npm run verify
   ```

3. Start locally with `npm start` and review the synthetic demo.
4. Configure an invite-only HTTPS deployment with persistent private storage and
   backups.
5. Complete a manual exact-deployment review before inviting participants.
6. Approve the participant, consent, support, retention, and stop-condition packet.
7. Observe five instructor sessions before approving new major functionality.

## Authority and truth

Business Plan V2 remains the business source. The beta recovery build is an
implementation candidate, not proof of demand, price, usability, legal compliance,
or commercial outcomes. Historical documents remain preserved but must not be used
to report a predecessor release as current.
