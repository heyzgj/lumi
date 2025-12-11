/**
 * Integration Check - Verify module dependencies and basic instantiation
 */

import EventBus from '../src/lib/core/EventBus.js';
import StateManager from '../src/lib/core/StateManager.js';
import TopBanner from '../src/lib/ui/TopBanner.js';
import HighlightManager from '../src/lib/selection/HighlightManager.js';
import EngineManager from '../src/lib/engine/EngineManager.js';
import HealthChecker from '../src/lib/engine/HealthChecker.js';
import ChromeBridge from '../src/lib/communication/ChromeBridge.js';
import ServerClient from '../src/lib/communication/ServerClient.js';
import { getElementSelector, readableElementName, shouldIgnoreElement, getComputedStyleSummary } from '../src/lib/utils/dom.js';
import DockRoot from '../src/lib/ui/dock/DockRoot.js';
import DockEditModal from '../src/lib/ui/dock/DockEditModal.js';
import { GLOBAL_STYLES } from '../src/lib/ui/styles.js';
import { DOCK_STYLES } from '../src/lib/ui/dock/styles.js';

console.log('🔍 Starting integration check...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

// Core modules
test('EventBus can be instantiated', () => {
  const eventBus = new EventBus();
  if (!eventBus.on || !eventBus.emit) throw new Error('Missing methods');
});

test('StateManager can be instantiated', () => {
  const eventBus = new EventBus();
  const stateManager = new StateManager(eventBus);
  if (!stateManager.get || !stateManager.set) throw new Error('Missing methods');
});

// UI modules
test('TopBanner can be instantiated', () => {
  const banner = new TopBanner();
  if (!banner.mount || !banner.show) throw new Error('Missing methods');
});

test('DOCK_STYLES is defined', () => {
  if (typeof DOCK_STYLES !== 'string') throw new Error('Not a string');
  if (DOCK_STYLES.length < 100) throw new Error('Too short');
});

test('DockRoot export is available', () => {
  if (typeof DockRoot !== 'function') throw new Error('DockRoot not exported as function/class');
});

test('DockEditModal export is available', () => {
  if (typeof DockEditModal !== 'function') throw new Error('DockEditModal not exported as function/class');
});

test('GLOBAL_STYLES is defined', () => {
  if (typeof GLOBAL_STYLES !== 'string') throw new Error('Not a string');
});

// Selection modules
test('HighlightManager can be instantiated', () => {
  const manager = new HighlightManager();
  if (!manager.showHover || !manager.clearAll) throw new Error('Missing methods');
});

// Communication modules
test('ChromeBridge can be instantiated', () => {
  const eventBus = new EventBus();
  const bridge = new ChromeBridge(eventBus);
  if (!bridge.sendMessage || !bridge.captureScreenshot) throw new Error('Missing methods');
});

test('ServerClient can be instantiated', () => {
  const eventBus = new EventBus();
  const bridge = new ChromeBridge(eventBus);
  const client = new ServerClient(bridge);
  if (!client.execute || !client.buildContext) throw new Error('Missing methods');
});

// Engine modules
test('EngineManager can be instantiated', () => {
  const eventBus = new EventBus();
  const stateManager = new StateManager(eventBus);
  const chromeBridge = new ChromeBridge(eventBus);
  const manager = new EngineManager(eventBus, stateManager, chromeBridge);
  if (!manager.selectEngine || !manager.getCurrentEngine) throw new Error('Missing methods');
});

test('HealthChecker can be instantiated', () => {
  const eventBus = new EventBus();
  const stateManager = new StateManager(eventBus);
  const chromeBridge = new ChromeBridge(eventBus);
  const engineManager = new EngineManager(eventBus, stateManager, chromeBridge);
  const checker = new HealthChecker(eventBus, stateManager, chromeBridge, engineManager);
  if (!checker.start || !checker.stop) throw new Error('Missing methods');
});

// Utils
test('DOM utils are exported', () => {
  if (typeof getElementSelector !== 'function') throw new Error('getElementSelector not a function');
  if (typeof readableElementName !== 'function') throw new Error('readableElementName not a function');
  if (typeof shouldIgnoreElement !== 'function') throw new Error('shouldIgnoreElement not a function');
  if (typeof getComputedStyleSummary !== 'function') throw new Error('getComputedStyleSummary not a function');
});

// Integration test: Create full module stack
test('Full module stack can be instantiated', () => {
  const eventBus = new EventBus();
  const stateManager = new StateManager(eventBus);
  const chromeBridge = new ChromeBridge(eventBus);
  const serverClient = new ServerClient(chromeBridge);
  const topBanner = new TopBanner();
  const highlightManager = new HighlightManager();
  const engineManager = new EngineManager(eventBus, stateManager, chromeBridge);
  const healthChecker = new HealthChecker(eventBus, stateManager, chromeBridge, engineManager);
  
  if (!eventBus || !stateManager || !chromeBridge || !serverClient || 
      !topBanner || !highlightManager || !engineManager || !healthChecker) {
    throw new Error('One or more modules failed to instantiate');
  }
});

// Event flow test
test('EventBus can pass events between modules', () => {
  const eventBus = new EventBus();
  let received = false;
  
  eventBus.on('test:event', () => {
    received = true;
  });
  
  eventBus.emit('test:event');
  
  if (!received) throw new Error('Event not received');
});

// State management test
test('StateManager can manage state changes', () => {
  const eventBus = new EventBus();
  const stateManager = new StateManager(eventBus);

  stateManager.set('ui.dockOpen', true);
  const value = stateManager.get('ui.dockOpen');

  if (value !== true) throw new Error('State not updated correctly');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('❌ Integration check FAILED');
  process.exit(1);
} else {
  console.log('✅ Integration check PASSED');
  process.exit(0);
}
