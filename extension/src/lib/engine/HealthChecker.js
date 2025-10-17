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
      const result = await this.chromeBridge.checkServerHealth();

      this.stateManager.set('engine.serverHealthy', result.healthy);

      // Server /health returns { status, version, uptime, config: { workingDirectory, cliCapabilities } }
      // Background forwards it as { healthy, config: <that object> }
      // Support both shapes defensively.
      const rawConfig = result?.config || null;
      const capsContainer = rawConfig?.cliCapabilities ? rawConfig : rawConfig?.config;
      const caps = capsContainer?.cliCapabilities || null;
      const projects = Array.isArray(rawConfig?.projects)
        ? rawConfig.projects
        : Array.isArray(rawConfig?.config?.projects)
          ? rawConfig.config.projects
          : [];
      const host = window.location?.host || '';
      const projectMatch = resolveProject(projects, window.location?.href);
      const projectAllowed = projects.length === 0 || !!projectMatch?.project;

      this.stateManager.batch({
        'projects.allowed': projectAllowed,
        'projects.current': projectMatch?.project || null,
        'projects.list': projects
      });

      if (!projectAllowed) {
        this.eventBus.emit('projects:blocked', {
          host,
          projects
        });
      } else {
        this.eventBus.emit('projects:allowed', {
          host,
          project: projectMatch?.project || null
        });
      }

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
      this.stateManager.batch({
        'projects.allowed': false,
        'projects.current': null
      });
    }
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hostMatches(pattern, host) {
  if (!pattern || !host) return false;
  const normalizedPattern = pattern.trim().toLowerCase();
  const normalizedHost = host.trim().toLowerCase();
  if (!normalizedPattern.includes('*')) {
    return normalizedPattern === normalizedHost;
  }
  const regex = new RegExp('^' + normalizedPattern.split('*').map(escapeRegex).join('.*') + '$');
  return regex.test(normalizedHost);
}

function resolveProject(projects, pageUrl) {
  if (!Array.isArray(projects) || projects.length === 0) {
    return { project: null };
  }

  try {
    const url = new URL(pageUrl);
    const host = url.host.toLowerCase();
    let best = null;
    let bestScore = -Infinity;
    for (const project of projects) {
      if (!project || project.enabled === false) continue;
      const hosts = Array.isArray(project.hosts) ? project.hosts : [];
      for (const pattern of hosts) {
        if (!hostMatches(pattern, host)) continue;
        const normalized = String(pattern).trim().toLowerCase();
        const wildcards = (normalized.match(/\*/g) || []).length;
        const nonWildcardLen = normalized.replace(/\*/g, '').length;
        const exact = normalized === host ? 1 : 0;
        const score = exact * 10000 + nonWildcardLen - wildcards * 10;
        if (score > bestScore) {
          bestScore = score;
          best = project;
        }
      }
    }
    return { project: best };
  } catch (error) {
    return { project: null };
  }
}
