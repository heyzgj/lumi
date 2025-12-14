/**
 * LUMI Options Page
 * Handles settings for server, projects, and AI providers.
 */

const STORAGE_KEY = 'lumiSettings';

// Default settings structure
const DEFAULT_SETTINGS = {
  serverUrl: 'http://127.0.0.1:3456',
  codex: {
    model: 'o4-mini',
    sandbox: 'workspace-write',
    extraArgs: ''
  },
  claude: {
    model: 'claude-sonnet-4-5',
    permissionMode: 'acceptEdits',
    extraArgs: ''
  },
  droid: {
    model: 'claude-opus-4-5-20251101',
    autoLevel: 'medium',
    extraArgs: ''
  },
  projects: []
};

// Fallback model lists (when server unavailable)
// Source: CLI --help and official documentation
const FALLBACK_MODELS = {
  codex: ['o4-mini', 'o3', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini', 'gpt-5-codex'],
  claude: ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101', 'claude-haiku-4-5-20251001', 'sonnet', 'opus', 'haiku'],
  droid: ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'gpt-5.1-codex', 'gemini-3-pro']
};

// State
let currentProjects = [];
let providerStatus = { codex: false, claude: false, droid: false };
let activeProvider = 'codex';
let toastTimeout = null;

// DOM helpers
const $ = (id) => document.getElementById(id);

