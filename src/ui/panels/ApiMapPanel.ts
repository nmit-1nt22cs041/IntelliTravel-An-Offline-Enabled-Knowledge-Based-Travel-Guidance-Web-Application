import * as vscode from 'vscode';

export class ApiMapPanel {
    public static currentPanel: ApiMapPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(
        context: vscode.ExtensionContext,
        databaseManager: any,
        contentManager: any,
        apiManager: any
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ApiMapPanel.currentPanel) {
            ApiMapPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'offlineMap',
            'Offline Map - Bangalore',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );

        ApiMapPanel.currentPanel = new ApiMapPanel(panel, context, apiManager);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private context: vscode.ExtensionContext,
        private apiManager: any
    ) {
        this._panel = panel;
        this._extensionUri = context.extensionUri;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'searchLocation':
                        const results = await this.apiManager.searchLocation(message.query);
                        this._panel.webview.postMessage({
                            command: 'searchResults',
                            results: results
                        });
                        break;
                    case 'showInfo':
                        vscode.window.showInformationMessage(message.text);
                        break;
                    case 'showError':
                        vscode.window.showErrorMessage(message.text);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Bangalore Offline Map</title>
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                <style>
                    body { 
                        margin: 0; 
                        padding: 0; 
                        font-family: var(--vscode-font-family);
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    #map { 
                        width: 100vw; 
                        height: 100vh; 
                    }
                    .map-controls {
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        z-index: 1000;
                        background: var(--vscode-editor-background);
                        padding: 10px;
                        border-radius: 5px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                    }
                    .control-btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 12px;
                        margin: 2px;
                        border-radius: 3px;
                        cursor: pointer;
                    }
                    .search-box {
                        position: absolute;
                        top: 10px;
                        left: 10px;
                        z-index: 1000;
                        background: var(--vscode-editor-background);
                        padding: 10px;
                        border-radius: 5px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                    }
                    .search-input {
                        padding: 8px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 3px;
                        width: 250px;
                    }
                    .search-results {
                        position: absolute;
                        top: 50px;
                        left: 10px;
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 3px;
                        max-height: 200px;
                        overflow-y: auto;
                        z-index: 1001;
                        width: 250px;
                    }
                    .search-result-item {
                        padding: 8px;
                        cursor: pointer;
                        border-bottom: 1px solid var(--vscode-input-border);
                    }
                    .search-result-item:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .offline-indicator {
                        position: absolute;
                        bottom: 10px;
                        left: 10px;
                        background: var(--vscode-inputValidation-warningBackground);
                        color: var(--vscode-inputValidation-warningForeground);
                        padding: 5px 10px;
                        border-radius: 3px;
                        z-index: 1000;
                        font-size: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="search-box">
                    <input type="text" class="search-input" id="searchInput" placeholder="Search Bangalore locations...">
                    <div class="search-results" id="searchResults" style="display: none;"></div>
                </div>
                <div class="map-controls">
                    <button class="control-btn" onclick="zoomIn()">+</button>
                    <button class="control-btn" onclick="zoomOut()">-</button>
                    <button class="control-btn" onclick="locateMe()">📍</button>
                    <button class="control-btn" onclick="showBangaloreLandmarks()">🏛️</button>
                </div>
                <div id="map"></div>

                <script>
                    let map;
                    let markers = [];
                    let currentLocationMarker = null;

                    function initMap() {
                        // Center on Bangalore
                        map = L.map('map').setView([12.9716, 77.5946], 12);

                        // Add OpenStreetMap tiles
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '© OpenStreetMap contributors',
                            maxZoom: 18
                        }).addTo(map);

                        // Add click event
                        map.on('click', function(e) {
                            addMarker(e.latlng.lat, e.latlng.lng, 'Custom Marker');
                        });

                        // Load Bangalore landmarks
                        showBangaloreLandmarks();

                        // Setup search
                        setupSearch();

                        // Check offline mode
                        updateOfflineIndicator();
                    }

                    function setupSearch() {
                        const searchInput = document.getElementById('searchInput');
                        const searchResults = document.getElementById('searchResults');
                        let searchTimeout;

                        searchInput.addEventListener('input', function(e) {
                            clearTimeout(searchTimeout);
                            const query = e.target.value;
                            
                            if (query.length < 2) {
                                searchResults.style.display = 'none';
                                return;
                            }

                            searchTimeout = setTimeout(() => {
                                vscode.postMessage({
                                    command: 'searchLocation',
                                    query: query
                                });
                            }, 500);
                        });

                        // Hide results when clicking outside
                        document.addEventListener('click', function(e) {
                            if (!searchResults.contains(e.target) && e.target !== searchInput) {
                                searchResults.style.display = 'none';
                            }
                        });
                    }

                    function showSearchResults(results) {
                        const searchResults = document.getElementById('searchResults');
                        searchResults.innerHTML = '';
                        
                        if (results.length === 0) {
                            const noResults = document.createElement('div');
                            noResults.className = 'search-result-item';
                            noResults.textContent = 'No results found';
                            searchResults.appendChild(noResults);
                        } else {
                            results.forEach(result => {
                                const item = document.createElement('div');
                                item.className = 'search-result-item';
                                item.textContent = result.name;
                                item.onclick = () => {
                                    map.setView([result.lat, result.lng], 15);
                                    addMarker(result.lat, result.lng, result.name);
                                    searchResults.style.display = 'none';
                                    document.getElementById('searchInput').value = '';
                                    
                                    // Show popup with info
                                    L.popup()
                                        .setLatLng([result.lat, result.lng])
                                        .setContent('<b>' + result.name + '</b><br>' + (result.description || ''))
                                        .openOn(map);
                                };
                                searchResults.appendChild(item);
                            });
                        }
                        
                        searchResults.style.display = 'block';
                    }

                    function addMarker(lat, lng, title) {
                        const marker = L.marker([lat, lng]).addTo(map)
                            .bindPopup(title)
                            .openPopup();
                        markers.push(marker);
                    }

                    function clearMarkers() {
                        markers.forEach(marker => map.removeLayer(marker));
                        markers = [];
                    }

                    function zoomIn() {
                        map.zoomIn();
                    }

                    function zoomOut() {
                        map.zoomOut();
                    }

                    function locateMe() {
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(
                                (position) => {
                                    const lat = position.coords.latitude;
                                    const lng = position.coords.longitude;
                                    
                                    if (currentLocationMarker) {
                                        map.removeLayer(currentLocationMarker);
                                    }
                                    
                                    currentLocationMarker = L.marker([lat, lng])
                                        .addTo(map)
                                        .bindPopup('Your Current Location')
                                        .openPopup();
                                    
                                    map.setView([lat, lng], 15);
                                },
                                (error) => {
                                    alert('Unable to get your location: ' + error.message);
                                }
                            );
                        } else {
                            alert('Geolocation is not supported by this browser.');
                        }
                    }

                    function showBangaloreLandmarks() {
                        clearMarkers();
                        
                        const landmarks = [
                            { lat: 12.9794, lng: 77.5907, name: 'Vidhana Soudha', desc: 'Legislative building of Karnataka' },
                            { lat: 12.9764, lng: 77.5927, name: 'Cubbon Park', desc: 'Large public park' },
                            { lat: 12.9507, lng: 77.5848, name: 'Lalbagh Garden', desc: 'Botanical garden with glass house' },
                            { lat: 12.9988, lng: 77.5923, name: 'Bangalore Palace', desc: 'Tudor-style palace' },
                            { lat: 12.9812, lng: 77.6084, name: 'Commercial Street', desc: 'Shopping destination' },
                            { lat: 13.0105, lng: 77.5511, name: 'ISKCON Temple', desc: 'Hare Krishna temple' }
                        ];

                        landmarks.forEach(landmark => {
                            const marker = L.marker([landmark.lat, landmark.lng])
                                .addTo(map)
                                .bindPopup('<b>' + landmark.name + '</b><br>' + landmark.desc);
                            markers.push(marker);
                        });
                    }

                    function updateOfflineIndicator() {
                        // Simple offline indicator
                        const indicator = document.createElement('div');
                        indicator.className = 'offline-indicator';
                        indicator.textContent = 'MAP READY';
                        document.body.appendChild(indicator);
                    }

                    // Handle messages from VS Code
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'searchResults':
                                showSearchResults(message.results);
                                break;
                            case 'addMarker':
                                addMarker(message.lat, message.lng, message.title);
                                break;
                            case 'setView':
                                map.setView([message.lat, message.lng], message.zoom || 15);
                                break;
                        }
                    });

                    // Initialize map when page loads
                    document.addEventListener('DOMContentLoaded', initMap);
                </script>
            </body>
            </html>
        `;
    }

    public static async searchLocation(
        query: string,
        context: vscode.ExtensionContext,
        databaseManager: any,
        apiManager: any
    ) {
        const results = await apiManager.searchLocation(query);
        
        if (results.length > 0) {
            const quickPick = vscode.window.createQuickPick();
            quickPick.items = results.map((result: any) => ({
                label: result.name,
                description: result.type,
                detail: 'Lat: ' + result.lat + ', Lng: ' + result.lng,
                result: result
            }));
            
            quickPick.onDidChangeSelection(selection => {
                if (selection[0]) {
                    const result = (selection[0] as any).result;
                    if (ApiMapPanel.currentPanel) {
                        ApiMapPanel.currentPanel._panel.webview.postMessage({
                            command: 'setView',
                            lat: result.lat,
                            lng: result.lng
                        });
                    }
                }
                quickPick.hide();
            });
            
            quickPick.show();
        } else {
            vscode.window.showWarningMessage('No locations found for: ' + query);
        }
    }

    public dispose() {
        ApiMapPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}