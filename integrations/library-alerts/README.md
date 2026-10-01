# ಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ — book-request email alerts

Standalone Apps Script source, intentionally separate from the inventory Sheet
script. Mail authorization or delivery failures cannot interrupt inventory sync.

Live project: [ಸ್ವಾನಂದ ಗ್ರಂಥನಿಧಿ — Book Request Alerts](https://script.google.com/home/projects/1YHqlVBzxjwAQONWKQjx7P478gLaEuj9MwnQCePXUhZCeFyN9s-kjfHKV/edit).

Activated on 1 October 2026. The installer completed successfully, the initial
test email was verified in the recipient's inbox, and a manual poll completed
against production Firestore. Existing inventory automation was not modified.

- Sends Kannada alerts only to the owner's configured address. The recipient is
  stored privately in the `libraryRequestAlertRecipient` script property, not
  published in the website or this repository.
- The alert contains the book, requester name/contact, request time in India,
  and the authenticated `/admin` link. It does not forward the free-text note.
- Polls Firestore daily around 07:00 IST, up to 100 new requests per check,
  subject to the sender's remaining email quota. No email is sent on days
  without new requests. Google clock triggers are approximate (normally within
  about 15 minutes). It reads
  only the fields needed for the alert, with no Sheet or Firestore writes.
- First installation starts from that moment; historical requests are excluded.
  Reinstalling preserves the checkpoint and does not create duplicate timers.
- The `(requestedAt, document name)` cursor handles simultaneous requests and
  subsequent requests that reuse an existing document ID.
- A successful send advances the checkpoint. A failed send or exhausted email
  quota leaves pending requests available for a later check. Normal repeat
  checks do not resend alerts. Mail submission and checkpoint storage cannot
  be atomic: an exceptional crash after sending but before checkpointing can
  cause a duplicate. MailApp acceptance does not guarantee inbox delivery.
- Google quotas apply. MailApp's permission permits sending, not reading inbox
  messages. No SMTP password, API secret, or new paid messaging service is used.

Create a standalone Apps Script project with these files. The signed-in Google
account must have access to the Firebase project. Set the private recipient
script property in Project settings. Run `installLibraryRequestAlerts`,
authorize the listed permissions, and confirm the test email. The installer
checks Firestore access before installing a timer and sends one initial test.
`pollLibraryRequestAlerts` can also be run manually for verification.
Reinstalling replaces only the alert timer; the recipient and delivery
checkpoint remain unchanged, so pending requests are not discarded.
The live timer was migrated from five-minute checks on 1 October 2026.
