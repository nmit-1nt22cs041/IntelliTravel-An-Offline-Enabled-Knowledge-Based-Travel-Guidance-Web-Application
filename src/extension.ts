import * as vscode from 'vscode';
import { ApiMapPanel } from './ui/panels/ApiMapPanel'; // Corrected the import path to a relative one
import { DatabaseManager } from './storage/database';
import { ContentManager } from './guide/contentManager';
import { MapApiManager } from './map/mapApiManager';

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Offline Map & Travel Guide extension is now active!');

    // Initialize core components
    const databaseManager = new DatabaseManager(context);
    const contentManager = new ContentManager(context, databaseManager);
    const apiManager = new MapApiManager(context);

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(globe) Map Online';
    statusBarItem.tooltip = 'Click to toggle offline mode';
    statusBarItem.command = 'offlineMap.toggleOffline';
    statusBarItem.show();

    // Register commands
    const showMapCommand = vscode.commands.registerCommand('offlineMap.showMap', () => {
        ApiMapPanel.createOrShow(context, databaseManager, contentManager, apiManager);
    });

    const searchLocationCommand = vscode.commands.registerCommand('offlineMap.searchLocation', async () => {
        const query = await vscode.window.showInputBox({ 
            prompt: 'Enter location to search',
            placeHolder: 'e.g., Vidhana Soudha, Bangalore'
        });
        if (query) {
            ApiMapPanel.searchLocation(query, context, databaseManager, apiManager);
        }
    });

    const toggleOfflineCommand = vscode.commands.registerCommand('offlineMap.toggleOffline', () => {
        const config = vscode.workspace.getConfiguration('offlineMap');
        const currentMode = config.get('offlineMode', false);
        config.update('offlineMode', !currentMode, true);
        updateStatusBar(!currentMode);
        vscode.window.showInformationMessage(`Offline mode ${!currentMode ? 'enabled' : 'disabled'}`);
    });

    const clearCacheCommand = vscode.commands.registerCommand('offlineMap.clearCache', () => {
        apiManager.clearCache();
        vscode.window.showInformationMessage('Map cache cleared');
    });

    context.subscriptions.push(
        showMapCommand,
        searchLocationCommand,
        toggleOfflineCommand,
        clearCacheCommand,
        statusBarItem
    );

    // Initialize components
    databaseManager.initialize().then(() => {
        contentManager.initialize();
    });

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('offlineMap')) {
                const config = vscode.workspace.getConfiguration('offlineMap');
                updateStatusBar(config.get('offlineMode', false));
            }
        })
    );

    // Initial status bar update
    const config = vscode.workspace.getConfiguration('offlineMap');
    updateStatusBar(config.get('offlineMode', false));
}

function updateStatusBar(isOffline: boolean) {
    statusBarItem.text = isOffline ? '$(cloud-off) Map Offline' : '$(globe) Map Online';
    statusBarItem.backgroundColor = isOffline ? 
        new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
}

export function deactivate() {}