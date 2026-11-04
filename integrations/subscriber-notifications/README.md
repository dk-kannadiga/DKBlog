# Subscriber notifications

Project: https://script.google.com/home/projects/1BzPjYcXo5lOw2fZt7YbgFWwdHWtO-bUhuO6VJjO-zp4utp74Xb0-4gWR/edit

Not activated. Copy Code.gs and the manifest into the standalone project. BREVO_API_KEY stays in Script properties. Run checkSubscriberConnection, then createSubscriberTestDraft. In Brevo use the draft's Send a test option to the owner's address. Only after the test succeeds run installSubscriberNotifications. No web-app deployment required. Installer sets a baseline without mailing old content; reinstall preserves it.

Polling reads posts, collections, and current quiz every five minutes. New collection memberships also notify; simultaneous new posts and membership additions are combined without duplicate entries. Ordinary edits and removals do not notify. Upcoming/live quiz gets one announcement per ID. Publishing and removing an item between polls can be missed. Imports after activation count as new publications. The first successful send request checkpoints identities permanently in private Script properties (subject to Apps Script storage quotas).

Campaigns target confirmed subscribers in list 3; use marketing campaigns so Brevo applies its marketing unsubscribe/blocklist handling. Several new items within a polling interval share one message. Provider quotas still apply: 300 free recipient emails/day shared with confirmations and other sending. This is not unlimited delivery or guaranteed inbox placement.

NOTICE_PENDING intentionally halts automation after an uncertain create/send response instead of risking duplicate campaigns. Inspect the saved campaign ID in Brevo. If sent/scheduled, set seen_<key> to 1 for each listed key before deleting NOTICE_PENDING. If unsent, resolve/retry that existing draft manually, then checkpoint those same keys. Never blindly clear the pending property or rerun a send after a timeout. Google sends trigger-failure notices to the script owner. Campaign dispatch acknowledgement is not confirmation of delivery.

No API key in source, browser code, or GitHub. No subscriber database is copied to Firestore. Pause by deleting the pollSubscriberNotifications time trigger.
