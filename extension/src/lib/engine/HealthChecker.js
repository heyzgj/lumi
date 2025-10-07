/**
 * HealthChecker - Periodic server health checks
 * Detects CLI availability and updates engine status
 */

export default class HealthChecker {
  constructor(eventBus, stateManager, chromeBridge, engineManager) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.chromeBridge = chromeBridge;
    this.engineManager = engineManager;
    this.intervalId = null;
    this.isRunning = false;
  }

  start(interval = 10000) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Initial check
    this.checkOnce();
    
    // Periodic checks
    this.intervalId = setInterval(() => {
      this.checkOnce();
    }, interval);
    
    this.eventBus.emit('health-checker:started');
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.eventBus.emit('health-checker:stopped');
  }

  async checkOnce() {
    try {
      // Only ping server from allowed project origins to reduce noise
      const host = window.location && window.location.host;
      const allowed = host && (host.includes('localhost') || host.includes('127.0.0.1'));
      if (!allowed) {
        this.stateManager.set('engine.serverHealthy', false);
        this.engineManager.updateAvailability(false, false);
        this.eventBus.emit('health-check:skipped', { reason: 'outside-allowed-origin', host });
        return;
      }

      const result = await this.chromeBridge.checkServerHealth();

      this.stateManager.set('engine.serverHealthy', result.healthy);

      // Server /health returns { status, version, uptime, config: { workingDirectory, cliCapabilities } }
      // Background forwards it as { healthy, config: <that object> }
      // Support both shapes defensively.
      const rawConfig = result?.config || null;
      const capsContainer = rawConfig?.cliCapabilities ? rawConfig : rawConfig?.config;
      const caps = capsContainer?.cliCapabilities || null;

      if (result.healthy && caps) {
        const codexAvailable = !!(caps.codex && caps.codex.available);
        const claudeAvailable = !!(caps.claude && caps.claude.available);

        // Update engine availability through EngineManager (respects init state)
        this.engineManager.updateAvailability(codexAvailable, claudeAvailable);
      } else if (result.healthy) {
        // Server healthy but no specific capabilities, assume codex available
        this.engineManager.updateAvailability(true, false);
      } else {
        // Server not healthy
        this.engineManager.updateAvailability(false, false);
      }

      this.eventBus.emit('health-check:completed', {
        healthy: result.healthy,
        config: result.config
      });
    } catch (error) {
      console.error('[HealthChecker] Check failed:', error);
      this.stateManager.set('engine.serverHealthy', false);
      this.engineManager.updateAvailability(false, false);
      
      this.eventBus.emit('health-check:error', error);
    }
  }
}
