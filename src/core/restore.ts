import browser from 'webextension-polyfill';
import type { Cookies, Tabs } from 'webextension-polyfill';
import {
  buildCookieUrl,
  hasCookiePrefixThatDisallowsDomain,
  isCookieInSessionScope,
  isExpiredCookie,
  normalizeCookieDomain,
} from './cookies';
import { hostFromUrl } from './host';
import type { RestoreResult, Session, StoredCookie } from './types';

function setDetails(cookie: StoredCookie): Cookies.SetDetailsType {
  const domain = normalizeCookieDomain(cookie.domain);
  if (!domain) {
    throw new Error('Cookie has an invalid domain.');
  }

  const details: Cookies.SetDetailsType = {
    url: buildCookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
  };

  if (cookie.hostOnly === false && !hasCookiePrefixThatDisallowsDomain(cookie)) {
    details.domain = domain;
  }
  if (!cookie.session && cookie.expirationDate !== undefined) {
    details.expirationDate = cookie.expirationDate;
  }
  if (cookie.storeId) details.storeId = cookie.storeId;
  if (cookie.partitionKey !== undefined) {
    details.partitionKey = cookie.partitionKey as Cookies.PartitionKey;
  }
  if (cookie.firstPartyDomain) {
    details.firstPartyDomain = cookie.firstPartyDomain;
  }

  return details;
}

async function setCookie(cookie: StoredCookie): Promise<boolean> {
  const details = setDetails(cookie);

  try {
    await browser.cookies.set(details);
    return true;
  } catch {
    try {
      const fallback: Cookies.SetDetailsType = { ...details };
      delete fallback.partitionKey;
      delete fallback.storeId;
      delete fallback.firstPartyDomain;
      await browser.cookies.set(fallback);
      return true;
    } catch {
      return false;
    }
  }
}

async function writeStorage(
  tabId: number,
  session: Session,
  expectedOrigin: string,
): Promise<boolean> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      args: [expectedOrigin, session.localStorage, session.sessionStorage],
      func: (
        origin: string,
        localData: Record<string, string>,
        sessionData: Record<string, string>,
      ) => {
        if (window.location.origin !== origin) return false;

        let ok = true;

        try {
          window.localStorage.clear();
          for (const [key, value] of Object.entries(localData)) {
            window.localStorage.setItem(key, value);
          }
        } catch {
          ok = false;
        }

        try {
          window.sessionStorage.clear();
          for (const [key, value] of Object.entries(sessionData)) {
            window.sessionStorage.setItem(key, value);
          }
        } catch {
          ok = false;
        }

        return ok;
      },
    });

    return results[0]?.result === true;
  } catch {
    return false;
  }
}

export async function restore(tab: Tabs.Tab, session: Session): Promise<RestoreResult> {
  if (tab.id === undefined || !tab.url) {
    throw new Error('The active tab cannot be read.');
  }

  const host = hostFromUrl(tab.url);
  if (!host) {
    throw new Error('This page is not supported.');
  }

  // Defense in depth: imported or older data must never set cookies outside
  // the site that the session belongs to.
  if (!session.cookies.every((cookie) => isCookieInSessionScope(cookie, host))) {
    throw new Error('This session contains cookies for another site and was not restored.');
  }

  const origin = new URL(tab.url).origin;
  const now = Date.now();
  const cookies = session.cookies.filter((cookie) => !isExpiredCookie(cookie, now));
  const results = await Promise.all(cookies.map(setCookie));
  const storageOk = await writeStorage(tab.id, session, origin);

  return {
    cookiesFailed: results.filter((ok) => !ok).length,
    storageOk,
  };
}
