import { Nurse, RouteSuggestion, ScheduledVisit } from '../types';
import { AREA_COORDS } from './calendar';
import { isDemoMode } from '../services/appEnv';
import { buildFallbackRouteSuggestion } from './scheduler';

function mapsApiKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
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
  let currentArea = nurse.areas[0] ?? remaining[0].area;
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
    const originArea = nurse.areas[0] ?? sorted[0].area;
    const origin = AREA_COORDS[originArea];
    if (!origin) return fallback;

    const payload = {
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      intermediates: sorted.map((visit) => {
        const coord = AREA_COORDS[visit.area] ?? origin;
        return { location: { latLng: { latitude: coord.lat, longitude: coord.lng } } };
      }),
      travelMode: 'DRIVE',
      optimizeWaypointOrder: true
    };

    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) return fallback;
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return fallback;

    const order: number[] = route.optimizedIntermediateWaypointIndex ?? sorted.map((_: unknown, index: number) => index);
    const orderedVisits = order.map((index, routeIndex) => ({
      ...sorted[index],
      routeOrder: routeIndex + 1
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
