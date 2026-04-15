/**
 * Geocode a location string to lat/lng using Nominatim (free, no API key needed)
 */
export async function geocodeLocation(locationStr) {
  if (!locationStr) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationStr)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ZyncJobs/1.0 (job portal)', 'Accept-Language': 'en' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data[0]) {
      return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.error('Geocode error for:', locationStr, err.message);
  }
  return null;
}

/**
 * Haversine formula — distance in miles between two lat/lng points
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
