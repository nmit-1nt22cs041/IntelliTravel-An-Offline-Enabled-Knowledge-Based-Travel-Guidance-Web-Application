import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface Place {
    name: string;
    lat: number;
    lng: number;
    type: string;
    address?: string;
    rating?: number;
    description?: string;
    category?: string;
}

export class MapApiManager {
    private cachePath: string;
    private searchCache: Map<string, { data: Place[], timestamp: number }> = new Map();
    private readonly indiaBounds = {
        north: 37.6, south: 6.0, east: 97.4, west: 68.1
    };

    constructor(private context: vscode.ExtensionContext) {
        this.cachePath = path.join(context.globalStorageUri.fsPath, 'map-cache');
        this.initializeCache();
    }

    private initializeCache(): void {
        if (!fs.existsSync(this.cachePath)) {
            fs.mkdirSync(this.cachePath, { recursive: true });
        }
    }

    public async searchLocation(query: string): Promise<Place[]> {
        // Check cache first
        const cacheKey = query.toLowerCase().trim();
        const cached = this.searchCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 300000) { // 5 minutes cache
            return cached.data;
        }

        try {
            // Add India bias for better results
            const indiaBiasedQuery = this.addIndiaBias(query);
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(indiaBiasedQuery)}&limit=10&addressdetails=1&accept-language=en&countrycodes=in`;
            
            // Fast timeout - 2 seconds for India-focused search
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            
            const data = await response.json();
            
            // Filter and prioritize Indian locations
            let results = data.map((item: any) => ({
                name: this.cleanName(item.display_name),
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
                type: item.type || item.class || 'place',
                category: item.class,
                description: this.generateDescription(item),
                isIndian: this.isLocationInIndia(parseFloat(item.lat), parseFloat(item.lon))
            }));

            // Prioritize Indian locations
            results.sort((a: any, b: any) => {
                if (a.isIndian && !b.isIndian) return -1;
                if (!a.isIndian && b.isIndian) return 1;
                return 0;
            });

            // Take top 8 results
            const finalResults = results.slice(0, 8).map((item: any) => {
                const { isIndian, ...rest } = item;
                return rest;
            });

            // Cache the results
            this.searchCache.set(cacheKey, { data: finalResults, timestamp: Date.now() });
            return finalResults;

        } catch (error) {
            console.error('Search API failed, using India fallback:', error);
            return this.getIndiaFallbackLocations(query);
        }
    }

    public async getNearbyPlaces(lat: number, lng: number, category: string): Promise<Place[]> {
        // Return instantly with India-specific simulated data
        return this.generateIndiaSpecificPlaces(lat, lng, category);
    }

    public async getDirections(start: { lat: number; lng: number }, end: { lat: number; lng: number }, mode: string = 'driving'): Promise<any> {
        try {
            const url = `https://router.project-osrm.org/route/v1/${mode}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000); // Faster timeout
            
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            
            const data = await response.json();
            
