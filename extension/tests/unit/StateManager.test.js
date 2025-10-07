/**
 * StateManager Tests
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import StateManager from '../../src/lib/core/StateManager.js';
import EventBus from '../../src/lib/core/EventBus.js';

describe('StateManager', () => {
  let stateManager;
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    stateManager = new StateManager(eventBus);
  });

  describe('get', () => {
    it('should get entire state when no path provided', () => {
      const state = stateManager.get();
      expect(state).toHaveProperty('ui');
      expect(state).toHaveProperty('selection');
      expect(state).toHaveProperty('engine');
      expect(state).toHaveProperty('processing');
    });

    it('should get nested value by path', () => {
      expect(stateManager.get('ui.bubbleVisible')).toBe(false);
      expect(stateManager.get('engine.current')).toBe('codex');
    });

    it('should return undefined for non-existent path', () => {
      expect(stateManager.get('nonexistent.path')).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should update state at path', () => {
      stateManager.set('ui.bubbleVisible', true);
      expect(stateManager.get('ui.bubbleVisible')).toBe(true);
    });

    it('should notify subscribers on change', () => {
      const callback = jest.fn();
      stateManager.subscribe('ui.bubbleVisible', callback);
      
      stateManager.set('ui.bubbleVisible', true);
      
      expect(callback).toHaveBeenCalledWith(true, false);
    });

    it('should emit global state change event', () => {
      const callback = jest.fn();
      eventBus.on('state:change', callback);
      
      stateManager.set('ui.bubbleVisible', true);
      
      expect(callback).toHaveBeenCalledWith({
        path: 'ui.bubbleVisible',
        newValue: true,
        oldValue: false
      });
    });

    it('should emit specific state change event', () => {
      const callback = jest.fn();
      eventBus.on('state:ui.bubbleVisible', callback);
      
      stateManager.set('ui.bubbleVisible', true);
      
      expect(callback).toHaveBeenCalledWith(true, false);
    });

    it('should not notify if value unchanged', () => {
      const callback = jest.fn();
      stateManager.subscribe('ui.bubbleVisible', callback);
      
      stateManager.set('ui.bubbleVisible', false); // Same as initial
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should support silent updates', () => {
      const callback = jest.fn();
      stateManager.subscribe('ui.bubbleVisible', callback);
      
      stateManager.set('ui.bubbleVisible', true, true); // Silent
      
      expect(stateManager.get('ui.bubbleVisible')).toBe(true);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('batch', () => {
    it('should update multiple paths at once', () => {
      stateManager.batch({
        'ui.bubbleVisible': true,
        'ui.mode': 'element',
        'engine.current': 'claude'
      });
      
      expect(stateManager.get('ui.bubbleVisible')).toBe(true);
      expect(stateManager.get('ui.mode')).toBe('element');
      expect(stateManager.get('engine.current')).toBe('claude');
    });

    it('should emit single batch-update event', () => {
      const callback = jest.fn();
      eventBus.on('state:batch-update', callback);
      
      const updates = {
        'ui.bubbleVisible': true,
        'ui.mode': 'element'
      };
      
      stateManager.batch(updates);
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(updates);
    });
  });

  describe('subscribe', () => {
    it('should subscribe to path changes', () => {
      const callback = jest.fn();
      stateManager.subscribe('ui.mode', callback);
      
      stateManager.set('ui.mode', 'element');
      
      expect(callback).toHaveBeenCalledWith('element', 'idle');
    });

    it('should return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = stateManager.subscribe('ui.mode', callback);
      
      unsubscribe();
      stateManager.set('ui.mode', 'element');
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      stateManager.subscribe('ui.mode', callback1);
      stateManager.subscribe('ui.mode', callback2);
      
      stateManager.set('ui.mode', 'element');
      
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('snapshot', () => {
    it('should return deep clone of state', () => {
      const snapshot = stateManager.snapshot();
      
      // Modify snapshot
      snapshot.ui.bubbleVisible = true;
      
      // Original state should be unchanged
      expect(stateManager.get('ui.bubbleVisible')).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset state to initial values', () => {
      stateManager.set('ui.bubbleVisible', true);
      stateManager.set('engine.current', 'claude');
      
      stateManager.reset();
      
      expect(stateManager.get('ui.bubbleVisible')).toBe(false);
      expect(stateManager.get('engine.current')).toBe('codex');
    });

    it('should emit reset event', () => {
      const callback = jest.fn();
      eventBus.on('state:reset', callback);
      
      stateManager.reset();
      
      expect(callback).toHaveBeenCalled();
    });
  });
});

