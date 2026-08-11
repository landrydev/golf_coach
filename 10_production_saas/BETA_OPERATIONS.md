# Beta operations checklist

This application is suitable for a small, invite-only adult beta after the items below are completed. It is not a public production release.

## Deployment requirements

- Node.js 22 or the included Dockerfile.
- HTTPS at the public origin.
- A persistent volume mounted for `DATA_FILE`.
- Unique, randomly generated values for `APP_SECRET` and `BETA_INVITE_CODE`.
- `COOKIE_SECURE=true` behind HTTPS.
- `PUBLIC_ORIGIN` set to the exact external origin.
- One accountable support contact and one incident contact.
- Daily encrypted backup of the data file, with one restore exercise before participant use.

Example environment:

```text
PORT=4175
PUBLIC_ORIGIN=https://beta.example.ca
DATA_FILE=/data/roadmap-beta.json
APP_SECRET=<at least 32 random bytes>
BETA_INVITE_CODE=<private participant invite>
COOKIE_SECURE=true
```

## Before the first participant

1. Approve the exact adult-only beta consent and privacy notice.
2. Decide the beta retention period and deletion procedure.
3. Name the support and incident owner.
4. Create a participant register outside the application containing only the minimum coordination information.
5. Deploy to a private or unlisted beta origin.
6. Run `npm run verify` from a clean checkout.
7. Complete the manual acceptance script below on desktop and a real phone.
8. Back up the data file and prove it can be restored into a separate environment.

## Manual acceptance script

- Register instructor A using the invite code.
- Complete coach profile and create an external lesson package.
- Create a golfer, leave once, return, and finish the roadmap.
- Add three phases, a lesson, a practice item, evidence, and a phase review.
- Preview the exact golfer experience.
- Publish and open the private link in a signed-out mobile browser.
- Record each golfer response option and confirm only the latest intended response is visible to the coach.
- Reissue the link and confirm the prior link no longer works.
- Revoke the current link and confirm it no longer works.
- Register instructor B and confirm instructor B cannot access instructor A's records.
- Export instructor A's data and inspect it for completeness.
- Restart the service and confirm all expected records remain.

## Stop triggers

Stop the beta immediately for any cross-account data exposure, unauthorized private-link access, unrecoverable data loss, misleading claim that a message/payment occurred, serious accessibility blocker, or inability to honour an access/deletion request.

## Deliberately deferred

- Live subscription billing.
- Automated email or text delivery.
- Uploaded swing media.
- Launch-monitor CSV imports.
- Junior golfers.
- Teams and facilities.
- Public directory or discovery.
- AI-generated diagnosis or coaching.
