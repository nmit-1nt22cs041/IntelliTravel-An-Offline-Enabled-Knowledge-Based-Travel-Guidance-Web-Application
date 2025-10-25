import * as vscode from 'vscode';
import { ApiMapPanel } from './ui/panels/ApiMapPanel';
import { DatabaseManager } from './storage/database';
import { ContentManager } from './guide/contentManager';
import { MapApiManager } from './map/mapApiManager';

let statusBarItem: vscode.StatusBarItem;
let apiManager: MapApiManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('India Travel Guide extension is now active!');

    // Initialize core components with India focus
    const databaseManager = new DatabaseManager(context);
    const contentManager = new ContentManager(context, databaseManager);
    apiManager = new MapApiManager(context);

    // Create optimized status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(globe) India Map';
    statusBarItem.tooltip = 'India Travel Guide - Click to open map';
    statusBarItem.command = 'offlineMap.showMap';
    statusBarItem.show();

    // Register commands with India focus
    const showMapCommand = vscode.commands.registerCommand('offlineMap.showMap', () => {
        ApiMapPanel.createOrShow(context, databaseManager, contentManager, apiManager);
    });

    const searchLocationCommand = vscode.commands.registerCommand('offlineMap.searchLocation', async () => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = 'Search Indian locations...';
        quickPick.items = [
            { label: 'Delhi', description: 'Capital of India' },
            { label: 'Mumbai', description: 'Financial capital' },
            { label: 'Bangalore', description: 'Silicon Valley of India' },
            { label: 'Chennai', description: 'Capital of Tamil Nadu' },
            { label: 'Kolkata', description: 'Cultural capital' },
            { label: 'Hyderabad', description: 'City of Pearls' },
            { label: 'Pune', description: 'Oxford of the East' },
            { label: 'Jaipur', description: 'Pink City' }
        ];

        quickPick.onDidChangeValue(value => {
            if (value.length > 2) {
                // Show custom search option
                quickPick.items = [
                    ...quickPick.items,
                    { label: `Search: "${value}"`, description: 'Search all locations', alwaysShow: true }
                ];
            }
        });

        quickPick.onDidAccept(async () => {
            const selection = quickPick.selectedItems[0];
            if (selection) {
                let query: string;
                if (selection.label.startsWith('Search:')) {
                    query = quickPick.value;
                } else {
                    query = selection.label;
                }

                if (query) {
                    // Use apiManager directly instead of ApiMapPanel.searchLocation
                    const results = await apiManager.searchLocation(query);
                    
                    if (results.length > 0) {
                        // If map panel is already open, send the location to it
                        ApiMapPanel.sendMessageToWebview({
                            command: 'searchResults',
                            results: results
                        });
                        
                        if (!ApiMapPanel.currentPanel) {
                            // If no panel is open, create one
                            ApiMapPanel.createOrShow(context, databaseManager, contentManager, apiManager);
                            // Wait for panel to initialize then send results again
                            setTimeout(() => {
                                ApiMapPanel.sendMessageToWebview({
                                    command: 'searchResults',
                                    results: results
                                });
                            }, 1000);
                        }
                    } else {
                        vscode.window.showWarningMessage('No locations found for: ' + query);
                    }
                }
            }
            quickPick.hide();
        });

        quickPick.show();
    });

    const quickIndianCitiesCommand = vscode.commands.registerCommand('offlineMap.quickIndianCities', async () => {
        const cities = [
            { label: 'Delhi', description: '28.6139° N, 77.2090° E' },
            { label: 'Mumbai', description: '19.0760° N, 72.8777° E' },
            { label: 'Bangalore', description: '12.9716° N, 77.5946° E' },
            { label: 'Chennai', description: '13.0827° N, 80.2707° E' },
            { label: 'Kolkata', description: '22.5726° N, 88.3639° E' },
            { label: 'Hyderabad', description: '17.3850° N, 78.4867° E' },
            { label: 'Pune', description: '18.5204° N, 73.8567° E' },
            { label: 'Ahmedabad', description: '23.0225° N, 72.5714° E' },
            { label: 'Jaipur', description: '26.9124° N, 75.7873° E' },
            { label: 'Lucknow', description: '26.8467° N, 80.9462° E' }
        ];

        const selected = await vscode.window.showQuickPick(cities, {
            placeHolder: 'Select an Indian city to view on map...'
        });

        if (selected) {
            const results = await apiManager.searchLocation(selected.label);
            if (results.length > 0) {
                // If map panel is already open, send the location to it
                ApiMapPanel.sendMessageToWebview({
                    command: 'searchResults',
                    results: results
                });
                
                if (!ApiMapPanel.currentPanel) {
                    // If no panel is open, create one
                    ApiMapPanel.createOrShow(context, databaseManager, contentManager, apiManager);
                    // Wait for panel to initialize then send results again
                    setTimeout(() => {
                        ApiMapPanel.sendMessageToWebview({
                            command: 'searchResults',
                            results: results
                        });
                    }, 1000);
                }
            }
        }
    });

    const toggleOfflineCommand = vscode.commands.registerCommand('offlineMap.toggleOffline', () => {
        const config = vscode.workspace.getConfiguration('offlineMap');
        const currentMode = config.get('offlineMode', false);
        config.update('offlineMode', !currentMode, true).then(() => {
            updateStatusBar(!currentMode);
            vscode.window.showInformationMessage(
                `Offline mode ${!currentMode ? 'enabled' : 'disabled'} for India map`
            );
        });
    });

    const clearCacheCommand = vscode.commands.registerCommand('offlineMap.clearCache', () => {
        apiManager.clearCache();
        vscode.window.showInformationMessage('India map cache cleared successfully');
    });

    const showCurrentLocationCommand = vscode.commands.registerCommand('offlineMap.showCurrentLocation', () => {
        // Get approximate India location
        const indiaLocation = apiManager.getApproximateIndiaLocation();
        vscode.window.showInformationMessage(
            `Approximate location: ${indiaLocation.name} (${indiaLocation.accuracy} level)`
        );
        
        // Open map and center on approximate location
        ApiMapPanel.createOrShow(context, databaseManager, contentManager, apiManager);
        
        // Send location to map panel
        setTimeout(() => {
            ApiMapPanel.sendMessageToWebview({
                command: 'setView',
                lat: indiaLocation.lat,
                lng: indiaLocation.lng,
                name: indiaLocation.name
            });
        }, 1000);
    });

    // Register India-specific tourist commands
    const popularDestinationsCommand = vscode.commands.registerCommand('offlineMap.popularDestinations', async () => {
        const destinations = [
            { label: 'Taj Mahal, Agra', description: 'Iconic marble mausoleum' },
            { label: 'Golden Temple, Amritsar', description: 'Sikh holy shrine' },
            { label: 'Goa Beaches', description: 'Popular beach destination' },
            { label: 'Kerala Backwaters', description: 'Serene waterways' },
            { label: 'Leh-Ladakh', description: 'Mountain adventure' },
            { label: 'Varanasi Ghats', description: 'Spiritual city on Ganges' },
            { label: 'Mysore Palace', description: 'Royal heritage site' },
            { label: 'Hampi Ruins', description: 'Ancient Vijayanagara ruins' }
        ];

        const selected = await vscode.window.showQuickPick(destinations, {
            placeHolder: 'Popular Indian tourist destinations...'
        });

        if (selected) {
            const results = await apiManager.searchLocation(selected.label);
            if (results.length > 0) {
                // If map panel is already open, send the location to it
                ApiMapPanel.sendMessageToWebview({
                    command: 'searchResults',
                    results: results
                });
                
                if (!ApiMapPanel.currentPanel) {
                    // If no panel is open, create one
                    ApiMapPanel.createOrShow(context, databaseManager, contentManager, apiManager);
                    // Wait for panel to initialize then send results again
                    setTimeout(() => {
                        ApiMapPanel.sendMessageToWebview({
                            command: 'searchResults',
                            results: results
                        });
                    }, 1000);
                }
                vscode.window.showInformationMessage(`Opening ${selected.label} - ${selected.description}`);
            }
        }
    });

    // Context menu contributions
    context.subscriptions.push(
        showMapCommand,
        searchLocationCommand,
        quickIndianCitiesCommand,
        toggleOfflineCommand,
        clearCacheCommand,
        showCurrentLocationCommand,
        popularDestinationsCommand,
        statusBarItem
    );

    // Initialize components with progress indication
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Loading India Travel Guide...",
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0 });
        
        await databaseManager.initialize();
        progress.report({ increment: 50 });
        
        contentManager.initialize();
        progress.report({ increment: 100 });
        
        // Pre-load common Indian locations
        setTimeout(() => {
            vscode.window.showInformationMessage('India Travel Guide ready! Use Command Palette: "India Map: Show Map"');
        }, 500);
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

    // Register welcome message for first-time users
    showWelcomeMessage(context);
}

