import test from 'node:test';
import assert from 'node:assert/strict';
import { readContext } from '../src/background/context.js';

function browser({ focused = true, idle = 'active', incognito = false, fullscreen = false } = {}) {
  return {
    idle: { queryState: async () => idle },
    windows: { getLastFocused: async () => ({ id: 4, focused, state: fullscreen ? 'fullscreen' : 'normal' }) },
    tabs: {
      query: async ({ windowId, active }) => {
        assert.equal(windowId, 4);
        assert.equal(active, true);
        return [{ id: 7, incognito, url: 'https://example.com/private' }];
      },
      sendMessage: async () => ({ fullscreen: false }),
    },
  };
}

test('counts only the active tab in the focused window', async () => {
  assert.deepEqual(await readContext(browser()), { domain: 'example.com', tabId: 7, fullscreen: false });
  assert.equal(await readContext(browser({ focused: false })), null);
});
test('private, idle and locked contexts never count', async () => {
  for (const options of [{ incognito: true }, { idle: 'idle' }, { idle: 'locked' }]) {
    assert.equal(await readContext(browser(options)), null);
  }
});
test('browser and DOM fullscreen both count', async () => {
  assert.equal((await readContext(browser({ fullscreen: true }))).fullscreen, true);
  const api = browser();
  api.tabs.sendMessage = async () => ({ fullscreen: true });
  assert.equal((await readContext(api)).fullscreen, true);
});
test('a page without a content script still tracks ordinary website time', async () => {
  const api = browser();
  api.tabs.sendMessage = async () => { throw new Error('No receiving end'); };
  assert.equal((await readContext(api)).domain, 'example.com');
});
test('an unfocused split-view page does not count even in a focused window', async () => {
  const api = browser();
  api.tabs.query = async () => [{ id: 7, url: 'https://a.com' }, { id: 8, url: 'https://b.com' }];
  api.tabs.sendMessage = async () => ({ fullscreen: false, focused: false });
  assert.equal(await readContext(api), null);
});
test('popup or omnibox focus does not stop the sole active website', async () => {
  const api = browser();
  api.tabs.sendMessage = async () => ({ fullscreen: false, focused: false });
  assert.equal((await readContext(api)).domain, 'example.com');
});
test('split view selects the focused pane, not the first active tab', async () => {
  const api = browser();
  api.tabs.query = async () => [{ id: 7, url: 'https://a.com' }, { id: 8, url: 'https://b.com' }];
  api.tabs.sendMessage = async id => ({ focused: id === 8, fullscreen: false });
  assert.equal((await readContext(api)).domain, 'b.com');
});
test('unresponsive content scripts do not stall context reads', async () => {
  const api = browser();
  api.tabs.sendMessage = () => new Promise(() => {});
  assert.equal((await readContext(api, 10)).domain, 'example.com');
});
test('all browser context errors fail closed without relying on error wording', async () => {
  for (const [namespace, method] of [['windows', 'getLastFocused'], ['idle', 'queryState'], ['tabs', 'query']]) {
    const api = browser();
    api[namespace][method] = async () => { throw new Error('Browser context unavailable'); };
    assert.equal(await readContext(api), null);
  }
});
test('closing the last window yields no eligible website', async () => {
  const api = browser();
  api.windows.getLastFocused = async () => { throw new Error('No last focused window'); };
  assert.equal(await readContext(api), null);
});
