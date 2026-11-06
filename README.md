# Switchly

A local-only browser extension that saves a website's login state (cookies, `localStorage`, and `sessionStorage`) and restores it later. Switch between accounts without logging out.

No server, accounts, analytics, or network requests. Session data stays in the browser profile.

## Requirements

- Node.js 20.19+ (22.12+ recommended)
- Chrome, Edge, Brave, Opera, or another Chromium browser
- Firefox 115+
- Firefox only: the extension requests website access from its popup on first use

## Install for development

```bash
npm install
npm run build
```

### Chromium

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `dist/chromium`.

If the browser has more than one profile, install it in the profile you want to use. Session data is stored per extension install.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `dist/firefox/manifest.json`.
4. Open the extension popup and click **Grant access** if the permission banner appears.

Temporary add-ons disappear when Firefox restarts. A permanent install requires signing through AMO (`web-ext sign`) or installing an unbranded build with signature checks disabled. Before submitting to AMO, change `browser_specific_settings.gecko.id` in `scripts/build-manifest.ts` to an ID you own.

## Build and test

```bash
npm run build          # dist/chromium and dist/firefox
npm test               # Vitest unit tests
npm run typecheck      # TypeScript strict check
npm run lint           # ESLint
npm run format:check   # Prettier
npm run package        # builds zip/XPI in artifacts/
```

Packaging uses `web-ext build` for both targets:

- `artifacts/switchly-chromium.zip`
- `artifacts/switchly-firefox.xpi`

Regenerate icons with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
```

## How it works

- The popup reads the active tab's hostname (`www.` is removed).
- **Save Current Session** captures cookies for the URL and domain plus both page storage areas.
- **Switch** updates the active session's snapshot first, then removes the site's cookies and storage, restores the target snapshot, and reloads the tab.
- **New Session** saves the current snapshot, clears the site, and leaves you logged out.
- **Clear Session** removes the current site state without saving it; it can also delete saved sessions for the site.
- **Export/Import** uses a JSON file. Import runs on a full page in a new tab and merges by session ID.

## Behavior decisions

A few details are stricter than the original plan to prevent data loss:

- Clicking the **active** session re-applies its snapshot instead of doing nothing. This recovers sessions after a manual logout, a missing cookie, or an interrupted switch.
- Destructive operations write a transient pending marker to `storage.session` before wiping cookies. If the popup closes mid-operation, the next popup shows a retry banner and suppresses auto-update until the operation completes.
- Auto-update saves the current site state into the active session on every switch. Do not log in manually outside the extension while a saved session is active: the new account state can overwrite that snapshot.
- If clearing cookies fails, restore is aborted instead of mixing cookies from two accounts.
- Expired cookies are skipped during restore.

## Privacy and security

- All data stays in `browser.storage.local`. Nothing is uploaded.
- Full policy: [PRIVACY.md](PRIVACY.md).
- Session cookies and page storage are stored **unencrypted**. Anyone with access to the browser profile can read them.
- The extension asks for `<all_urls>` because it can be used on any website.
- Imported JSON is untrusted input. Host names, session fields, and cookies are validated before anything is written. Prototype-like keys such as `__proto__` are rejected as site names.
- Imported cookies are restricted to the session's site, its parent domain, or its subdomains. `storeId` values are discarded on import, and restore revalidates the scope before setting anything.
- Page storage operations verify the tab origin and abort if the page navigated during an operation.
- Only import files you exported yourself. A valid file can still plant site storage and cookies within the named site and its related domains.
- Export files contain live login cookies and site storage. Share them only with yourself.

## Known limitations

- IndexedDB, Cache Storage, and service worker data are not captured. Sites that keep authentication there may still ask you to log in.
- Some sites bind sessions to a device, IP address, or browser fingerprint. Imported sessions may not work on another device.
- Some `Secure` or `SameSite=None` cookies may be rejected when restored under different conditions.
- Cookie scope follows the site's domain and can include related subdomains. On multi-subdomain sites, saving on one host may affect cookies used by another.
- Incognito/private windows require manually allowing the extension in that mode.
- Firefox container tabs are supported only in a basic way.
- Active session auto-update can overwrite a snapshot if you log in manually outside the extension.
- The popup stays open during a switch; closing it mid-operation is recoverable via the pending banner but can leave the site partially wiped.
- Firefox 115+ is the target. The manifest declares `data_collection_permissions` for current AMO submissions; `web-ext lint` warns that Firefox 115 predates that key. Remove that key if you need warning-free linting for a 115-only deployment.
- Chrome's branded builds may ignore `--load-extension` when launched from the command line. Load unpacked through `chrome://extensions` instead.

## Project structure

```
src/
  core/          data model, storage, capture/wipe/restore, import/export, validation
  popup/         popup HTML/CSS, state machine, components, icons
  import/        full-page import UI
  shared/        date/format and DOM helpers
tests/           Vitest unit tests
scripts/         manifest build, clean, icon generation
manifest.base.json
```

Local planning documents under `docs/` are intentionally excluded from version control.
