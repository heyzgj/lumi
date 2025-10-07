/**
 * LUMI Popup (fallback UI)
 */

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const startBtn = document.getElementById('start-btn');

// Check server status
async function checkStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_SERVER' });
    const healthy = typeof response === 'boolean' ? response : !!response?.healthy;
    if (healthy) {
      statusDot.classList.remove('offline');
      statusText.textContent = 'Server connected';
    } else {
      statusDot.classList.add('offline');
      statusText.textContent = 'Server offline';
    }
  } catch (error) {
    statusDot.classList.add('offline');
    statusText.textContent = 'Server offline';
  }
}

// Start selection on current tab
startBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // Close popup
    window.close();
  } catch (error) {
    console.error('Failed to inject content script:', error);
    statusText.textContent = 'Error: ' + error.message;
    statusDot.classList.add('offline');
  }
});

// Check status on load
checkStatus();

