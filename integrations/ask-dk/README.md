# ಡೀಕೆಯನ್ನು ಕೇಳಿ

Create a separate Google Apps Script project. Copy `Code.gs` and `appsscript.json`. In Script properties, set `GEMINI_API_KEY` and `GEMINI_MODEL` to a Flash-Lite model available in your Google AI Studio project. Keep the key out of the repository, browser code and chat. Deploy as a Web app, execute as the owner, and allow anonymous access. Save the `/exec` URL as the `url` field of the public Firestore document `siteSettings/askDk`. Only that URL is public.

The backend reads published article text from public Firestore, sends the question and up to 32 bounded passages to Gemini, and checks each citation against a verbatim passage before accepting an answer. This checks citation integrity; it cannot prove every sentence in a generated answer is correct. Questions may reach Google, so the form tells visitors to omit personal information. The site renders the returned answer as plain text and builds links from validated post IDs.

The shared cap is 20 attempted requests per India calendar day, enforced under a script lock. Each request can make at most one model call, with capped input passages and output tokens. There is no paid-tier activation in this setup. If the backend is unconfigured, article search remains available.