// Toast notifications
function showToast(message, type = 'info') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `visible ${type}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 3000);
}

// Status banner
function setStatus(message, type = 'info') {
  const banner = $('statusBanner');
  const msg = $('statusMessage');
  if (!message) {
    banner.hidden = true;
    return;
  }
  msg.textContent = message;
  banner.className = `status-banner ${type}`;
  banner.hidden = false;
}

// Generate unique project ID
function generateProjectId() {
  return 'proj_' + Math.random().toString(36).slice(2, 10);
}

// Normalize host pattern from URL input
function normalizeHostPattern(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();

  // Handle file:// URLs
  if (trimmed.startsWith('file://')) {
    try {
      const url = new URL(trimmed);
      return url.pathname.split('/').slice(0, -1).join('/') + '/';
    } catch {
      return trimmed.replace('file://', '');
    }
  }

  // Handle http(s):// URLs
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.host;
    } catch {
      return trimmed;
    }
  }

  // Already a host pattern
  return trimmed;
}

// ==================== Provider Tab Logic ====================

function initProviderSelector() {
  const dropdown = $('providerSelect');
  if (dropdown) {
    dropdown.addEventListener('change', () => {
      selectProvider(dropdown.value);
    });
  }
}

function selectProvider(providerId) {
  activeProvider = providerId;

  // Sync dropdown value
  const dropdown = $('providerSelect');
  if (dropdown && dropdown.value !== providerId) {
    dropdown.value = providerId;
  }

  // Update panel visibility - hide all, show only active if available
  document.querySelectorAll('.provider-panel').forEach(panel => {
    const isActive = panel.dataset.provider === providerId;
    const isAvailable = providerStatus[panel.dataset.provider];
    panel.classList.toggle('active', isActive && isAvailable);
  });

  // Update status indicator
  const statusIndicator = $('selectedProviderStatus');
  const isAvailable = providerStatus[providerId];
  if (statusIndicator) {
    statusIndicator.className = 'status-indicator ' + (isAvailable ? 'available' : 'unavailable');
    statusIndicator.textContent = isAvailable ? 'Installed' : 'Not Installed';
  }

  // Show unavailable message if selected provider not installed
  $('providerUnavailable').hidden = isAvailable;
}

function updateProviderStatus(status) {
  providerStatus = status;

  // Update dropdown options with status
  const dropdown = $('providerSelect');
  if (dropdown) {
    Array.from(dropdown.options).forEach(opt => {
      const available = status[opt.value];
      opt.textContent = available ? opt.value.charAt(0).toUpperCase() + opt.value.slice(1)
        : `${opt.value.charAt(0).toUpperCase() + opt.value.slice(1)} (not installed)`;
    });
  }

  // Update status indicator for current selection
  selectProvider(activeProvider);

  // If current provider unavailable, switch to first available
  if (!status[activeProvider]) {
    const firstAvailable = Object.keys(status).find(k => status[k]);
    if (firstAvailable) {
      selectProvider(firstAvailable);
    }
  }
}

function populateModelDropdown(providerId, models) {
  const select = $(`${providerId}Model`);
  if (!select) return;

  select.innerHTML = '';
  models.forEach(model => {
    const opt = document.createElement('option');
    opt.value = model;
    opt.textContent = model;
    select.appendChild(opt);
  });
}

// ==================== Projects ====================

function renderProjects(projects = currentProjects) {
  const list = $('projectsList');
  const empty = $('projectsEmpty');

  list.innerHTML = '';

  if (!projects.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  projects.forEach(project => {
    list.appendChild(createProjectRow(project));
  });
}

function createProjectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.id = project.id;

  const displayName = project.name || project.directory?.split('/').pop() || 'Unnamed';

  row.innerHTML = `
    <div class="project-row-header">
      <h3>${escapeHtml(displayName)}</h3>
      <button class="btn-danger remove-project">Remove</button>
    </div>
    <div class="project-row-body">
      <div class="field">
        <label>Display Name</label>
        <input type="text" class="project-name" value="${escapeHtml(project.name || '')}">
      </div>
      <div class="field">
        <label>Working Directory</label>
        <input type="text" class="project-directory" value="${escapeHtml(project.directory || '')}">
      </div>
      <div class="field">
        <label>Host Patterns</label>
        <input type="text" class="project-hosts" value="${escapeHtml((project.hosts || []).join(', '))}">
      </div>
    </div>
  `;

  // Remove handler
  row.querySelector('.remove-project').addEventListener('click', () => {
    currentProjects = currentProjects.filter(p => p.id !== project.id);
    renderProjects();
  });

  // Update on input
  row.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => syncProjectsFromUI());
  });

  return row;
}

function syncProjectsFromUI() {
  const rows = document.querySelectorAll('.project-row');
  currentProjects = Array.from(rows).map(row => {
    const id = row.dataset.id;
    const name = row.querySelector('.project-name').value.trim();
    const directory = row.querySelector('.project-directory').value.trim();
    const hostsRaw = row.querySelector('.project-hosts').value;
    const hosts = hostsRaw.split(/[,\s]+/).map(h => h.trim()).filter(Boolean);

    return { id, name: name || directory.split('/').pop(), directory, hosts };
  });
}

function openProjectModal() {
  $('projectModalDirectory').value = '';
  $('projectModalHosts').value = '';
  $('projectModal').classList.add('visible');
  $('projectModal').hidden = false;
}

function closeProjectModal() {
  $('projectModal').classList.remove('visible');
  $('projectModal').hidden = true;
}

function addProjectFromModal() {
  const directory = $('projectModalDirectory').value.trim();
  const hostInput = $('projectModalHosts').value.trim();

  if (!directory) {
    showToast('Please enter a working directory', 'error');
    return;
  }

  const host = normalizeHostPattern(hostInput);
  const name = directory.split('/').filter(Boolean).pop() || 'Project';

  const newProject = {
    id: generateProjectId(),
    name,
    directory,
    hosts: host ? [host] : []
  };

  currentProjects.push(newProject);
  renderProjects();
  closeProjectModal();
  showToast('Project added');
}

// ==================== Settings Load/Save ====================

async function loadSettings() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY]);
    const stored = data[STORAGE_KEY] || {};
    return mergeSettings(stored);
  } catch (err) {
    console.error('[Options] Load settings failed:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

function mergeSettings(input) {
  const merged = { ...DEFAULT_SETTINGS };

  if (input.serverUrl) merged.serverUrl = input.serverUrl;
  if (Array.isArray(input.projects)) merged.projects = input.projects;

  ['codex', 'claude', 'droid'].forEach(p => {
    if (input[p]) {
      merged[p] = { ...DEFAULT_SETTINGS[p], ...input[p] };
    }
  });

  return merged;
}

function applySettings(settings) {
  // Server
  $('serverUrl').value = settings.serverUrl || DEFAULT_SETTINGS.serverUrl;

  // Projects - handle both 'directory' (local) and 'workingDirectory' (server/legacy) field names
  currentProjects = (settings.projects || []).map(p => ({
    id: p.id || generateProjectId(),
    name: p.name || '',
    directory: p.directory || p.workingDirectory || '', // Support both field names
    hosts: Array.isArray(p.hosts) ? p.hosts : []
  }));
  renderProjects();

  // Providers
  ['codex', 'claude', 'droid'].forEach(p => {
    const config = settings[p] || DEFAULT_SETTINGS[p];
    const modelSelect = $(`${p}Model`);
    const permSelect = $(`${p}Permission`);
    const extraInput = $(`${p}ExtraArgs`);

    if (modelSelect && config.model) {
      // Ensure model is in options
      if (!Array.from(modelSelect.options).some(o => o.value === config.model)) {
        const opt = document.createElement('option');
        opt.value = config.model;
        opt.textContent = config.model;
        modelSelect.appendChild(opt);
      }
      modelSelect.value = config.model;
    }

    // Use provider-specific permission field
    if (permSelect) {
      const permValue = p === 'codex' ? config.sandbox :
        p === 'claude' ? config.permissionMode :
          config.autoLevel;
      permSelect.value = permValue || permSelect.options[1].value; // default to second option
    }
    if (extraInput) extraInput.value = config.extraArgs || '';
  });
}

function collectSettings() {
  syncProjectsFromUI();

  const settings = {
    serverUrl: $('serverUrl').value.trim() || DEFAULT_SETTINGS.serverUrl,
    projects: currentProjects,
    codex: {
      model: $('codexModel').value,
      sandbox: $('codexPermission').value,
      extraArgs: $('codexExtraArgs').value.trim()
    },
    claude: {
      model: $('claudeModel').value,
      permissionMode: $('claudePermission').value,
      extraArgs: $('claudeExtraArgs').value.trim()
    },
    droid: {
      model: $('droidModel').value,
      autoLevel: $('droidPermission').value,
      extraArgs: $('droidExtraArgs').value.trim()
    }
  };

  return settings;
}

async function saveSettings() {
  try {
    const settings = collectSettings();
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });

    // Sync to server
    await syncSettingsToServer(settings);

    showToast('Settings saved', 'success');
  } catch (err) {
    console.error('[Options] Save failed:', err);
    showToast('Failed to save: ' + err.message, 'error');
  }
}

async function syncSettingsToServer(settings) {
  const serverUrl = settings.serverUrl || DEFAULT_SETTINGS.serverUrl;

  // Settings now store CLI-native values directly
  const payload = {
    codex: {
      model: settings.codex.model,
      sandbox: settings.codex.sandbox,
      extraArgs: settings.codex.extraArgs
    },
    claude: {
      model: settings.claude.model,
      permissionMode: settings.claude.permissionMode,
      extraArgs: settings.claude.extraArgs
    },
    droid: {
      model: settings.droid.model,
      autoLevel: settings.droid.autoLevel,
      extraArgs: settings.droid.extraArgs
    },
    projects: settings.projects.map(p => ({
      id: p.id,
      name: p.name,
      workingDirectory: p.directory, // Map to expected field name
      hosts: p.hosts
    }))
  };

  try {
    const resp = await fetch(`${serverUrl}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      console.warn('[Options] Server sync returned:', resp.status);
    }
  } catch (err) {
    console.warn('[Options] Server sync failed:', err);
  }
}

