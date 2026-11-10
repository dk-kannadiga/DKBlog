# DK Blog Mailer (private, no third-party service)

Apps Script bound to a Google Sheet. Mail is sent from the Gmail account that owns the script.
**Keep Brevo running while you test.** The live `/subscribe` page is not touched; test at `/subscribe-test`.

## What it does
- **Subscribe form** -> confirmation mail -> a confirm page with a button (link scanners cannot confirm anyone) -> welcome mail. Confirmation links expire after 7 days. Every alert has an unsubscribe link (also a button page).
- **New post, new collection, post added to a collection, new/active quiz:** detected from public Firestore reads every 10 minutes and mailed to confirmed subscribers. A new post inside a collection is announced once.
- People who confirm after an alert batch was created do not receive that older batch.
- **Certificates:** you prepare the `Certificates` tab (Name, Email, Certificate Link, Quiz), then Blog Mailer -> Send certificates. Each file is fetched from Drive and attached. Preparing the sheet stays manual.

## Sheet tabs
`Subscribers` (Email, Status, Token, Requested At, Confirmed At) - `Certificates` - `Alerts` (one row per batch, including every key it announced) - `Deliveries` (one row per batch and subscriber: this is what prevents resends) - `Seen`.

## Mail quota (important)
Consumer Gmail allows **100 recipients/day** through Apps Script, shared by everything: confirmation, welcome, alert and certificate mails. A new subscriber costs 2 mails; one alert to 50 subscribers costs 50; 50 certificates cost 50. Workspace accounts get 1,500/day.
- Alerts that do not fit resume on a later poll. Certificates stop at the quota; run again the next day.
- Confirmation mails are capped at 30/day (`confirmDailyCap`).

## Local preparation status

Prepared for testing only; Brevo remains active. Owner protection cannot be disabled. The manifest explicitly requests email identity for owner checks. Alert delivery stops after approximately four minutes so a later trigger can resume. Certificate SENDING claims are flushed before sending. The test form validates Google reply origins and a random per-request nonce; its endpoint must be configured before use.

## Who can call what
Visitors can reach only: the subscribe form (POST), the confirm and unsubscribe pages, and their two button actions (`confirmByToken`, `unsubscribeByToken`). Every owner-only function (`installMailer`, `pollAlerts`, `sendTestMails`, certificate and import functions) refuses anyone but you, the Sheet menu/editor, or the script's own time trigger (`CFG.ownerGuard`). If it ever wrongly says "Not allowed." when YOU run it from the editor, tell me the exact situation; as a temporary valve you can set `ownerGuard: false`. Do not share the Sheet or the Apps Script project with anyone: a menu run by another person would send mail from THEIR Gmail.

E-mail addresses are sent in a POST body, never in a URL. The old GET subscribe path is gone.

## Duplicate protection: what is and is not guaranteed
- **Alerts:** a batch row (written in one step with all the keys it announces) is what marks content as announced, so a crash cannot produce a second batch for the same publication. Each (batch, subscriber) pair is recorded right after sending, so retries skip people who already got it. If Google stops the script in the instant between sending and recording, that one person can get the mail twice. This is rare, not impossible.
- **Certificates:** a row is marked `SENDING` before its mail goes out. A crash leaves a visible `SENDING` row that is never retried automatically; check the Gmail Sent folder, then clear the Status cell to retry. Two runs at once are blocked by a lock.

## Setup (once)
1. Dedicated Gmail account. Create a Google Sheet there (e.g. "DK Blog Mailer").
2. Extensions -> Apps Script. Paste `Code.gs`. Project Settings -> tick "Show appsscript.json" and paste `appsscript.json`.
3. Run `installMailer` once from that editor and approve permissions. It saves the Sheet's ID (the public web app needs it) and records existing posts as seen, so nothing old is mailed.
4. Deploy -> New deployment -> Web app -> Execute as **Me**, Access **Anyone**. Copy the `/exec` URL.
5. Paste it into `CFG.webAppUrl` in `Code.gs`, then Deploy -> Manage deployments -> edit -> New version. (Every later code change needs a new version too.)
6. Paste the same URL into `ENDPOINT` in `subscribe-test/index.html`, commit, deploy the site.
7. Run `sendTestMails`; check the three templates.
8. **Browser test with real addresses (could not be done here):** at `/subscribe-test` subscribe with your own and your friend's address; check the page's message, the confirmation mail, the confirm button page, the welcome mail, then publish a test post and wait for the alert; then try the unsubscribe link. Also open the page in a second browser theme.
9. Only when all of that works: copy `subscribe-test/index.html` over `subscribe/index.html` and delete the test folder.

## Migrating existing Brevo subscribers (deliberate, not automatic)
1. In Brevo, export only contacts that are **currently subscribed**. Never import unsubscribed, blocklisted or bounced contacts; their choices must be kept.
2. Paste those e-mails into column A of `Subscribers`, then run Blog Mailer -> Prepare imported subscribers. They become confirmed, with their own unsubscribe tokens.
3. Decide whether to send them a one-line notice that the mailing has moved. Switch off Brevo's notification script only after step 8 above passes.

## Certificates after each quiz
Fill rows (leave Status empty). Menu: Blog Mailer -> Preview certificates -> Send certificates. Status shows `sent <time>` or `FAILED: <reason>`; FAILED rows are retried on the next run. The sending account must be able to open each file.

## Not included
Open/click analytics, and a List-Unsubscribe header (Apps Script cannot set custom headers).
