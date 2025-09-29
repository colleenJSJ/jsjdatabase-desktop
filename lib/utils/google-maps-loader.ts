import { Loader } from '@googlemaps/js-api-loader';

class GoogleMapsLoaderSingleton {
  private static instance: GoogleMapsLoaderSingleton;
  private loader: Loader | null = null;
  private loadPromise: Promise<typeof google> | null = null;

  private constructor() {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      console.error('Google Maps API key not found');
      return;
    }

    this.loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places'],
      // Prevent multiple warning by using same id
      id: 'google-maps-script'
    });
  }

  public static getInstance(): GoogleMapsLoaderSingleton {
    if (!GoogleMapsLoaderSingleton.instance) {
      GoogleMapsLoaderSingleton.instance = new GoogleMapsLoaderSingleton();
    }
    return GoogleMapsLoaderSingleton.instance;
  }

  public async load(): Promise<typeof google> {
    if (!this.loader) {
      throw new Error('Google Maps loader not initialized - API key missing');
    }

    // If already loading or loaded, return the same promise
    if (!this.loadPromise) {
      this.loadPromise = this.loader.load();
    }

    return this.loadPromise;
  }

  public isLoaded(): boolean {
    return typeof google !== 'undefined' && 
           typeof google.maps !== 'undefined' &&
           typeof google.maps.places !== 'undefined';
  }
}

// Export singleton instance methods
export const googleMapsLoader = {
  load: () => GoogleMapsLoaderSingleton.getInstance().load(),
  isLoaded: () => GoogleMapsLoaderSingleton.getInstance().isLoaded()
};