import browser from 'webextension-polyfill';
import type { Cookies, Tabs } from 'webextension-polyfill';
import { buildCookieUrl } from './cookies';
import { collectSiteCookies } from './capture';
import { hostFromUrl } from './host';
import type { StoredCookie, WipeResult } from './types';

function removeDetails(cookie: StoredCookie): Cookies.RemoveDetailsType {
  const details: Cookies.RemoveDetailsType = {
    url: buildCookieUrl(cookie),
    name: cookie.name,
  };

  if (cookie.storeId) details.storeId = cookie.storeId;
  if (cookie.partitionKey !== undefined) {
    details.partitionKey = cookie.partitionKey as Cookies.PartitionKey;
  }
  if (cookie.firstPartyDomain) details.firstPartyDomain = cookie.firstPartyDomain;

  return details;
}

async function removeCookie(cookie: StoredCookie): Promise<boolean> {
  const details = removeDetails(cookie);

  try {
    await browser.cookies.remove(details);
    return true;
  } catch {
    try {
      await browser.cookies.remove({ url: details.url, name: details.name });
      return true;
    } catch {
      return false;
    }
  }
}

async function clearPageStorage(tabId: number, expectedOrigin: string): Promise<boolean> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      args: [expectedOrigin],
      func: (origin: string) => {
        if (window.location.origin !== origin) return false;

        let ok = true;
        try {
          window.localStorage.clear();
        } catch {
          ok = false;
        }
        try {
          window.sessionStorage.clear();
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

export async function wipe(tab: Tabs.Tab): Promise<WipeResult> {
  if (tab.id === undefined || !tab.url) {
    throw new Error('The active tab cannot be read.');
  }

  const host = hostFromUrl(tab.url);
  if (!host) {
    throw new Error('This page is not supported.');
  }

  const origin = new URL(tab.url).origin;
  const cookies = await collectSiteCookies(tab.url, host);
  const results = await Promise.all(cookies.map(removeCookie));
  const storageOk = await clearPageStorage(tab.id, origin);

  return {
    removed: results.filter(Boolean).length,
    cookiesFailed: results.filter((removed) => !removed).length,
    storageOk,
  };
}
