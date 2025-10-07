/**
 * Test Setup
 * Mocks Chrome APIs and configures test environment
 */

import { jest } from '@jest/globals';

// Mock Chrome APIs
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    sendMessage: jest.fn((message, callback) => {
      if (callback) callback({ success: true });
    }),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    lastError: null
  },
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        callback({});
      }),
      set: jest.fn((items, callback) => {
        if (callback) callback();
      })
    }
  },
  tabs: {
    captureVisibleTab: jest.fn((windowId, options, callback) => {
      callback('data:image/png;base64,mockImageData');
    }),
    sendMessage: jest.fn()
  }
};

// Mock window.getSelection for contenteditable tests
global.getSelection = jest.fn(() => ({
  rangeCount: 0,
  getRangeAt: jest.fn(),
  removeAllRanges: jest.fn(),
  addRange: jest.fn()
}));

// Suppress console logs during tests (optional)
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

