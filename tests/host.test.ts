import { describe, expect, it } from 'vitest';
import {
  hostFromUrl,
  isValidHostKey,
  normalizeHostKey,
  normalizeImportedHost,
} from '../src/core/host';

describe('hostFromUrl', () => {
  it('normalizes www and returns the hostname', () => {
    expect(hostFromUrl('https://www.chatgpt.com/c/123')).toBe('chatgpt.com');
    expect(hostFromUrl('http://ChatGPT.com/')).toBe('chatgpt.com');
  });

  it('removes ports and keeps local hosts', () => {
    expect(hostFromUrl('https://chatgpt.com:8443/')).toBe('chatgpt.com');
    expect(hostFromUrl('http://localhost:3000/')).toBe('localhost');
  });

  it('rejects unsupported schemes and internal pages', () => {
    expect(hostFromUrl(undefined)).toBeNull();
    expect(hostFromUrl('chrome://extensions')).toBeNull();
    expect(hostFromUrl('about:blank')).toBeNull();
    expect(hostFromUrl('file:///C:/test.html')).toBeNull();
    expect(hostFromUrl('not a url')).toBeNull();
  });

  it('rejects web store pages where scripting is blocked', () => {
    expect(hostFromUrl('https://chromewebstore.google.com/detail/abc')).toBeNull();
    expect(hostFromUrl('https://chrome.google.com/webstore/detail/abc')).toBeNull();
    expect(hostFromUrl('https://addons.mozilla.org/en-US/firefox/')).toBeNull();
    expect(hostFromUrl('https://microsoftedge.microsoft.com/addons/detail/abc')).toBeNull();
  });
});

describe('normalizeHostKey', () => {
  it('lowercases, removes trailing dots, and strips www', () => {
    expect(normalizeHostKey('WWW.Example.COM.')).toBe('example.com');
  });
});

describe('isValidHostKey', () => {
  it('accepts normal hostnames and localhost', () => {
    expect(isValidHostKey('example.com')).toBe(true);
    expect(isValidHostKey('sub.example.co.uk')).toBe(true);
    expect(isValidHostKey('localhost')).toBe(true);
    expect(isValidHostKey('127.0.0.1')).toBe(true);
  });

  it('rejects malformed and reserved keys', () => {
    expect(isValidHostKey('')).toBe(false);
    expect(isValidHostKey('Example.com')).toBe(false);
    expect(isValidHostKey('.example.com')).toBe(false);
    expect(isValidHostKey('bad host')).toBe(false);
    expect(isValidHostKey('__proto__')).toBe(false);
    expect(isValidHostKey('constructor')).toBe(false);
    expect(isValidHostKey('prototype')).toBe(false);
  });
});

describe('normalizeImportedHost', () => {
  it('normalizes trusted export keys', () => {
    expect(normalizeImportedHost(' WWW.Example.COM. ')).toBe('example.com');
    expect(normalizeImportedHost('chatgpt.com')).toBe('chatgpt.com');
  });

  it('rejects invalid and reserved keys', () => {
    expect(normalizeImportedHost('__proto__')).toBeNull();
    expect(normalizeImportedHost('constructor')).toBeNull();
    expect(normalizeImportedHost('bad host')).toBeNull();
    expect(normalizeImportedHost(42)).toBeNull();
  });
});
