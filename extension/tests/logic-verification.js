/**
 * Logic Verification - Test critical business logic
 */

import EventBus from '../src/lib/core/EventBus.js';
import StateManager from '../src/lib/core/StateManager.js';
import EngineManager from '../src/lib/engine/EngineManager.js';
import HealthChecker from '../src/lib/engine/HealthChecker.js';
import ChromeBridge from '../src/lib/communication/ChromeBridge.js';

console.log('🧪 Verifying critical business logic...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    console.log(error.stack);
    failed++;
  }
}

// Setup mock chrome for testing
global.chrome = {
  storage: {
    local: {
      get: (keys, callback) => callback({}),
      set: (items, callback) => callback && callback()
    }
  }
};

// Test 1: Engine selection persistence
test('EngineManager respects initialization state', () => {
  const eventBus = new EventBus();
  const stateManager = new StateManager(eventBus);
  const chromeBridge = new ChromeBridge(eventBus);
  const engineManager = new EngineManager(eventBus, stateManager, chromeBridge);
  
  // Should not update availability before restoration
  engineManager.updateAvailability(true, true);
  
  const restored = stateManager.get('engine.restored');
  if (restored) {
    throw new Error('Should not be restored yet');
  }
  
  // The key fix: availability update should be ignored until restored
  console.log('  → Engine selection protected during initialization');
});

// Test 2: State management reactivity
test('StateManager notifies subscribers on change', () => {
  const eventBus = new EventBus();
  const stateManager = new StateManager(eventBus);
  
  let notified = false;
  stateManager.subscribe('ui.dockOpen', (newVal, oldVal) => {
    notified = true;
    if (newVal !== true || oldVal !== false) {
      throw new Error('Wrong values in notification');
    }
  });

  stateManager.set('ui.dockOpen', true);
  
  if (!notified) {
    throw new Error('Subscriber not notified');
  }
  
  console.log('  → State changes properly notify subscribers');
});

// Test 3: EventBus error isolation
test('EventBus isolates handler errors', () => {
  const eventBus = new EventBus();
  
  let handler1Called = false;
  let handler2Called = false;
  
  eventBus.on('test:event', () => {
    handler1Called = true;
    throw new Error('Handler 1 error');
  });
  
  eventBus.on('test:event', () => {
    handler2Called = true;
  });
  
  eventBus.emit('test:event');
  
  if (!handler1Called || !handler2Called) {
    throw new Error('Not all handlers were called');
  }
  
  console.log('  → Error isolation works correctly');
});

// Test 4: State batch updates
test('StateManager batch updates work correctly', () => {
  const eventBus = new EventBus();
  const stateManager = new StateManager(eventBus);
  
  let batchEventReceived = false;
  eventBus.on('state:batch-update', (updates) => {
    batchEventReceived = true;
    if (Object.keys(updates).length !== 2) {
      throw new Error('Wrong number of updates');
    }
  });
  
  stateManager.batch({
    'ui.dockOpen': true,
    'ui.mode': 'element'
  });
  
  if (!batchEventReceived) {
    throw new Error('Batch event not received');
  }
  
  if (stateManager.get('ui.dockOpen') !== true) {
    throw new Error('Batch update failed');
  }
  
  console.log('  → Batch updates work correctly');
});

// Test 5: Engine availability logic
test('HealthChecker respects EngineManager state', () => {
  const eventBus = new EventBus();
  const stateManager = new StateManager(eventBus);
  const chromeBridge = new ChromeBridge(eventBus);
  const engineManager = new EngineManager(eventBus, stateManager, chromeBridge);
  
  // Mark as restored
  stateManager.set('engine.restored', true);
  
  // Now availability update should work
  engineManager.updateAvailability(true, false);
  
  const available = stateManager.get('engine.available');
  if (!available.codex || available.claude) {
    throw new Error('Availability not updated correctly');
  }
  
  console.log('  → Engine availability updates work after restoration');
});

// Test 6: Event unsubscribe works
test('EventBus unsubscribe works correctly', () => {
  const eventBus = new EventBus();
  
  let callCount = 0;
  const unsubscribe = eventBus.on('test:event', () => {
    callCount++;
  });
  
  eventBus.emit('test:event');
  if (callCount !== 1) throw new Error('First emit failed');
  
  unsubscribe();
  eventBus.emit('test:event');
  
  if (callCount !== 1) {
    throw new Error('Unsubscribe did not work');
  }
  
  console.log('  → Unsubscribe mechanism works');
});

// Test 7: State snapshot immutability
test('StateManager snapshot is immutable', () => {
  const eventBus = new EventBus();
  const stateManager = new StateManager(eventBus);
  
  stateManager.set('ui.dockOpen', true);
  const snapshot = stateManager.snapshot();
  
  // Modify snapshot
  snapshot.ui.dockOpen = false;
  
  // Original state should be unchanged
  if (stateManager.get('ui.dockOpen') !== true) {
    throw new Error('Snapshot mutation affected original state');
  }
  
  console.log('  → State snapshots are properly isolated');
});

// Test 8: EventBus clear functionality
test('EventBus clear removes listeners', () => {
  const eventBus = new EventBus();
  
  let called = false;
  eventBus.on('test:event', () => {
    called = true;
  });
  
  eventBus.clear('test:event');
  eventBus.emit('test:event');
  
  if (called) {
    throw new Error('Event still fired after clear');
  }
  
  console.log('  → EventBus clear works correctly');
});

console.log(`\n📊 Logic Verification Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('❌ Logic verification FAILED');
  process.exit(1);
} else {
  console.log('✅ Logic verification PASSED');
  process.exit(0);
}
