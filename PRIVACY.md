# Switchly Privacy Policy

Last updated: 2026-11-06

Switchly is a local-only browser extension. It does not use a server, user accounts, analytics, telemetry, advertising, or remote code.

## Data stored by the extension

When you choose to save a session, Switchly stores this data in your browser's extension storage on your device:

- cookies for the current website
- the website's `localStorage` and `sessionStorage`
- the website hostname, session name, order, and timestamps
- the active session selected for that hostname

The hostname of the active tab is read so Switchly can show sessions for the current website.

Export files created by Switchly contain the same session data. They are written directly to your device by your browser. You choose where to save them.

## How data is used

Session data is used only to provide Switchly's single purpose: saving, restoring, and switching between website sessions, and exporting/importing those sessions at your request.

Switchly does not:

- send session data to the developer or any third party
- sell, rent, or share data
- use data for advertising, profiling, or credit decisions
- use data for any purpose unrelated to session switching
- allow humans to read session data (the data never leaves your browser through the extension)

Switchly's use of data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Permissions

- **cookies** — read, set, and remove cookies for the website you choose to manage.
- **scripting** — read and write the site's `localStorage` and `sessionStorage`.
- **tabs** — read the active tab URL and reload the tab after switching.
- **storage / unlimitedStorage** — keep saved sessions locally.
- **host permissions (`<all_urls>`)** — allow the extension to work on any website you visit; it only acts when you use the popup.

## Retention and deletion

Data remains in your browser until you:

- delete a saved session,
- clear sessions for a site,
- clear the extension's storage, or
- uninstall the extension.

Files exported by you are outside the extension's control and must be deleted by you.

## Security

Session data is stored unencrypted in your browser profile, at the same risk level as your browser's own cookies. Anyone with access to your browser profile can read it. Export files contain live login cookies and site storage; store and share them only with yourself.

## Contact

Questions or requests: [open an issue](https://github.com/bieee123/Switchly/issues).

## Changes

If this policy changes, the updated version will be published in this repository with a new "Last updated" date.
