// Vitest + Testing Library setup: jest-dom matchers, RTL cleanup between tests,
// and a minimal localStorage reset so auth-dependent UI starts logged-out.
// jsdom 30 does not expose localStorage — install an in-memory shim when missing.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(String(k)),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  }
}

if (typeof window.matchMedia === "undefined") {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false
    },
  })
}

afterEach(() => {
  cleanup()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})
