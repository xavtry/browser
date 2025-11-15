const { ipcRenderer } = require('electron');

const DEFAULT_URL = 'https://www.google.com';
const webviewContainer = document.getElementById('webview-container');
const tabStrip = document.getElementById('tab-strip');
const urlInput = document.getElementById('url-input');
const backButton = document.getElementById('back-button');
const forwardButton = document.getElementById('forward-button');
const refreshButton = document.getElementById('refresh-button');
const newTabButton = document.getElementById('new-tab-button');

let activeWebview = null;
let tabCounter = 0;

// --- Helper Functions ---

/**
 * Normalizes a user-provided URL string to ensure it has a protocol.
 * @param {string} url The user input.
 * @returns {string} A standardized URL.
 */
function normalizeUrl(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        // Simple heuristic: if it contains a dot, assume it's a domain and prepend https
        if (url.includes('.')) {
            return `https://${url}`;
        }
        // Otherwise, treat as a search query
        return `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    }
    return url;
}

/**
 * Updates the navigation buttons (back/forward/refresh) based on the current webview state.
 */
function updateNavigationState() {
    if (activeWebview) {
        backButton.disabled = !activeWebview.canGoBack();
        forwardButton.disabled = !activeWebview.canGoForward();
        // Refresh is always enabled unless the webview is currently loading
        refreshButton.disabled = activeWebview.isLoading();
    } else {
        // Disable all if no active tab
        backButton.disabled = true;
        forwardButton.disabled = true;
        refreshButton.disabled = true;
    }
}

/**
 * Sets the active tab and webview, hiding all others.
 * @param {string} tabId The ID of the tab to activate.
 */
function setActiveTab(tabId) {
    const newActiveWebview = document.getElementById(tabId);
    if (!newActiveWebview || newActiveWebview === activeWebview) return;

    // Deactivate previous
    if (activeWebview) {
        activeWebview.classList.remove('active');
        document.querySelector(`.tab[data-id="${activeWebview.id}"]`).classList.remove('active');
    }

    // Activate new
    activeWebview = newActiveWebview;
    activeWebview.classList.add('active');
    document.querySelector(`.tab[data-id="${tabId}"]`).classList.add('active');

    // Update UI elements
    urlInput.value = activeWebview.src;
    activeWebview.focus();
    
    // Update navigation and title
    updateNavigationState();
    ipcRenderer.send('update-window-title', activeWebview.getTitle() || 'Loading...');
}

// --- Tab & Webview Creation ---

/**
 * Creates a new webview component and associated tab element.
 * @param {string} url The initial URL to load.
 */
function createNewTab(url = DEFAULT_URL) {
    tabCounter++;
    const tabId = `tab-${tabCounter}`;

    // 1. Create Webview (the browser window content)
    const webview = document.createElement('webview');
    webview.id = tabId;
    webview.classList.add('browser-webview');
    webview.src = normalizeUrl(url);
    webview.setAttribute('webpreferences', 'allowRunningInsecureContent, javascript=yes');
    webviewContainer.appendChild(webview);

    // 2. Create Tab Element (in the strip)
    const tabElement = document.createElement('div');
    tabElement.classList.add('tab');
    tabElement.setAttribute('data-id', tabId);
    tabElement.innerHTML = `
        <span class="tab-title">New Tab</span>
        <button class="close-tab-btn"><i class="fas fa-times"></i></button>
    `;
    tabStrip.appendChild(tabElement);

    // --- Webview Event Listeners ---
    webview.addEventListener('dom-ready', () => {
        // On first load, update the navigation state
        updateNavigationState();
        // This is a good place to listen for other native events if needed
    });

    webview.addEventListener('did-navigate', (event) => {
        if (activeWebview && activeWebview.id === tabId) {
            urlInput.value = event.url;
            updateNavigationState();
        }
    });

    webview.addEventListener('did-navigate-in-page', (event) => {
        if (activeWebview && activeWebview.id === tabId) {
            urlInput.value = event.url;
            updateNavigationState();
        }
    });

    webview.addEventListener('did-fail-load', (event) => {
        if (event.errorCode !== -3) { // ignore error -3 (cancelled)
            console.error(`Load failed for ${event.validatedURL}: ${event.errorDescription}`);
            // Optional: load a local error page instead
        }
    });
    
    webview.addEventListener('page-title-updated', (event) => {
        const title = event.title;
        tabElement.querySelector('.tab-title').textContent = title;
        if (activeWebview.id === tabId) {
            ipcRenderer.send('update-window-title', title);
        }
    });

    webview.addEventListener('did-stop-loading', () => {
        updateNavigationState();
    });

    webview.addEventListener('did-start-loading', () => {
        updateNavigationState();
    });

    // --- Tab Element Event Listeners ---
    tabElement.addEventListener('click', (e) => {
        if (e.target.closest('.close-tab-btn')) {
            // Clicking the close button
            closeTab(tabId);
        } else {
            // Clicking the tab body
            setActiveTab(tabId);
        }
    });

    // Automatically switch to the newly created tab
    setActiveTab(tabId);
}

/**
 * Closes a tab and removes its webview.
 * @param {string} tabId The ID of the tab to close.
 */
function closeTab(tabId) {
    const tabElement = document.querySelector(`.tab[data-id="${tabId}"]`);
    const webview = document.getElementById(tabId);
    
    if (!tabElement || !webview) return;
    
    // Find the next active tab candidate
    const tabs = Array.from(tabStrip.querySelectorAll('.tab'));
    const currentIndex = tabs.findIndex(t => t.getAttribute('data-id') === tabId);
    
    const wasActive = webview === activeWebview;

    // Remove elements
    webview.remove();
    tabElement.remove();

    if (wasActive) {
        // Activate the neighbor tab, preferring the one on the right, then the left
        let nextIndex = currentIndex < tabs.length - 1 ? currentIndex : currentIndex - 1;
        
        if (tabs.length === 1) {
            // If this was the last tab, reset to null
            activeWebview = null;
            // Clear URL bar and disable nav buttons
            urlInput.value = '';
            updateNavigationState();
        } else if (nextIndex >= 0) {
            // Activate the neighbor
            const nextTabId = tabs[nextIndex].getAttribute('data-id');
            // Check if the tab still exists (it shouldn't if it's the one we just removed)
            const newActiveTabElement = document.querySelector(`.tab[data-id="${nextTabId}"]`);
            if (newActiveTabElement) {
                // Find the new active tab: if we removed the last one, activate the one before it (currentIndex - 1)
                const candidateTabId = (currentIndex === tabs.length - 1 && tabs.length > 1) ? tabs[currentIndex - 1].getAttribute('data-id') : tabs[nextIndex].getAttribute('data-id');
                setActiveTab(candidateTabId);
            }
        }
    }

    if (tabStrip.children.length === 0) {
        // If all tabs are closed, create a new one to prevent an empty browser window
        createNewTab(DEFAULT_URL);
    }
}

// --- Main Event Handlers (Navigation Bar) ---

/**
 * Loads a new URL in the active webview.
 */
function handleGo() {
    if (!activeWebview) return;
    const url = normalizeUrl(urlInput.value);
    activeWebview.loadURL(url);
    // Focus the webview after navigation
    activeWebview.focus();
}

backButton.addEventListener('click', () => {
    if (activeWebview && activeWebview.canGoBack()) activeWebview.goBack();
});

forwardButton.addEventListener('click', () => {
    if (activeWebview && activeWebview.canGoForward()) activeWebview.goForward();
});

refreshButton.addEventListener('click', () => {
    if (activeWebview) activeWebview.reload();
});

newTabButton.addEventListener('click', () => {
    createNewTab();
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleGo();
    }
});

// --- IPC Communication (Keyboard Shortcuts) ---

ipcRenderer.on('new-tab-shortcut', () => createNewTab());

ipcRenderer.on('close-tab-shortcut', () => {
    if (activeWebview) closeTab(activeWebview.id);
});

ipcRenderer.on('refresh-tab-shortcut', () => {
    if (activeWebview) activeWebview.reload();
});

// --- Initialization ---

window.onload = () => {
    // Start with one default tab
    createNewTab(DEFAULT_URL);
};
