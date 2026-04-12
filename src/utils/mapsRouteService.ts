import { Nurse, RouteSuggestion, ScheduledVisit } from '../types';
import { AREA_COORDS, extractAreaName } from './calendar';
import { isDemoMode } from '../services/appEnv';
import { buildFallbackRouteSuggestion } from './scheduler';

type LatLng = { lat: number; lng: number };

const GEOCODE_CACHE_KEY = 'visit-calendar-geocode-cache';

function mapsApiKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

function loadGeocodeCache(): Record<string, LatLng> {
  try {
    return JSON.parse(window.localStorage.getItem(GEOCODE_CACHE_KEY) || '{}') as Record<string, LatLng>;
  } catch {
    return {};
  }
}

function saveGeocodeCache(cache: Record<string, LatLng>) {
  try {
    window.localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // noop
  }
}

function normalizeAddressKey(address: string): string {
  return address.replace(/\s+/g, ' ').trim();
}

function fallbackCoordsFromAddress(address: string): LatLng | null {
  const area = extractAreaName(address);
  const coords = AREA_COORDS[area];
  return coords ? { lat: coords.lat, lng: coords.lng } : null;
}

async function geocodeAddress(address: string, apiKey: string): Promise<LatLng | null> {
  const normalized = normalizeAddressKey(address);
  if (!normalized) return null;
  const cache = loadGeocodeCache();
  if (cache[normalized]) return cache[normalized];

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(normalized)}&key=${apiKey}`);
    if (!response.ok) return fallbackCoordsFromAddress(normalized);
    const data = await response.json();
    const location = data.results?.[0]?.geometry?.location;
    if (!location) return fallbackCoordsFromAddress(normalized);
    const latLng = { lat: Number(location.lat), lng: Number(location.lng) } satisfies LatLng;
    cache[normalized] = latLng;
    saveGeocodeCache(cache);
    return latLng;
  } catch {
    return fallbackCoordsFromAddress(normalized);
  }
}

function haversineKm(aArea: string, bArea: string): number {
  const a = AREA_COORDS[aArea];
  const b = AREA_COORDS[bArea];
  if (!a || !b) return aArea === bArea ? 0 : 8;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

function buildDemoRouteSuggestion(nurse: Nurse, dateKey: string, visits: ScheduledVisit[]): RouteSuggestion | null {
  const remaining = visits.filter((visit) => visit.nurseId === nurse.id && visit.dateKey === dateKey);
  if (!remaining.length) return null;

  const ordered: ScheduledVisit[] = [];
  let currentArea = extractAreaName(nurse.address || nurse.areas[0] || remaining[0].area) || remaining[0].area;
  let totalDistanceKm = 0;
  let totalDurationMinutes = 0;
  const pool = [...remaining];

  while (pool.length) {
    pool.sort((a, b) => haversineKm(currentArea, a.area) - haversineKm(currentArea, b.area) || a.startMinutes - b.startMinutes);
    const next = pool.shift() as ScheduledVisit;
    const km = haversineKm(currentArea, next.area);
    const minutes = Math.round((km / 28) * 60);
    totalDistanceKm += km;
    totalDurationMinutes += minutes;
    ordered.push({
      ...next,
      routeOrder: ordered.length + 1,
      estimatedTravelKm: Number(km.toFixed(1)),
      estimatedTravelMinutes: minutes
    });
    currentArea = next.area;
  }

  return {
    nurseId: nurse.id,
    nurseName: nurse.name,
    dateKey,
    orderedVisits: ordered,
    totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
    totalDurationMinutes,
    provider: 'demo'
  };
}

export async function suggestOptimizedRoute(
  nurse: Nurse,
  dateKey: string,
  visits: ScheduledVisit[]
): Promise<RouteSuggestion | null> {
  const fallback = buildFallbackRouteSuggestion(nurse, dateKey, visits);
  const apiKey = mapsApiKey();
  const nurseVisits = visits.filter((visit) => visit.nurseId === nurse.id && visit.dateKey === dateKey);
  if (isDemoMode()) return buildDemoRouteSuggestion(nurse, dateKey, visits) ?? fallback;
  if (!apiKey || nurseVisits.length <= 1) return fallback;

  try {
    const sorted = [...nurseVisits].sort((a, b) => a.startMinutes - b.startMinutes);
    const originAddress = normalizeAddressKey(nurse.address || sorted[0].address || nurse.areas[0] || sorted[0].area);
    const originCoords = await geocodeAddress(originAddress, apiKey);
    if (!originCoords) return fallback;

    const visitCoords = await Promise.all(sorted.map(async (visit) => {
      const resolved = await geocodeAddress(visit.address || visit.area, apiKey);
      return resolved ?? originCoords;
    }));

    const payload = {
      origin: { location: { latLng: { latitude: originCoords.lat, longitude: originCoords.lng } } },
      destination: { location: { latLng: { latitude: originCoords.lat, longitude: originCoords.lng } } },
      intermediates: visitCoords.map((coord) => ({
        location: { latLng: { latitude: coord.lat, longitude: coord.lng } }
      })),
      travelMode: 'DRIVE',
      optimizeWaypointOrder: true,
      routingPreference: 'TRAFFIC_AWARE'
    };

    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) return fallback;
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return fallback;

    const order: number[] = route.optimizedIntermediateWaypointIndex ?? sorted.map((_: unknown, index: number) => index);
    const legs = route.legs ?? [];
    const orderedVisits = order.map((index, routeIndex) => ({
      ...sorted[index],
      routeOrder: routeIndex + 1,
      estimatedTravelKm: Number((((legs[routeIndex]?.distanceMeters ?? 0) as number) / 1000).toFixed(1)),
      estimatedTravelMinutes: Math.round(Number(String(legs[routeIndex]?.duration ?? '0s').replace('s', '')) / 60)
    }));

    return {
      nurseId: nurse.id,
      nurseName: nurse.name,
      dateKey,
      orderedVisits,
      totalDistanceKm: Number(((route.distanceMeters ?? 0) / 1000).toFixed(1)),
      totalDurationMinutes: Math.round(Number(String(route.duration ?? '0s').replace('s', '')) / 60),
      provider: 'google-maps'
    };
  } catch {
    return fallback;
  }
}