            if (data.routes && data.routes.length > 0) {
                return {
                    distance: (data.routes[0].distance / 1000).toFixed(1) + ' km',
                    duration: Math.round(data.routes[0].duration / 60) + ' min',
                    geometry: data.routes[0].geometry,
                    mode: mode
                };
            }
            return null;
        } catch (error) {
            console.error('Directions API failed:', error);
            return this.calculateOfflineDirections(start, end, mode);
        }
    }

    public getPlaceCategories(): { id: string; name: string; icon: string }[] {
        return [
            { id: 'restaurant', name: 'Restaurants', icon: '🍽️' },
            { id: 'hotel', name: 'Hotels', icon: '🏨' },
            { id: 'attraction', name: 'Attractions', icon: '🏛️' },
            { id: 'shopping', name: 'Shopping', icon: '🛍️' },
            { id: 'hospital', name: 'Medical', icon: '🏥' },
            { id: 'transport', name: 'Transport', icon: '🚆' },
            { id: 'park', name: 'Parks', icon: '🌳' },
            { id: 'temple', name: 'Temples', icon: '🛕' },
            { id: 'market', name: 'Markets', icon: '🏪' }
        ];
    }

    private addIndiaBias(query: string): string {
        const indianCities = ['delhi', 'mumbai', 'chennai', 'kolkata', 'bangalore', 'hyderabad', 
                             'pune', 'ahmedabad', 'jaipur', 'lucknow', 'bengaluru', 'gurgaon', 
                             'noida', 'kochi', 'goa', 'chandigarh', 'indore', 'bhopal'];
        
        const lowerQuery = query.toLowerCase();
        const isIndianCity = indianCities.some(city => lowerQuery.includes(city));
        
        if (!isIndianCity && !lowerQuery.includes('india') && query.length > 2) {
            return query + ', India';
        }
        return query;
    }

    private isLocationInIndia(lat: number, lng: number): boolean {
        return lat >= this.indiaBounds.south && lat <= this.indiaBounds.north && 
               lng >= this.indiaBounds.west && lng <= this.indiaBounds.east;
    }

    private cleanName(displayName: string): string {
        // Extract only the main name parts, optimized for Indian addresses
        const parts = displayName.split(',');
        
        if (parts.length > 3) {
            // For Indian addresses, typically take first part and last part (city/state)
            return `${parts[0].trim()}, ${parts[parts.length - 2].trim()}`;
        }
        
        return displayName;
    }

    private generateDescription(item: any): string {
        const type = item.type || item.class || 'location';
        const address = item.address;
        
        if (address) {
            // Generate Indian-style description
            if (address.city && address.state) {
                return `${this.capitalize(type)} • ${address.city}, ${address.state}`;
            } else if (address.state) {
                return `${this.capitalize(type)} • ${address.state}`;
            }
        }
        
        const parts = item.display_name.split(',');
        if (parts.length >= 2) {
            return `${this.capitalize(type)} • ${parts[parts.length - 2].trim()}`;
        }
        
        return `${this.capitalize(type)} • Area`;
    }

    private generateIndiaSpecificPlaces(lat: number, lng: number, category: string): Place[] {
        const indiaPlaces: { [key: string]: { names: string[], descriptions: string[] } } = {
            restaurant: {
                names: ['Saravana Bhavan', 'Bikanervala', 'Haldiram\'s', 'Local Dhaba', 'Udipi Restaurant', 'Paradise Biryani', 'KFC', 'McDonald\'s'],
                descriptions: ['South Indian Restaurant', 'North Indian Cuisine', 'Sweet Shop & Restaurant', 'Highway Dhaba', 'Vegetarian Restaurant', 'Hyderabadi Restaurant', 'Fast Food Chain', 'American Fast Food']
            },
            hotel: {
                names: ['Taj Hotel', 'ITC Grand', 'The Leela', 'Radisson Blu', 'Novotel', 'OYO Rooms', 'FabHotel', 'Treebo'],
                descriptions: ['Luxury 5-Star Hotel', 'Business Hotel', 'Premium Hotel', 'International Chain', 'Modern Hotel', 'Budget Hotel', 'Value Hotel', 'Economy Stay']
            },
            attraction: {
                names: ['Historical Fort', 'Ancient Temple', 'City Palace', 'Museum', 'Botanical Garden', 'Lake View', 'Heritage Site', 'Public Square'],
                descriptions: ['Historical Monument', 'Religious Site', 'Royal Palace', 'Cultural Museum', 'Nature Park', 'Scenic Spot', 'UNESCO Heritage', 'Public Gathering Place']
            },
            shopping: {
                names: ['DLF Mall', 'Phoenix Marketcity', 'Forum Mall', 'Local Bazaar', 'Supermarket', 'Brand Showroom', 'Shopping Complex', 'Department Store'],
                descriptions: ['Premium Shopping Mall', 'Large Retail Complex', 'Modern Mall', 'Traditional Market', 'Grocery Store', 'Brand Outlet', 'Shopping Center', 'Retail Store']
            },
            hospital: {
                names: ['Apollo Hospital', 'Fortis Hospital', 'Max Healthcare', 'AIIMS', 'Government Hospital', 'Private Clinic', 'Medical Center', 'Nursing Home'],
                descriptions: ['Multi-specialty Hospital', 'Super-specialty Hospital', 'Healthcare Chain', 'Government Hospital', 'Public Hospital', 'Private Clinic', 'Medical Facility', 'Healthcare Center']
            },
            transport: {
                names: ['Metro Station', 'Bus Stand', 'Railway Station', 'Auto Stand', 'Taxi Stand', 'Rickshaw Stand', 'Parking Lot', 'Transit Hub'],
                descriptions: ['Metro Rail Station', 'Bus Terminal', 'Indian Railways Station', 'Auto Rickshaw Stand', 'Taxi Pickup', 'Rickshaw Stop', 'Vehicle Parking', 'Transport Center']
            },
            park: {
                names: ['City Park', 'Children\'s Park', 'Garden', 'Public Ground', 'Recreation Area', 'Walking Track', 'Playground', 'Green Space'],
                descriptions: ['Public Park', 'Kids Play Area', 'Botanical Garden', 'Open Ground', 'Sports Area', 'Jogging Track', 'Play Area', 'Green Zone']
            },
            temple: {
                names: ['Shiva Temple', 'Hanuman Temple', 'Krishna Temple', 'Durga Temple', 'Ganesh Temple', 'Local Temple', 'Ancient Temple', 'ISKCON Temple'],
                descriptions: ['Hindu Temple', 'Religious Shrine', 'Place of Worship', 'Goddess Temple', 'Elephant God Temple', 'Community Temple', 'Historical Temple', 'Spiritual Center']
            },
            market: {
                names: ['Local Market', 'Vegetable Market', 'Street Market', 'Flea Market', 'Wholesale Market', 'Night Market', 'Shopping Street', 'Commercial Area'],
                descriptions: ['Local Bazaar', 'Fresh Produce Market', 'Street Shopping', 'Flea Market', 'Wholesale Area', 'Evening Market', 'Shopping District', 'Commercial Zone']
            }
        };

        const placeData = indiaPlaces[category] || { 
            names: ['Local Place'], 
            descriptions: ['Point of Interest'] 
        };

        const places: Place[] = [];

        for (let i = 0; i < 8; i++) {
            const offsetLat = (Math.random() - 0.5) * 0.01; // Smaller offset for denser Indian cities
            const offsetLng = (Math.random() - 0.5) * 0.01;
            
            places.push({
                name: placeData.names[i % placeData.names.length],
                lat: lat + offsetLat,
                lng: lng + offsetLng,
                type: category,
                address: this.generateIndianAddress(),
                rating: parseFloat((Math.random() * 2 + 3).toFixed(1)), // 3-5 stars
                description: placeData.descriptions[i % placeData.descriptions.length],
                category: category
            });
        }
        
        return places;
    }

    private generateIndianAddress(): string {
        const streets = ['MG Road', 'Brigade Road', 'Connaught Place', 'Park Street', 'Commercial Street', 'Juhu Beach', 'Marine Drive'];
        const areas = ['City Center', 'Commercial Area', 'Residential Area', 'Market Area', 'Suburban Area'];
        
        return `${streets[Math.floor(Math.random() * streets.length)]}, ${areas[Math.floor(Math.random() * areas.length)]}`;
    }

    private getIndiaFallbackLocations(query: string): Place[] {
        const majorIndianCities = [
            { name: "Delhi, India", lat: 28.6139, lng: 77.2090, type: "city", description: "Capital of India" },
            { name: "Mumbai, India", lat: 19.0760, lng: 72.8777, type: "city", description: "Financial capital of India" },
            { name: "Bengaluru, India", lat: 12.9716, lng: 77.5946, type: "city", description: "Silicon Valley of India" },
            { name: "Chennai, India", lat: 13.0827, lng: 80.2707, type: "city", description: "Capital of Tamil Nadu" },
            { name: "Kolkata, India", lat: 22.5726, lng: 88.3639, type: "city", description: "Cultural capital of India" },
            { name: "Hyderabad, India", lat: 17.3850, lng: 78.4867, type: "city", description: "City of Pearls" },
            { name: "Pune, India", lat: 18.5204, lng: 73.8567, type: "city", description: "Oxford of the East" },
            { name: "Ahmedabad, India", lat: 23.0225, lng: 72.5714, type: "city", description: "Manchester of India" },
            { name: "Jaipur, India", lat: 26.9124, lng: 75.7873, type: "city", description: "Pink City of India" },
            { name: "Lucknow, India", lat: 26.8467, lng: 80.9462, type: "city", description: "City of Nawabs" },
            { name: "Kochi, India", lat: 9.9312, lng: 76.2673, type: "city", description: "Queen of Arabian Sea" },
            { name: "Goa, India", lat: 15.2993, lng: 74.1240, type: "city", description: "Beach paradise" }
        ];

        const searchTerm = query.toLowerCase().trim();
        
        if (!searchTerm) {
            return majorIndianCities.slice(0, 8);
        }

        // Exact matches first
        const exactMatches = majorIndianCities.filter(location => 
            location.name.toLowerCase().includes(searchTerm)
        );

        // Partial matches
        const partialMatches = majorIndianCities.filter(location => 
            location.description.toLowerCase().includes(searchTerm) &&
            !exactMatches.includes(location)
        );

        // Combine and return
        const allMatches = [...exactMatches, ...partialMatches];
        return allMatches.length > 0 ? allMatches.slice(0, 8) : majorIndianCities.slice(0, 4);
    }

    private calculateOfflineDirections(start: { lat: number; lng: number }, end: { lat: number; lng: number }, mode: string): any {
        const distance = this.calculateHaversineDistance(start.lat, start.lng, end.lat, end.lng);
        const duration = this.calculateIndiaTravelTime(distance, mode);
        
        // Generate a more realistic route geometry for India
        const midPoint = {
            lat: (start.lat + end.lat) / 2 + (Math.random() - 0.5) * 0.01,
            lng: (start.lng + end.lng) / 2 + (Math.random() - 0.5) * 0.01
        };
        
        return {
            distance: distance.toFixed(1) + ' km',
            duration: duration + ' min',
            geometry: {
                type: "LineString",
                coordinates: [
                    [start.lng, start.lat],
                    [midPoint.lng, midPoint.lat],
                    [end.lng, end.lat]
                ]
            },
            mode: mode
        };
    }

    private calculateIndiaTravelTime(distance: number, mode: string): number {
        // Adjusted for typical Indian traffic conditions
        const speeds = { 
            driving: 40, // Slower due to traffic
            walking: 4,  // Slower walking pace
            cycling: 12  // Moderate cycling speed
        };
        const trafficFactor = mode === 'driving' ? 1.3 : 1; // Add traffic buffer for driving
        return Math.round((distance / speeds[mode as keyof typeof speeds]) * 60 * trafficFactor);
    }

    private calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    private toRad(degrees: number): number {
        return degrees * (Math.PI / 180);
    }

    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    public clearCache(): void {
        this.searchCache.clear();
        if (fs.existsSync(this.cachePath)) {
            const files = fs.readdirSync(this.cachePath);
            for (const file of files) {
                fs.unlinkSync(path.join(this.cachePath, file));
            }
        }
    }

    // New method to get approximate current location for India
    public getApproximateIndiaLocation(): { lat: number; lng: number; name: string; accuracy: string } {
        const majorCities = [
            { lat: 28.6139, lng: 77.2090, name: 'New Delhi, India' },
            { lat: 19.0760, lng: 72.8777, name: 'Mumbai, India' },
            { lat: 12.9716, lng: 77.5946, name: 'Bengaluru, India' },
            { lat: 13.0827, lng: 80.2707, name: 'Chennai, India' },
            { lat: 22.5726, lng: 88.3639, name: 'Kolkata, India' }
        ];
        
        // Return a random major city as approximate location
        const randomCity = majorCities[Math.floor(Math.random() * majorCities.length)];
        return {
            ...randomCity,
            accuracy: 'city'
        };
    }
}