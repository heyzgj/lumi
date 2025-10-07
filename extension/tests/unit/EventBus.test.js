/**
 * EventBus Tests
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import EventBus from '../../src/lib/core/EventBus.js';

describe('EventBus', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('on/emit', () => {
    it('should subscribe and emit events', () => {
      const callback = jest.fn();
      eventBus.on('test:event', callback);
      
      eventBus.emit('test:event', 'arg1', 'arg2');
      
      expect(callback).toHaveBeenCalledWith('arg1', 'arg2');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should support multiple listeners for same event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      eventBus.on('test:event', callback1);
      eventBus.on('test:event', callback2);
      
      eventBus.emit('test:event', 'data');
      
      expect(callback1).toHaveBeenCalledWith('data');
      expect(callback2).toHaveBeenCalledWith('data');
    });

    it('should not error when emitting event with no listeners', () => {
      expect(() => {
        eventBus.emit('nonexistent:event', 'data');
      }).not.toThrow();
    });

    it('should isolate errors in event handlers', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Handler error');
      });
      const normalCallback = jest.fn();
      
      eventBus.on('test:event', errorCallback);
      eventBus.on('test:event', normalCallback);
      
      // Should not throw, both callbacks should be called
      expect(() => {
        eventBus.emit('test:event');
      }).not.toThrow();
      
      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('should only trigger callback once', () => {
      const callback = jest.fn();
      eventBus.once('test:event', callback);
      
      eventBus.emit('test:event');
      eventBus.emit('test:event');
      
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('off', () => {
    it('should unsubscribe specific callback', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      eventBus.on('test:event', callback1);
      eventBus.on('test:event', callback2);
      
      eventBus.off('test:event', callback1);
      eventBus.emit('test:event');
      
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should return unsubscribe function from on()', () => {
      const callback = jest.fn();
      const unsubscribe = eventBus.on('test:event', callback);
      
      unsubscribe();
      eventBus.emit('test:event');
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should clean up empty listener arrays', () => {
      const callback = jest.fn();
      eventBus.on('test:event', callback);
      eventBus.off('test:event', callback);
      
      expect(eventBus.listenerCount('test:event')).toBe(0);
      expect(eventBus.listeners.has('test:event')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all listeners for specific event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      eventBus.on('test:event1', callback1);
      eventBus.on('test:event2', callback2);
      
      eventBus.clear('test:event1');
      
      eventBus.emit('test:event1');
      eventBus.emit('test:event2');
      
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should remove all listeners when no event specified', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      eventBus.on('test:event1', callback1);
      eventBus.on('test:event2', callback2);
      
      eventBus.clear();
      
      eventBus.emit('test:event1');
      eventBus.emit('test:event2');
      
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('should return correct listener count', () => {
      expect(eventBus.listenerCount('test:event')).toBe(0);
      
      eventBus.on('test:event', jest.fn());
      expect(eventBus.listenerCount('test:event')).toBe(1);
      
      eventBus.on('test:event', jest.fn());
      expect(eventBus.listenerCount('test:event')).toBe(2);
    });
  });
});

