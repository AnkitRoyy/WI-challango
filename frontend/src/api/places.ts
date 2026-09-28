import { apiClient } from "./client";

export interface PlaceSuggestion {
  display_name: string;
  lat: string | number;
  lon: string | number;
}

export async function searchPlacesApi(query: string): Promise<PlaceSuggestion[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }
  try {
    const response = await apiClient.get<PlaceSuggestion[]>("/places/search", {
      params: { q: query.trim() },
    });
    const items = response.data || [];
    const seen = new Set<string>();
    const unique: PlaceSuggestion[] = [];
    for (const item of items) {
      const name = item.display_name?.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        unique.push({
          display_name: name,
          lat: item.lat,
          lon: item.lon,
        });
      }
    }
    return unique;
  } catch {
    // Graceful fallback: return empty list on network or proxy issues
    return [];
  }
}
