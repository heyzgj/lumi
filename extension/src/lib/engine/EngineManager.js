/**
 * EngineManager - Manage AI engine selection and availability
 * Fixes: Engine selection being overwritten by health check
 */

export default class EngineManager {
  constructor(eventBus, stateManager, chromeBridge) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.chromeBridge = chromeBridge;
  }

  async init() {
    // Initialize availability to unknown state (will be updated by HealthChecker)
    this.stateManager.set('engine.available', { codex: false, claude: false, droid: false });

    // Load saved engine preference
    const stored = await this.chromeBridge.storageGet(['engine']);

    if (stored.engine && (stored.engine === 'codex' || stored.engine === 'claude' || stored.engine === 'droid')) {
      this.selectEngine(stored.engine, true); // silent = true, no save
      this.stateManager.set('engine.restored', true);
    } else {
      this.stateManager.set('engine.restored', true);
    }

    const currentEngine = this.stateManager.get('engine.current');
    this.eventBus.emit('engine:initialized', currentEngine);
  }

  selectEngine(engine, silent = false) {
    if (engine !== 'codex' && engine !== 'claude' && engine !== 'droid') {
      console.error('[EngineManager] Invalid engine:', engine);
      return;
    }

    this.stateManager.set('engine.current', engine);

    // Persist to storage
    if (!silent) {
      this.chromeBridge.storageSet({ engine });
    }

    this.eventBus.emit('engine:selected', engine);
  }

  updateAvailability(codex, claude, droid) {
    // Only update availability if engine has been restored from storage
    // This prevents health check from overwriting user selection during initialization
    const restored = this.stateManager.get('engine.restored');

    if (!restored) {
      return;
    }

    const previous = this.stateManager.get('engine.available') || {};
    const next = {
      codex: !!codex,
      claude: !!claude,
      droid: !!droid
    };

    if (previous.codex === next.codex && previous.claude === next.claude && previous.droid === next.droid) {
      return;
    }

    // Update as a whole object so subscribers to 'engine.available' fire
    this.stateManager.set('engine.available', next);
    this.eventBus.emit('engine:availability-updated', next);
  }

  getCurrentEngine() {
    return this.stateManager.get('engine.current');
  }

  getAvailableEngines() {
    return this.stateManager.get('engine.available');
  }

  isEngineAvailable(engine) {
    const available = this.getAvailableEngines();
    return !!available[engine];
  }
}
