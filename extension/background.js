/* LUMI background service worker (MV3)
 * - Injects content script on action click or context menu
 * - Captures screenshots on request
 * - Bridges messages to Native Messaging Host (per-request send)
 */

const HOST_NAME = 'com.lumi.host';

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.contextMenus && chrome.contextMenus.create) {
    try {
      chrome.contextMenus.create({
        id: 'lumi-start',
        title: 'LUMI: Select and Edit',
        contexts: ['all']
      });
    } catch (e) {
      // ignore menu creation failures
    }
  }
});

if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'lumi-start' && tab && tab.id) {
      await injectContent(tab.id);
      chrome.tabs.sendMessage(tab.id, { type: 'LUMI_START' });
    }
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  await injectContent(tab.id);
  chrome.tabs.sendMessage(tab.id, { type: 'LUMI_START' });
});

async function injectContent(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (e) {
    // content may already be present; ignore
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'LUMI_CAPTURE_VISIBLE': {
          const tabId = sender.tab?.id;
          if (!tabId) throw new Error('No sender tab id');
          const tab = await chrome.tabs.get(tabId);
          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          sendResponse({ ok: true, dataUrl });
          return;
        }
        case 'LUMI_HOST_SEND': {
          const response = await sendNative(msg.payload);
          sendResponse({ ok: true, response });
          return;
        }
        case 'LUMI_HOST_PING': {
          const response = await sendNative({ action: 'PING' });
          sendResponse({ ok: true, response });
          return;
        }
        case 'LUMI_GET_SETTINGS': {
          const keys = ['engine'];
          const v = await chrome.storage.local.get(keys);
          sendResponse({ ok: true, settings: v });
          return;
        }
        case 'LUMI_SAVE_SETTINGS': {
          await chrome.storage.local.set(msg.settings || {});
          sendResponse({ ok: true });
          return;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true; // keep channel open for async
});

function sendNative(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve(response);
      });
    } catch (e) {
      reject(e);
    }
  });
}
