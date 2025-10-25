import * as vscode from 'vscode';
import { MapApiManager, Place } from '../../map/mapApiManager';

export class ApiMapPanel {
    public static currentPanel: ApiMapPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static sendMessageToWebview(message: any) {
        if (ApiMapPanel.currentPanel) {
            ApiMapPanel.currentPanel._panel.webview.postMessage(message);
        }
    }

    public static createOrShow(
        context: vscode.ExtensionContext,
        databaseManager: any,
        contentManager: any,
        apiManager: MapApiManager
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
            'Travel Guide - India Map',
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
        private apiManager: MapApiManager
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
                    case 'getNearbyPlaces':
                        const nearbyPlaces = await this.apiManager.getNearbyPlaces(
                            message.lat, 
                            message.lng, 
                            message.category
                        );
                        this._panel.webview.postMessage({
                            command: 'showNearbyPlaces',
                            places: nearbyPlaces,
                            category: message.category
                        });
                        break;
                    case 'getDirections':
                        const directions = await this.apiManager.getDirections(
                            message.start, 
                            message.destination, 
                            message.mode
                        );
                        this._panel.webview.postMessage({
                            command: 'showDirections',
                            directions: directions
                        });
                        break;
                    case 'getExactLocation':
                        this.getExactLocation();
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

    private async getExactLocation() {
        try {
            // Try to get exact location using browser geolocation
            // This will be handled by the webview, but we can provide fallback
            const indiaLocation = this.apiManager.getApproximateIndiaLocation();
            
            this._panel.webview.postMessage({
                command: 'exactLocationResult',
                location: indiaLocation,
                accuracy: 'approximate',
                message: 'Using approximate location. Enable browser location for exact position.'
            });

        } catch (error) {
            this._panel.webview.postMessage({
                command: 'exactLocationError',
                error: 'Could not determine exact location. Please enable location services.'
            });
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const categories = this.apiManager.getPlaceCategories();
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>India Travel Guide</title>
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: #f8f9fa;
                        color: #333;
                        overflow: hidden;
                    }
                    
                    #map { 
                        width: 100vw; 
                        height: 100vh; 
                        z-index: 1;
                    }
                    
                    /* Header & Search */
                    .header {
                        position: absolute;
                        top: 20px;
                        left: 20px;
                        right: 20px;
                        z-index: 1000;
                        display: flex;
                        gap: 15px;
                        align-items: center;
                    }
                    
                    .search-container {
                        flex: 1;
                        max-width: 600px;
                        background: white;
                        border-radius: 25px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        padding: 8px 20px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        position: relative;
                    }
                    
                    .search-input {
                        border: none;
                        outline: none;
                        font-size: 16px;
                        flex: 1;
                        padding: 8px 0;
                    }
                    
                    .search-results {
                        position: absolute;
                        top: 100%;
                        left: 0;
                        right: 0;
                        background: white;
                        border-radius: 15px;
                        margin-top: 10px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                        max-height: 300px;
                        overflow-y: auto;
                        display: none;
                        z-index: 1001;
                    }
                    
                    .search-result-item {
                        padding: 15px 20px;
                        border-bottom: 1px solid #eee;
                        cursor: pointer;
                        transition: background 0.2s;
                    }
                    
                    .search-result-item:hover {
                        background: #f8f9fa;
                    }
                    
                    .search-result-item:last-child {
                        border-bottom: none;
                    }
                    
                    .result-name {
                        font-weight: 600;
                        margin-bottom: 5px;
                        color: #333;
                    }
                    
                    .result-description {
                        font-size: 12px;
                        color: #666;
                    }
                    
                    /* Controls */
                    .controls {
                        position: absolute;
                        top: 20px;
                        right: 20px;
                        z-index: 1001;
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }
                    
                    .control-btn {
                        background: white;
                        border: none;
                        width: 45px;
                        height: 45px;
                        border-radius: 50%;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 18px;
                        transition: all 0.2s;
                    }
                    
                    .control-btn:hover {
                        background: #f8f9fa;
                        transform: scale(1.05);
                    }
                    
                    /* Categories Panel */
                    .categories-panel {
                        position: absolute;
                        top: 90px;
                        left: 20px;
                        background: white;
                        border-radius: 15px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                        padding: 20px;
                        z-index: 1000;
                        width: 300px;
                        display: none;
                    }
                    
                    .categories-title {
                        font-size: 18px;
                        font-weight: 600;
                        margin-bottom: 15px;
                        color: #333;
                    }
                    
                    .category-list {
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }
                    
                    .category-btn {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px 15px;
                        border: none;
                        background: #f8f9fa;
                        border-radius: 10px;
                        cursor: pointer;
                        transition: all 0.2s;
                        text-align: left;
                        width: 100%;
                        font-size: 14px;
                    }
                    
                    .category-btn:hover {
                        background: #e9ecef;
                        transform: translateX(5px);
                    }
                    
                    .category-icon {
                        font-size: 16px;
                        width: 24px;
                    }
                    
                    /* Places Panel */
                    .places-panel {
                        position: absolute;
                        bottom: 20px;
                        left: 20px;
                        right: 20px;
                        background: white;
                        border-radius: 15px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                        max-height: 300px;
                        overflow-y: auto;
                        z-index: 1000;
                        display: none;
                    }
                    
                    .places-header {
                        padding: 20px;
                        border-bottom: 1px solid #eee;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    
                    .places-title {
                        font-size: 18px;
                        font-weight: 600;
                    }
                    
                    .close-places {
                        background: none;
                        border: none;
                        font-size: 20px;
                        cursor: pointer;
                        color: #666;
                    }
                    
                    .places-list {
                        padding: 10px;
                    }
                    
                    .place-item {
                        padding: 15px;
                        border-bottom: 1px solid #f0f0f0;
                        cursor: pointer;
                        transition: background 0.2s;
                    }
                    
                    .place-item:hover {
                        background: #f8f9fa;
                    }
                    
                    .place-name {
                        font-weight: 600;
                        margin-bottom: 5px;
                    }
                    
                    .place-address {
                        font-size: 12px;
                        color: #666;
                        margin-bottom: 5px;
                    }
                    
                    .place-rating {
                        color: #ffc107;
                        font-size: 12px;
                    }
                    
                    /* Directions Panel */
                    .directions-panel {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: white;
                        border-radius: 15px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                        z-index: 1002;
                        width: 400px;
                        display: none;
                    }
                    
                    .directions-header {
                        padding: 20px;
                        border-bottom: 1px solid #eee;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    
                    .directions-title {
                        font-size: 18px;
                        font-weight: 600;
                    }
                    
                    .close-directions {
                        background: none;
                        border: none;
                        font-size: 20px;
                        cursor: pointer;
                        color: #666;
                    }
                    
                    .directions-content {
                        padding: 20px;
                    }
                    
                    .route-info {
                        background: #e8f4fd;
                        padding: 15px;
                        border-radius: 10px;
                        margin-bottom: 15px;
                    }
                    
                    .route-distance, .route-duration {
                        margin-bottom: 5px;
                        font-weight: 600;
                    }
                    
                    .travel-modes {
                        display: flex;
                        gap: 10px;
                        margin-bottom: 15px;
                    }
                    
                    .mode-btn {
                        flex: 1;
                        padding: 10px;
                        border: 2px solid #e9ecef;
                        background: white;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    
                    .mode-btn.active {
                        border-color: #4285f4;
                        background: #4285f4;
                        color: white;
                    }
                    
                    /* Popup Styling */
                    .leaflet-popup-content {
                        margin: 15px !important;
                        min-width: 250px;
                    }
                    
                    .leaflet-popup-content-wrapper {
                        border-radius: 12px !important;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
                    }
                    
                    .place-popup h3 {
                        margin: 0 0 10px 0;
                        color: #333;
                    }
                    
                    .place-popup p {
                        margin: 0 0 10px 0;
                        color: #666;
                        font-size: 14px;
                    }
                    
                    .popup-actions {
                        display: flex;
                        gap: 10px;
                        margin-top: 15px;
                    }
                    
                    .popup-btn {
                        flex: 1;
                        padding: 10px;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: all 0.2s;
                    }
                    
                    .btn-primary {
                        background: #4285f4;
                        color: white;
                    }
                    
                    .btn-secondary {
                        background: #f8f9fa;
                        color: #333;
                    }
                    
                    .popup-btn:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    }
                    
                    /* Loading */
                    .loading {
                        display: none;
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: rgba(255,255,255,0.95);
                        padding: 20px 30px;
                        border-radius: 10px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                        z-index: 1003;
                        font-size: 16px;
                        font-weight: 500;
                        text-align: center;
                    }
                    
                    .location-marker {
                        background: #4285f4;
                        border: 3px solid white;
                        border-radius: 50%;
                        width: 20px;
                        height: 20px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                    }

                    .exact-location-marker {
                        background: #34a853;
                        border: 3px solid white;
                        border-radius: 50%;
                        width: 24px;
                        height: 24px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                        animation: pulse 2s infinite;
                    }

                    .accuracy-circle {
                        fill: #34a853;
                        fill-opacity: 0.2;
                        stroke: #34a853;
                        stroke-width: 2;
                        stroke-opacity: 0.5;
                    }

                    @keyframes pulse {
                        0% { transform: scale(1); }
                        50% { transform: scale(1.1); }
                        100% { transform: scale(1); }
                    }

                    /* Quick Actions */
                    .quick-actions {
                        position: absolute;
                        bottom: 20px;
                        right: 20px;
                        z-index: 1000;
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }
                    
                    .quick-action-btn {
                        background: #4285f4;
                        color: white;
                        border: none;
                        padding: 12px 16px;
                        border-radius: 25px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    
                    .quick-action-btn:hover {
                        background: #3367d6;
                        transform: translateY(-2px);
                    }

                    .india-flag {
                        background: linear-gradient(135deg, #ff9933 33%, #ffffff 33%, #ffffff 66%, #138808 66%);
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        border: 1px solid #ddd;
                    }

                    /* Location Accuracy Indicator */
                    .accuracy-indicator {
                        position: absolute;
                        top: 80px;
                        right: 20px;
                        background: white;
                        padding: 10px 15px;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        z-index: 1000;
                        font-size: 12px;
                        display: none;
                    }

                    .accuracy-high { color: #34a853; }
                    .accuracy-medium { color: #fbbc05; }
                    .accuracy-low { color: #ea4335; }
                </style>
            </head>
            <body>
                <!-- Main Map -->
                <div id="map"></div>
                
                <!-- Header with Search -->
                <div class="header">
                    <div class="search-container">
                        <i class="fas fa-search" style="color: #666;"></i>
                        <input type="text" class="search-input" id="searchInput" placeholder="Search any location in India...">
                        <div class="search-results" id="searchResults"></div>
                    </div>
                </div>
                
                <!-- Controls -->
                <div class="controls">
                    <button class="control-btn" onclick="toggleCategories()" title="Explore Categories">
                        <i class="fas fa-layer-group"></i>
                    </button>
                    <button class="control-btn" onclick="getExactLocation()" title="My Exact Location">
                        <i class="fas fa-location-dot"></i>
                    </button>
                    <button class="control-btn" onclick="locateMe()" title="Approximate Location">
                        <i class="fas fa-location-crosshairs"></i>
                    </button>
                    <button class="control-btn" onclick="zoomIn()" title="Zoom In">
                        <i class="fas fa-plus"></i>
                    </button>
                    <button class="control-btn" onclick="zoomOut()" title="Zoom Out">
                        <i class="fas fa-minus"></i>
                    </button>
                </div>

                <!-- Location Accuracy Indicator -->
                <div class="accuracy-indicator" id="accuracyIndicator">
                    <i class="fas fa-bullseye"></i> 
                    <span id="accuracyText">Location Accuracy</span>
                </div>

                <!-- Quick Actions - Indian Cities -->
                <div class="quick-actions">
                    <button class="quick-action-btn" onclick="searchPopularCity('Delhi')">
                        <div class="india-flag"></div> Delhi
                    </button>
                    <button class="quick-action-btn" onclick="searchPopularCity('Mumbai')">
                        <div class="india-flag"></div> Mumbai
                    </button>
                    <button class="quick-action-btn" onclick="searchPopularCity('Bangalore')">
                        <div class="india-flag"></div> Bangalore
                    </button>
                    <button class="quick-action-btn" onclick="searchPopularCity('Chennai')">
                        <div class="india-flag"></div> Chennai
                    </button>
                </div>
                
                <!-- Categories Panel -->
                <div class="categories-panel" id="categoriesPanel">
                    <div class="categories-title">Explore Nearby Places</div>
                    <div class="category-list" id="categoryList">
                        ${categories.map(cat => `
                            <button class="category-btn" onclick="findNearbyPlaces('${cat.id}')">
                                <span class="category-icon">${cat.icon}</span>
                                <span>${cat.name}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
                
                <!-- Places Panel -->
                <div class="places-panel" id="placesPanel">
                    <div class="places-header">
                        <div class="places-title" id="placesTitle">Nearby Places</div>
                        <button class="close-places" onclick="closePlacesPanel()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="places-list" id="placesList"></div>
                </div>
                
                <!-- Directions Panel -->
                <div class="directions-panel" id="directionsPanel">
                    <div class="directions-header">
                        <div class="directions-title">Get Directions</div>
                        <button class="close-directions" onclick="closeDirections()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="directions-content">
                        <div class="route-info" id="routeInfo"></div>
                        <div class="travel-modes">
                            <button class="mode-btn active" onclick="setTravelMode('driving')">🚗 Drive</button>
                            <button class="mode-btn" onclick="setTravelMode('walking')">🚶 Walk</button>
                            <button class="mode-btn" onclick="setTravelMode('cycling')">🚴 Bike</button>
                        </div>
                    </div>
                </div>
                
                <!-- Loading Indicator -->
                <div class="loading" id="loading">
                    <i class="fas fa-spinner fa-spin"></i> Loading...
                </div>

                <script>
                    // Global variables
                    let map;
                    let markers = [];
                    let currentLocationMarker = null;
                    let accuracyCircle = null;
                    let routeLine = null;
                    let selectedLocation = null;
                    let currentTravelMode = 'driving';
                    let watchId = null;
                    
                    // Initialize Map - Focused on India
                    function initMap() {
                        // Start with India view
                        map = L.map('map').setView([20.5937, 78.9629], 5);
                        
                        // Add optimized tile layer for faster loading
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '© OpenStreetMap contributors',
                            maxZoom: 18,
                            minZoom: 3
                        }).addTo(map);
                        
                        // Add scale control
                        L.control.scale().addTo(map);
                        
                        // Setup search with faster debounce
                        setupSearch();
                        
                        // Auto-detect approximate location on startup
                        setTimeout(() => {
                            locateMe();
                        }, 1000);
                        
                        showMessage('Welcome to India Travel Guide! Search any location or use quick buttons.');
                    }
                    
                    // Get EXACT location using browser geolocation
                    function getExactLocation() {
                        showLoading('Getting your exact location...');
                        
                        if (!navigator.geolocation) {
                            hideLoading();
                            showMessage('Geolocation is not supported by your browser');
                            return;
                        }
                        
                        // Request high accuracy location
                        const options = {
                            enableHighAccuracy: true,
                            timeout: 10000,
                            maximumAge: 0
                        };
                        
                        navigator.geolocation.getCurrentPosition(
                            (position) => {
                                handleExactLocationSuccess(position);
                            },
                            (error) => {
                                handleExactLocationError(error);
                            },
                            options
                        );
                    }
                    
                    function handleExactLocationSuccess(position) {
                        hideLoading();
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        const accuracy = position.coords.accuracy;
                        
                        // Clear previous location markers
                        if (currentLocationMarker) {
                            map.removeLayer(currentLocationMarker);
                        }
                        if (accuracyCircle) {
                            map.removeLayer(accuracyCircle);
                        }
                        
                        // Create exact location marker
                        const exactLocationIcon = L.divIcon({
                            className: 'exact-location-marker',
                            iconSize: [24, 24]
                        });
                        
                        currentLocationMarker = L.marker([lat, lng], { icon: exactLocationIcon })
                            .addTo(map)
                            .bindPopup(createExactLocationPopup(lat, lng, accuracy))
                            .openPopup();
                        
                        // Add accuracy circle
                        accuracyCircle = L.circle([lat, lng], {
                            color: '#34a853',
                            fillColor: '#34a853',
                            fillOpacity: 0.2,
                            radius: accuracy
                        }).addTo(map);
                        
                        // Center map on exact location
                        map.setView([lat, lng], 15);
                        
                        // Update accuracy indicator
                        updateAccuracyIndicator(accuracy);
                        
                        showMessage(\`Exact location found! Accuracy: \${Math.round(accuracy)} meters\`);
                        
                        // Start watching position if high accuracy
                        if (accuracy < 100) {
                            startWatchingPosition();
                        }
                    }
                    
                    function createExactLocationPopup(lat, lng, accuracy) {
                        return \`
                            <div class="place-popup">
                                <h3>Your Exact Location</h3>
                                <p>Latitude: \${lat.toFixed(6)}</p>
                                <p>Longitude: \${lng.toFixed(6)}</p>
                                <p>Accuracy: \${Math.round(accuracy)} meters</p>
                                <div class="popup-actions">
                                    <button class="popup-btn btn-primary" onclick="findNearbyPlaces('restaurant')">
                                        Find Restaurants
                                    </button>
                                    <button class="popup-btn btn-secondary" onclick="toggleCategories()">
                                        Explore More
                                    </button>
                                </div>
                            </div>
                        \`;
                    }
                    
                    function updateAccuracyIndicator(accuracy) {
                        const indicator = document.getElementById('accuracyIndicator');
                        const text = document.getElementById('accuracyText');
                        
                        let accuracyLevel, colorClass;
                        if (accuracy < 50) {
                            accuracyLevel = 'High Accuracy';
                            colorClass = 'accuracy-high';
                        } else if (accuracy < 200) {
                            accuracyLevel = 'Medium Accuracy';
                            colorClass = 'accuracy-medium';
                        } else {
                            accuracyLevel = 'Low Accuracy';
                            colorClass = 'accuracy-low';
                        }
                        
                        text.innerHTML = \`\${accuracyLevel} (\${Math.round(accuracy)}m)\`;
                        text.className = colorClass;
                        indicator.style.display = 'block';
                    }
                    
                    function startWatchingPosition() {
                        if (watchId) {
                            navigator.geolocation.clearWatch(watchId);
                        }
                        
                        watchId = navigator.geolocation.watchPosition(
                            (position) => {
                                const lat = position.coords.latitude;
                                const lng = position.coords.longitude;
                                const accuracy = position.coords.accuracy;
                                
                                // Update marker position
                                if (currentLocationMarker) {
                                    currentLocationMarker.setLatLng([lat, lng]);
                                }
                                
                                // Update accuracy circle
                                if (accuracyCircle) {
                                    map.removeLayer(accuracyCircle);
                                    accuracyCircle = L.circle([lat, lng], {
                                        color: '#34a853',
                                        fillColor: '#34a853',
                                        fillOpacity: 0.2,
                                        radius: accuracy
                                    }).addTo(map);
                                }
                                
                                updateAccuracyIndicator(accuracy);
                            },
                            (error) => {
                                console.log('Position watching stopped:', error);
                            },
                            {
                                enableHighAccuracy: true,
                                timeout: 5000,
                                maximumAge: 0
                            }
                        );
                    }
                    
                    function handleExactLocationError(error) {
                        hideLoading();
                        let errorMessage = 'Unable to get your exact location';
                        
                        switch(error.code) {
                            case error.PERMISSION_DENIED:
                                errorMessage = 'Location access denied. Please allow location permissions in your browser.';
                                break;
                            case error.POSITION_UNAVAILABLE:
                                errorMessage = 'Location information unavailable. Please check your device settings.';
                                break;
                            case error.TIMEOUT:
                                errorMessage = 'Location request timed out. Please try again.';
                                break;
                        }
                        
                        showMessage(errorMessage);
                        
                        // Fallback to approximate location
                        vscode.postMessage({
                            command: 'getExactLocation'
                        });
                    }
                    
                    // Quick city search for Indian cities
                    function searchPopularCity(cityName) {
                        document.getElementById('searchInput').value = cityName;
                        document.getElementById('searchInput').focus();
                        
                        showLoading('Loading ' + cityName + '...');
                        vscode.postMessage({
                            command: 'searchLocation',
                            query: cityName
                        });
                    }
                    
                    // Optimized search functionality
                    function setupSearch() {
                        const searchInput = document.getElementById('searchInput');
                        const searchResults = document.getElementById('searchResults');
                        let searchTimeout;
                        
                        searchInput.addEventListener('input', function(e) {
                            clearTimeout(searchTimeout);
                            const query = e.target.value.trim();
                            
                            if (query.length < 2) {
                                searchResults.style.display = 'none';
                                hideLoading();
                                return;
                            }
                            
                            showLoading('Searching...');
                            searchTimeout = setTimeout(() => {
                                vscode.postMessage({
                                    command: 'searchLocation',
                                    query: query
                                });
                            }, 200); // Faster search - 200ms
                        });
                        
                        // Hide results when clicking outside
                        document.addEventListener('click', function(e) {
                            if (!searchResults.contains(e.target) && e.target !== searchInput) {
                                searchResults.style.display = 'none';
                            }
                        });
                    }
                    
                    // Show search results
                    function showSearchResults(results) {
                        hideLoading();
                        const searchResults = document.getElementById('searchResults');
                        searchResults.innerHTML = '';
                        
                        if (results.length === 0) {
                            searchResults.innerHTML = '<div class="search-result-item">No results found in India</div>';
                        } else {
                            results.forEach(result => {
                                const item = document.createElement('div');
                                item.className = 'search-result-item';
                                item.innerHTML = \`
                                    <div class="result-name">\${result.name}</div>
                                    <div class="result-description">\${result.description || ''}</div>
                                \`;
                                item.onclick = () => {
                                    selectLocation(result);
                                    searchResults.style.display = 'none';
                                    document.getElementById('searchInput').value = result.name;
                                };
                                searchResults.appendChild(item);
                            });
                        }
                        
                        searchResults.style.display = 'block';
                    }
                    
                    // Select a location from search
                    function selectLocation(location) {
                        selectedLocation = location;
                        clearMarkers();
                        
                        // Add marker for selected location
                        const marker = L.marker([location.lat, location.lng])
                            .addTo(map)
                            .bindPopup(createLocationPopup(location))
                            .openPopup();
                        markers.push(marker);
                        
                        // Center and zoom into the location
                        map.setView([location.lat, location.lng], 12);
                        
                        showMessage(\`Selected: \${location.name}\`);
                        
                        // Auto-open categories for exploration
                        setTimeout(() => {
                            document.getElementById('categoriesPanel').style.display = 'block';
                        }, 500);
                    }
                    
                    // Create popup for location
                    function createLocationPopup(location) {
                        return \`
                            <div class="place-popup">
                                <h3>\${location.name}</h3>
                                <p>\${location.description || 'Location selected'}</p>
                                <div class="popup-actions">
                                    <button class="popup-btn btn-primary" onclick="showDirectionsToLocation(\${location.lat}, \${location.lng}, '\${location.name.replace(/'/g, "\\\\'")}')">
                                        Get Directions
                                    </button>
                                    <button class="popup-btn btn-secondary" onclick="toggleCategories()">
                                        Explore Nearby
                                    </button>
                                </div>
                            </div>
                        \`;
                    }
                    
                    // Find nearby places
                    function findNearbyPlaces(category) {
                        if (!selectedLocation) {
                            showMessage('Please search and select a location first');
                            return;
                        }
                        
                        showLoading('Finding nearby places...');
                        vscode.postMessage({
                            command: 'getNearbyPlaces',
                            lat: selectedLocation.lat,
                            lng: selectedLocation.lng,
                            category: category
                        });
                    }
                    
                    // Show nearby places
                    function showNearbyPlaces(places, category) {
                        hideLoading();
                        clearMarkers();
                        
                        // Add markers for nearby places
                        places.forEach(place => {
                            const marker = L.marker([place.lat, place.lng])
                                .addTo(map)
                                .bindPopup(createPlacePopup(place));
                            markers.push(marker);
                        });
                        
                        // Show places panel
                        const placesPanel = document.getElementById('placesPanel');
                        const placesTitle = document.getElementById('placesTitle');
                        const placesList = document.getElementById('placesList');
                        
                        placesTitle.textContent = \`Nearby \${getCategoryName(category)} (\${places.length})\`;
                        placesList.innerHTML = places.map(place => \`
                            <div class="place-item" onclick="focusOnPlace(\${place.lat}, \${place.lng}, '\${place.name.replace(/'/g, "\\\\'")}')">
                                <div class="place-name">\${place.name}</div>
                                <div class="place-address">\${place.address}</div>
                                <div class="place-rating">\${'★'.repeat(Math.floor(place.rating))} \${place.rating}</div>
                            </div>
                        \`).join('');
                        
                        placesPanel.style.display = 'block';
                        closeCategories();
                    }
                    
                    // Create popup for place
                    function createPlacePopup(place) {
                        return \`
                            <div class="place-popup">
                                <h3>\${place.name}</h3>
                                <p>\${place.description || ''}</p>
                                <p><small>\${place.address}</small></p>
                                <div class="place-rating">\${'★'.repeat(Math.floor(place.rating))} \${place.rating}</div>
                                <div class="popup-actions">
                                    <button class="popup-btn btn-primary" onclick="showDirectionsToLocation(\${place.lat}, \${place.lng}, '\${place.name.replace(/'/g, "\\\\'")}')">
                                        Directions
                                    </button>
                                </div>
                            </div>
                        \`;
                    }
                    
                    // Enhanced location detection for India (approximate)
                    function locateMe() {
                        showLoading('Finding your approximate location in India...');
                        
                        // First try browser geolocation
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(
                                (position) => {
                                    handleLocationSuccess(position);
                                },
                                (error) => {
                                    // If geolocation fails, use VS Code extension fallback
                                    vscode.postMessage({
                                        command: 'getExactLocation'
                                    });
                                },
                                {
                                    enableHighAccuracy: false,
                                    timeout: 5000,
                                    maximumAge: 300000
                                }
                            );
                        } else {
                            // Fallback to extension-based location
                            vscode.postMessage({
                                command: 'getExactLocation'
                            });
                        }
                    }
                    
                    function handleLocationSuccess(position) {
                        hideLoading();
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        
                        // Check if location is within India bounds
                        if (isInIndia(lat, lng)) {
                            setCurrentLocation(lat, lng, 'Your Current Location in India', true);
                        } else {
                            // Location outside India, use Delhi as default
                            setCurrentLocation(28.6139, 77.2090, 'New Delhi, India (Default)', false);
                            showMessage('Location outside India. Using Delhi as default.');
                        }
                    }
                    
                    function isInIndia(lat, lng) {
                        // Rough bounding box for India
                        return lat >= 6.0 && lat <= 37.0 && lng >= 68.0 && lng <= 98.0;
                    }
                    
                    function setCurrentLocation(lat, lng, name, isExact) {
                        // Clear previous location marker
                        if (currentLocationMarker) {
                            map.removeLayer(currentLocationMarker);
                        }
                        
                        // Create custom current location marker
                        const locationIcon = L.divIcon({
                            className: isExact ? 'exact-location-marker' : 'location-marker',
                            iconSize: isExact ? [24, 24] : [20, 20]
                        });
                        
                        currentLocationMarker = L.marker([lat, lng], { icon: locationIcon })
                            .addTo(map)
                            .bindPopup(name + (isExact ? '' : ' (Approximate)'))
                            .openPopup();
                        
                        // Center map on location with appropriate zoom
                        map.setView([lat, lng], isExact ? 15 : 10);
                        showMessage(isExact ? 'Your exact location in India found!' : 'Using approximate Indian location');
                    }
                    
                    // Show directions to location
                    function showDirectionsToLocation(lat, lng, name) {
                        const directionsPanel = document.getElementById('directionsPanel');
                        const routeInfo = document.getElementById('routeInfo');
                        
                        routeInfo.innerHTML = \`<div>Calculating route to <strong>\${name}</strong>...</div>\`;
                        directionsPanel.style.display = 'block';
                        
                        showLoading('Calculating route...');
                        
                        // Get current location or use map center
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(
                                (position) => {
                                    const userLocation = {
                                        lat: position.coords.latitude,
                                        lng: position.coords.longitude
                                    };
                                    calculateRoute(userLocation, { lat, lng });
                                },
                                () => {
                                    // Fallback to map center
                                    const center = map.getCenter();
                                    calculateRoute({ lat: center.lat, lng: center.lng }, { lat, lng });
                                    showMessage('Using map center for directions');
                                },
                                {
                                    enableHighAccuracy: true,
                                    timeout: 5000,
                                    maximumAge: 0
                                }
                            );
                        } else {
                            const center = map.getCenter();
                            calculateRoute({ lat: center.lat, lng: center.lng }, { lat, lng });
                            showMessage('Geolocation not available, using map center');
                        }
                    }
                    
                    // Calculate route
                    function calculateRoute(start, destination) {
                        vscode.postMessage({
                            command: 'getDirections',
                            start: start,
                            destination: destination,
                            mode: currentTravelMode
                        });
                    }
                    
                    // Show directions on map
                    function showDirections(directions) {
                        hideLoading();
                        
                        if (!directions) {
                            document.getElementById('routeInfo').innerHTML = 'Route calculation failed';
                            return;
                        }
                        
                        // Clear previous route
                        if (routeLine) {
                            map.removeLayer(routeLine);
                        }
                        
                        // Display route info
                        document.getElementById('routeInfo').innerHTML = \`
                            <div class="route-distance">Distance: \${directions.distance}</div>
                            <div class="route-duration">Duration: \${directions.duration}</div>
                            <div>Mode: \${directions.mode}</div>
                        \`;
                        
                        // Draw route line
                        if (directions.geometry) {
                            routeLine = L.geoJSON(directions.geometry, {
                                style: {
                                    color: '#4285f4',
                                    weight: 6,
                                    opacity: 0.8
                                }
                            }).addTo(map);
                            
                            // Fit map to show entire route
                            map.fitBounds(routeLine.getBounds());
                        }
                    }
                    
                    // UI Controls
                    function toggleCategories() {
                        const panel = document.getElementById('categoriesPanel');
                        panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
                    }
                    
                    function closeCategories() {
                        document.getElementById('categoriesPanel').style.display = 'none';
                    }
                    
                    function closePlacesPanel() {
                        document.getElementById('placesPanel').style.display = 'none';
                    }
                    
                    function closeDirections() {
                        document.getElementById('directionsPanel').style.display = 'none';
                        if (routeLine) {
                            map.removeLayer(routeLine);
                        }
                    }
                    
                    function setTravelMode(mode) {
                        currentTravelMode = mode;
                        // Update active button
                        document.querySelectorAll('.mode-btn').forEach(btn => {
                            btn.classList.toggle('active', btn.textContent.includes(mode === 'driving' ? 'Drive' : mode === 'walking' ? 'Walk' : 'Bike'));
                        });
                    }
                    
                    function zoomIn() {
                        map.zoomIn();
                    }
                    
                    function zoomOut() {
                        map.zoomOut();
                    }
                    
                    function focusOnPlace(lat, lng, name) {
                        map.setView([lat, lng], 15);
                        showMessage(\`Focused on: \${name}\`);
                    }
                    
                    // Utility functions
                    function clearMarkers() {
                        markers.forEach(marker => map.removeLayer(marker));
                        markers = [];
                    }
                    
                    function showLoading(message = 'Loading...') {
                        const loading = document.getElementById('loading');
                        loading.innerHTML = \`<i class="fas fa-spinner fa-spin"></i> \${message}\`;
                        loading.style.display = 'block';
                    }
                    
                    function hideLoading() {
                        document.getElementById('loading').style.display = 'none';
                    }
                    
                    function showMessage(text) {
                        vscode.postMessage({
                            command: 'showInfo',
                            text: text
                        });
                    }
                    
                    function getCategoryName(category) {
                        const names = {
                            restaurant: 'Restaurants',
                            hotel: 'Hotels',
                            attraction: 'Attractions',
                            shopping: 'Shopping',
                            hospital: 'Medical',
                            transport: 'Transport',
                            park: 'Parks',
                            temple: 'Temples',
                            market: 'Markets'
                        };
                        return names[category] || 'Places';
                    }
                    
                    // Handle messages from VS Code
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'searchResults':
                                showSearchResults(message.results);
                                break;
                            case 'showNearbyPlaces':
                                showNearbyPlaces(message.places, message.category);
                                break;
                            case 'showDirections':
                                showDirections(message.directions);
                                break;
                            case 'exactLocationResult':
                                setCurrentLocation(
                                    message.location.lat, 
                                    message.location.lng, 
                                    message.location.name,
                                    message.accuracy === 'exact'
                                );
                                if (message.message) {
                                    showMessage(message.message);
                                }
                                break;
                            case 'exactLocationError':
                                hideLoading();
                                setCurrentLocation(28.6139, 77.2090, 'New Delhi, India (Default)', false);
                                showMessage(message.error);
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