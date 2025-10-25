import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class MapApiManager {
    private cachePath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.cachePath = path.join(context.globalStorageUri.fsPath, 'map-cache');
        this.initializeCache();
    }

    private initializeCache(): void {
        if (!fs.existsSync(this.cachePath)) {
            fs.mkdirSync(this.cachePath, { recursive: true });
        }
    }

    public async searchLocation(query: string): Promise<any[]> {
        const config = vscode.workspace.getConfiguration('offlineMap');
        const offlineMode = config.get('offlineMode', false);

        if (offlineMode) {
            return this.searchOfflineLocations(query);
        }

        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10`;
            const response = await fetch(url);
            const data = await response.json();
            
            // Cache the results
            this.cacheSearchResults(query, data);
            
            return data.map((item: any) => ({
                name: item.display_name,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
                type: item.type
            }));
        } catch (error) {
            console.error('Search API failed:', error);
            return this.searchOfflineLocations(query);
        }
    }

    private searchOfflineLocations(query: string): any[] {
        const bangaloreLocations = this.getBangaloreLocations();
        return bangaloreLocations.filter(location => 
            location.name.toLowerCase().includes(query.toLowerCase()) ||
            location.description?.toLowerCase().includes(query.toLowerCase())
        );
    }

    private cacheSearchResults(query: string, results: any[]): void {
        const cacheKey = `search_${Buffer.from(query).toString('base64')}`;
        const cacheFile = path.join(this.cachePath, `${cacheKey}.json`);
        
        const cacheData = {
            results,
            timestamp: Date.now()
        };
        
        fs.writeFileSync(cacheFile, JSON.stringify(cacheData));
    }

    private getBangaloreLocations(): any[] {
        return [
            {
                name: "Vidhana Soudha, Bangalore",
                lat: 12.9794,
                lng: 77.5907,
                type: "landmark",
                description: "Legislative building of Karnataka"
            },
            {
                name: "Cubbon Park, Bangalore",
                lat: 12.9764,
                lng: 77.5927,
                type: "park",
                description: "Large public park in Bangalore"
            },
            {
                name: "Lalbagh Botanical Garden, Bangalore",
                lat: 12.9507,
                lng: 77.5848,
                type: "park",
                description: "Famous botanical garden with glass house"
            },
            {
                name: "Bangalore Palace",
                lat: 12.9988,
                lng: 77.5923,
                type: "landmark",
                description: "Tudor-style palace inspired by Windsor Castle"
            },
            {
                name: "Commercial Street, Bangalore",
                lat: 12.9812,
                lng: 77.6084,
                type: "shopping",
                description: "Popular shopping destination"
            },
            {
                name: "MG Road, Bangalore",
                lat: 12.9716,
                lng: 77.5946,
                type: "shopping",
                description: "Main commercial street in Bangalore"
            },
            {
                name: "ISKCON Temple, Bangalore",
                lat: 13.0105,
                lng: 77.5511,
                type: "temple",
                description: "Hare Krishna temple"
            }
        ];
    }

    public clearCache(): void {
        if (fs.existsSync(this.cachePath)) {
            const files = fs.readdirSync(this.cachePath);
            for (const file of files) {
                fs.unlinkSync(path.join(this.cachePath, file));
            }
        }
    }
}