function updateStatusBar(isOffline: boolean) {
    if (isOffline) {
        statusBarItem.text = '$(cloud-off) India Map Offline';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarItem.tooltip = 'India Travel Guide - Offline Mode (limited functionality)';
    } else {
        statusBarItem.text = '$(globe) India Map Online';
        statusBarItem.backgroundColor = undefined;
        statusBarItem.tooltip = 'India Travel Guide - Online Mode (full functionality)';
    }
}

function showWelcomeMessage(context: vscode.ExtensionContext) {
    // Check if this is first activation
    const hasShownWelcome = context.globalState.get('indiaMapWelcomeShown', false);
    
    if (!hasShownWelcome) {
        setTimeout(() => {
            vscode.window.showInformationMessage(
                '🇮🇳 Welcome to India Travel Guide! Explore Indian cities and destinations.',
                'Open Map',
                'Quick Cities',
                'Popular Destinations'
            ).then(selection => {
                if (selection === 'Open Map') {
                    vscode.commands.executeCommand('offlineMap.showMap');
                } else if (selection === 'Quick Cities') {
                    vscode.commands.executeCommand('offlineMap.quickIndianCities');
                } else if (selection === 'Popular Destinations') {
                    vscode.commands.executeCommand('offlineMap.popularDestinations');
                }
            });
            
            context.globalState.update('indiaMapWelcomeShown', true);
        }, 2000);
    }
}

// Enhanced deactivation with cleanup
export function deactivate() {
    // Clean up resources
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    
    // Clear any ongoing API requests
    if (apiManager) {
        apiManager.clearCache();
    }
    
    console.log('India Travel Guide extension has been deactivated');
}