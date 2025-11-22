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
      const workingDirectory = rawConfig?.workingDirectory
        || rawConfig?.config?.workingDirectory
        || null;
      const host = window.location?.host || '';
      const projectMatch = resolveProject(projects, window.location?.href);
      const projectAllowed = !!projectMatch?.project;

      try {
        const debugProject = projectMatch?.project
          ? {
              id: projectMatch.project.id,
              name: projectMatch.project.name,
              workingDirectory: projectMatch.project.workingDirectory
            }
          : null;
        // eslint-disable-next-line no-console
        console.log('[LUMI][HealthChecker] /health resolved', {
          healthy: !!result?.healthy,
          host,
          projectsCount: projects.length,
          workingDirectory,
          projectAllowed,
          project: debugProject
        });
      } catch (_) { /* ignore debug logging errors */ }

      this.stateManager.batch({
        'projects.allowed': projectAllowed,
        'projects.current': projectMatch?.project || null,
        'projects.list': projects,
        'server.workingDirectory': workingDirectory
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
        // Server healthy but no capabilities payload; keep previous availability
        const prev = this.engineManager.getAvailableEngines() || {};
        this.engineManager.updateAvailability(!!prev.codex, !!prev.claude);
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
    const host = (url.host || '').toLowerCase();
    const isFile = url.protocol === 'file:';
    const pathname = (url.pathname || '').toLowerCase();
    let best = null;
    let bestScore = -Infinity;
    for (const project of projects) {
      if (!project || project.enabled === false) continue;
      const hosts = Array.isArray(project.hosts) ? project.hosts : [];
      if (hosts.length === 0) {
        // Wildcard project: matches any URL with lowest priority
        const score = -1;
        if (score > bestScore) {
          bestScore = score;
          best = project;
        }
        continue;
      }
      for (const pattern of hosts) {
        const raw = String(pattern || '').trim().toLowerCase();
        if (!raw) continue;

        // file:// 页面支持路径前缀匹配
        if (isFile && (raw.startsWith('file:///') || raw.startsWith('/'))) {
          let prefix = raw;
          if (prefix.startsWith('file://')) {
            prefix = prefix.slice('file://'.length);
          }
          if (!pathname.startsWith(prefix)) continue;
          const score = 5000 + prefix.length;
          if (score > bestScore) {
            bestScore = score;
            best = project;
          }
          continue;
        }

        // 其它协议按 host pattern 匹配
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
