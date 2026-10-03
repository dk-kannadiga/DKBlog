# Secure quiz grading

Standalone Apps Script project: `1NYGYs3rzJPxcDq_2OTZND0KN-QTXmxNArJrHrFBt1J4sKV4pBhs9Cnbn`.
This is independent of the library sheet and email automation. No Firebase paid-plan upgrade is required. Apps Script and Firebase quotas still apply.

## Data contract

- `siteSettings/activeQuiz`: public question text/options, display metadata, security version 2 and publishing version; **no answers, explanations or response data**.
- `quizKeys/{quizId}`: owner-only full questions, matching publishing version and permanent question lock once live.
- `quizSubmissions/{quizId}_{firebaseUid}`: immutable server-created answers, score, total, participant name and timestamp.
- `prizeQuizEntries/{quizId}_{firebaseUid}`: server-created contact details; owner-only reads.
- `quizReceipts/{requestUuid}_{firebaseUid}`: minimal private acknowledgement/error code. Client cannot create, change, list or delete these.
- `quizzes/archive-{quizId}`: intentionally public answers/explanations after archiving. Never reuse an archived ID for a new attempt.

## Deployment

1. Copy `Code.gs` and `appsscript.json` into the standalone project.
2. Deploy a Web app, executing as the website owner, with access for Anyone. Obtain explicit owner approval before granting OAuth/database access and publishing this endpoint. The service authorizes requests itself using Firebase ID tokens; public endpoint access does not imply public database/key access.
3. Set `siteSettings/quizService` to `{url: "https://script.google.com/macros/s/DEPLOYMENT_ID/exec"}` using owner credentials.
4. Deploy Firestore rules and hosting. Keep the web app at a versioned `/exec` URL, not the editor-only `/dev` URL.
5. Run `node scripts/configure-quiz-grading.mjs "https://script.google.com/macros/s/DEPLOYMENT_ID/exec"`, followed by `node scripts/test-quiz-security.cjs` and `node scripts/verify-quiz-security-live.mjs`.

Tokens are sent in POST bodies, not query strings. Firebase validates signatures through `accounts:lookup`; the service additionally checks project, issuer, UID, expiry and account status. Owner OAuth credentials never leave the service. Live-state/key reads and immutable submission/contact writes share a Firestore transaction, so concurrent closure or duplicate submissions cannot slip through. Score/UID fields from callers are ignored. Active answer feedback is withheld until archiving, including for certificate quizzes.

Historical submissions are preserved and may still be scored from owner-only keys for administration. They were collected under the previous security model and are not retroactively certified as trusted. Results are one attempt **per Firebase session/account**, not guaranteed one attempt per human; anonymous users can create another session. Repeating archived questions cannot make their previously published answers secret; change questions before a competitive event. Client-rendered certificate images are not cryptographically verifiable. This service does not add identity verification, App Check, or a global anti-abuse firewall.

If activation is pending or the service fails, submission fails closed and the browser must not invent a score or certificate. The admin cannot start a quiz until a grading endpoint is configured.
