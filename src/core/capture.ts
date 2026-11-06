import browser from 'webextension-polyfill';
import type { Tabs } from 'webextension-polyfill';
import { dedupeCookies, toStoredCookie } from './cookies';
import { hostFromUrl } from './host';
import type { CaptureResult, StoredCookie } from './types';

interface PageStorage {
  local: Record<string, string> | null;
  session: Record<string, string> | null;
}

export async function collectSiteCookies(tabUrl: string, host: string): Promise<StoredCookie[]> {
  const [byUrl, byDomain] = await Promise.all([
    browser.cookies.getAll({ url: tabUrl }),
    browser.cookies.getAll({ domain: host }),
  ]);

  // Chrome returns partitioned cookies only when a partitionKey filter is supplied.
  // Firefox rejects the unknown filter, so failures are intentionally ignored.
  const partitioned = await Promise.allSettled([
    browser.cookies.getAll({
      url: tabUrl,
      partitionKey: {},
    } as Parameters<typeof browser.cookies.getAll>[0]),
    browser.cookies.getAll({
      domain: host,
      partitionKey: {},
    } as Parameters<typeof browser.cookies.getAll>[0]),
  ]);

  const all = [...byUrl, ...byDomain];
  for (const result of partitioned) {
    if (result.status === 'fulfilled') all.push(...result.value);
  }

  return dedupeCookies(all.map(toStoredCookie));
}

async function readPageStorage(tabId: number, expectedOrigin: string): Promise<PageStorage> {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    args: [expectedOrigin],
    func: (origin: string) => {
      if (window.location.origin !== origin) {
        return { local: null, session: null };
      }

      const read = (storage: Storage): Record<string, string> | null => {
        try {
          return Object.fromEntries(Object.entries(storage));
        } catch {
          return null;
        }
      };

      return {
        local: read(window.localStorage),
        session: read(window.sessionStorage),
      };
    },
  });

  const result = results[0]?.result as PageStorage | undefined;
  return result ?? { local: null, session: null };
}

export async function capture(tab: Tabs.Tab): Promise<CaptureResult> {
  if (tab.id === undefined || !tab.url) {
    throw new Error('The active tab cannot be read.');
  }

  const host = hostFromUrl(tab.url);
  if (!host) {
    throw new Error('This page is not supported.');
  }

  const origin = new URL(tab.url).origin;
  const cookiesPromise = collectSiteCookies(tab.url, host);
  const storagePromise = readPageStorage(tab.id, origin).catch(() => ({
    local: null,
    session: null,
  }));

  const [cookies, storage] = await Promise.all([cookiesPromise, storagePromise]);
  const storageOk = storage.local !== null && storage.session !== null;

  return {
    cookies,
    localStorage: storage.local ?? {},
    sessionStorage: storage.session ?? {},
    storageOk,
  };
}