function resetAllSettings() {
  if (!confirm('Reset all settings to defaults?')) return;

  applySettings(DEFAULT_SETTINGS);
  showToast('Settings reset to defaults');
}

// ==================== Server Connection ====================

async function testConnection() {
  const serverUrl = $('serverUrl').value.trim() || DEFAULT_SETTINGS.serverUrl;
  setStatus('Testing connection...', 'info');

  try {
    const resp = await fetch(`${serverUrl}/capabilities`, { timeout: 5000 });
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);

    const data = await resp.json();
    const caps = data.cliCapabilities || {};

    // Update provider status
    const status = {
      codex: !!caps.codex?.available,
      claude: !!caps.claude?.available,
      droid: !!caps.droid?.available
    };
    updateProviderStatus(status);

    // Populate model dropdowns from server or use fallback
    ['codex', 'claude', 'droid'].forEach(p => {
      const models = caps[p]?.models || FALLBACK_MODELS[p];
      populateModelDropdown(p, models);
    });

    setStatus('Connected to LUMI server. All settings synced.', 'success');
    setTimeout(() => setStatus(''), 3000);

  } catch (err) {
    setStatus(`Connection failed: ${err.message}`, 'error');

    // Use fallback models
    ['codex', 'claude', 'droid'].forEach(p => {
      populateModelDropdown(p, FALLBACK_MODELS[p]);
    });
    updateProviderStatus({ codex: true, claude: true, droid: true });
  }
}

async function fetchProviders() {
  const serverUrl = $('serverUrl').value.trim() || DEFAULT_SETTINGS.serverUrl;

  try {
    const resp = await fetch(`${serverUrl}/capabilities`);
    const data = await resp.json();
    const caps = data.cliCapabilities || {};

    const status = {
      codex: !!caps.codex?.available,
      claude: !!caps.claude?.available,
      droid: !!caps.droid?.available
    };
    updateProviderStatus(status);

    ['codex', 'claude', 'droid'].forEach(p => {
      const models = caps[p]?.models || FALLBACK_MODELS[p];
      populateModelDropdown(p, models);
    });

  } catch (err) {
    // Fallback: assume all available with default models
    ['codex', 'claude', 'droid'].forEach(p => {
      populateModelDropdown(p, FALLBACK_MODELS[p]);
    });
    updateProviderStatus({ codex: true, claude: true, droid: true });
  }
}

// ==================== Utilities ====================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==================== Init ====================

async function init() {
  // Provider tabs
  initProviderSelector();

  // Populate fallback models first
  ['codex', 'claude', 'droid'].forEach(p => {
    populateModelDropdown(p, FALLBACK_MODELS[p]);
  });

  // Load saved settings
  const settings = await loadSettings();
  applySettings(settings);

  // Fetch provider status from server
  await fetchProviders();

  // Event listeners
  $('testConnection').addEventListener('click', testConnection);
  $('addProject').addEventListener('click', openProjectModal);
  $('projectModalCancel').addEventListener('click', closeProjectModal);
  $('projectModalAdd').addEventListener('click', addProjectFromModal);
  $('saveAll').addEventListener('click', saveSettings);
  $('resetAll').addEventListener('click', resetAllSettings);

  // Modal backdrop click
  $('projectModal').querySelector('.modal-backdrop').addEventListener('click', closeProjectModal);

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProjectModal();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('[Options] Init failed:', err);
    setStatus('Initialization failed: ' + err.message, 'error');
  });
});
