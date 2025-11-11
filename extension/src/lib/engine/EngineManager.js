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
    console.log('[EngineManager] Initializing...');
    
    // Initialize availability to unknown state (will be updated by HealthChecker)
    this.stateManager.set('engine.available', { codex: false, claude: false });
    
    // Load saved engine preference
    const stored = await this.chromeBridge.storageGet(['engine']);
    console.log('[EngineManager] Stored engine:', stored.engine);
    
    if (stored.engine && (stored.engine === 'codex' || stored.engine === 'claude')) {
      console.log('[EngineManager] Restoring saved engine:', stored.engine);
      this.selectEngine(stored.engine, true); // silent = true, no save
      this.stateManager.set('engine.restored', true);
    } else {
      console.log('[EngineManager] No saved engine, using default: codex');
      this.stateManager.set('engine.restored', true);
    }
    
    const currentEngine = this.stateManager.get('engine.current');
    console.log('[EngineManager] Initialized with engine:', currentEngine);
    this.eventBus.emit('engine:initialized', currentEngine);
  }

  selectEngine(engine, silent = false) {
    if (engine !== 'codex' && engine !== 'claude') {
      console.error('[EngineManager] Invalid engine:', engine);
      return;
    }
    
    console.log('[EngineManager] Selecting engine:', engine, 'silent:', silent);
    this.stateManager.set('engine.current', engine);
    
    // Persist to storage
    if (!silent) {
      console.log('[EngineManager] Saving engine to storage:', engine);
      this.chromeBridge.storageSet({ engine });
    }
    
    this.eventBus.emit('engine:selected', engine);
  }

  updateAvailability(codex, claude) {
    // Only update availability if engine has been restored from storage
    // This prevents health check from overwriting user selection during initialization
    const restored = this.stateManager.get('engine.restored');

    console.log('[EngineManager] updateAvailability called:', { codex, claude, restored });

    if (!restored) {
      console.log('[EngineManager] Still initializing, skipping availability update');
      return;
    }

    const previous = this.stateManager.get('engine.available') || {};
    const next = {
      codex: !!codex,
      claude: !!claude
    };

    if (previous.codex === next.codex && previous.claude === next.claude) {
      console.log('[EngineManager] Availability unchanged, skipping state update');
      return;
    }

    // Update as a whole object so subscribers to 'engine.available' fire
    this.stateManager.set('engine.available', next);

    console.log('[EngineManager] Engine availability updated:', next);
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
