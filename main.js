
const { app, BrowserWindow, Menu, globalShortcut, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: "Mini Browser",
        webPreferences: {
            preload: path.join(__dirname, 'renderer.js'),
            // Enable nodeIntegration in the renderer process for safe communication
            nodeIntegration: true,
            contextIsolation: false,
            // SECURITY WARNING: Disabling this for simplicity, but always prefer contextIsolation: true in production
        }
    });

    mainWindow.loadFile('index.html');

    // Remove default menu for a cleaner look
    Menu.setApplicationMenu(null);
    
    // Register keyboard shortcuts
    registerShortcuts();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function registerShortcuts() {
    // Ctrl+T or Cmd+T for New Tab
    globalShortcut.register('CommandOrControl+T', () => {
        if (mainWindow) {
            mainWindow.webContents.send('new-tab-shortcut');
        }
    });

    // Ctrl+W or Cmd+W for Close Tab
    globalShortcut.register('CommandOrControl+W', () => {
        if (mainWindow) {
            mainWindow.webContents.send('close-tab-shortcut');
        }
    });

    // Ctrl+R or Cmd+R for Refresh Tab
    globalShortcut.register('CommandOrControl+R', () => {
        if (mainWindow) {
            mainWindow.webContents.send('refresh-tab-shortcut');
        }
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    // Unregister all shortcuts when the app is quitting
    globalShortcut.unregisterAll();
});

// IPC handler to update the window title based on the active tab's title
ipcMain.on('update-window-title', (event, title) => {
    if (mainWindow && title) {
        mainWindow.setTitle(`Mini Browser - ${title}`);
    }
});
