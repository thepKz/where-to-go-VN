import type { Place, Point, Where, Group, Mark, Pick, Round, Dish, City, Area } from '../store/types'
export interface SuggestOptions { group?: Group; where?: Where; origin?: Point | null; areaId?: string | null; now?: string | Date | number; marks?: Mark[]; picks?: Pick[]; exclude?: string[]; seed?: string | number; history?: string[] }
export function distanceMeters(from: Point | null, to: { lat: number | null; lng: number | null }): number | null
export const haversine: typeof distanceMeters
export function roundDistance(meters: number | null, accuracy?: string): number | null
export function mapTarget(place: Place, areas?: { id: string; lat: number; lng: number }[]): { lat: number; lng: number; areaId: string | null } | null
export function isOpen(hours: Place['hours'], now: string | Date | number): boolean
export function vietnamTime(now: string | Date | number): Date
export function defaultGroup(now: string | Date | number): Group
export function hashSeed(seed: string | number): number
export function seededRandom(seed: string | number): () => number
export function normalizeWhere(where: Where): Where
export function roundSeed(options: { householdId: string; group: Group; where: Where; now: string | Date | number; seed?: string | number; iteration?: number }): number
export function findRound(rounds: Round[], options: { householdId: string; group: Group; where: Where; now: string | Date | number }): Round | null
export function eligiblePlaces(places: Place[], options: SuggestOptions): Place[]
export function suggest(options: SuggestOptions & {places: Place[]}): {places: Place[]; radiusKm: number | null}
export function pickDish(options: SuggestOptions & {dishes: Dish[]; places: Place[]}): { dish: Dish | null; places: Place[]; rerollsLeft?: number; history?: string[] }
export function formatDistance(meters: number | null, accuracy?: string): string
export function formatDate(value: string | Date | number): string
export function aroundAreaName(name: string | null | undefined): string
export function formatTime(value: string): string
export function formatHours(hours: Place['hours']): string
export function capitalizeFirst(value: string | null | undefined): string
export function foldText(value: string | null | undefined): string
export function sameDishKind(left: string | null | undefined, right: string | null | undefined): boolean
export function areaNamesLine(names: string[], count: number, fits?: boolean): string
export function formatAreaInsideCount(count: number, unit?: string): string
export function directionsUrl(place: { geo?: string; lat?: number | null; lng?: number | null; mapsUrl: string }): string
export function formatOpenStatus(hours: Place['hours'] | undefined, now: string | Date | number): string
export function formatTextHoursStatus(hoursText: string | null | undefined, now: string | Date | number): string
export function formatAreaCount(count: number, unit?: string): string
export function siteName(source: { site?: string | null; url?: string }): string
export function placeKind(place: { kind?: string | null; group?: string } | null | undefined): string
export function dishList(place: { dishNotes?: string[] } | null | undefined, limit?: number): string[]
export function kindLine(place: { kind?: string | null; group?: string; dishNotes?: string[] } | null | undefined, options?: { dishes?: boolean }): { kind: string; dishes: string | null }
export function mainReason(dish: { name?: string } | null | undefined, place: { name?: string; kind?: string | null; dishNotes?: string[] } | null | undefined): 'a' | 'b' | 'c' | null
export function isMainPlaceOf(dish: { name?: string } | null | undefined, place: { name?: string; kind?: string | null; dishNotes?: string[] } | null | undefined): boolean
export function latestChecked(sources: { checked?: string }[] | undefined, fallback?: string | null): string | null
export function orderSources<T extends { verified?: string }>(sources: T[] | undefined): T[]
export function isChecked(source: { verified?: string } | null | undefined): boolean
export function otherProgress(options: { members: { id: string }[]; votes: { member_id: string; place_id: string }[]; placeIds: string[]; myId: string }): { id: string; count: number; state: 'none' | 'swiping' | 'done' } | null
export function otherLikers(options: { votes: { member_id: string; place_id: string; like: boolean }[]; placeId: string; myId: string }): string[]
export function placeDistance(origin: Point | null | undefined, place: { geo?: string; lat: number | null; lng: number | null } | null | undefined): number | null
export function sortByDistance<T>(list: T[], origin: Point | null | undefined, placeOf: (item: T) => Place, tie?: (left: T, right: T) => number): T[]
export function areaRows(areas: { id: string; name: string; lat: number; lng: number }[], places: { areaId: string | null; status: string }[], origin: Point | null | undefined): { area: any; count: number; meters: number | null }[]
export type Standing = { lat: number; lng: number; kind: 'khu' | 'cham'; areaId?: string }
export function standingFromArea(area: { id: string; lat: number; lng: number } | null | undefined): Standing | null
export function standingFromTap(point: Point | null | undefined): Standing | null
export function readStanding(raw: unknown): Standing | null
export function writeStanding(standing: Standing | null): string
export function pickOrigin(real: Point | null | undefined, standing: Point | null | undefined): Point | null
export function viewOrigin(real: Point | null | undefined, where: Where): Point
export function canAskLocation(state: { secure: boolean; hasApi: boolean }): boolean
export function rememberBefore(where: Where, remembered: string | null | undefined): string | null
export function afterClear(state: { where: Where; before: string | null }): { where: Where; failed: boolean }
export const CITY_CENTERS: Readonly<Record<City, Point>>
export const HO_GUOM: Point
export function rememberArea(list: string[] | null | undefined, id: string, max?: number): string[]
export function readUsedAreas(raw: unknown): string[]
export function standingAreaOrder<T extends { id: string; name: string; lat: number; lng: number }>(areas: T[], used?: string[], from?: Point): T[]
export interface NearSummary { count: number; nearest: Place[]; area: { id: string; name: string; lat: number; lng: number } | null; areaMeters: number | null }
export function nearSummary(options: { origin: Point | null | undefined; places: Place[]; areas: { id: string; name: string; lat: number; lng: number }[]; radius?: number; reach?: number }): NearSummary
export function framePoints(origin: Point | null | undefined, summary: NearSummary): Point[]
export function mapCityBounds(options?: { places?: Pick<Place, 'lat' | 'lng'>[]; areas?: Pick<Area, 'lat' | 'lng'>[]; padding?: number }): { south: number; west: number; north: number; east: number } | null
export function shouldShowPlacePin(place: { areaId?: string | null } | null | undefined, zoom: number, threshold?: number): boolean
export function isMapTap(start: { x: number; y: number } | null | undefined, end: { x: number; y: number } | null | undefined, threshold?: number): boolean
export function selectCollapsedAreaPins(boxes: { id: string; count: number; left: number; top: number; width: number; height: number }[], collapsedSize?: number): string[]
export function filterMapPlacesInBounds<T>(places: T[], bounds: { south: number; west: number; north: number; east: number } | null, targetOf?: (place: T) => { lat: number; lng: number; areaId?: string | null } | null, zoom?: number): T[]
export function allDishes(place: { dishNotes?: string[] } | null | undefined): string[]
export function detailDishes(place: { kind?: string | null; dishNotes?: string[] } | null | undefined): string[]
export function floorLabel(value: string | null | undefined): string
export function placeNameInArea(place: { name?: string | null } | null | undefined, area: { name?: string | null } | null | undefined): string
export function detailLocation(place: { address?: string | null; floor?: string | null } | null | undefined, area?: { name?: string | null } | null): string
export function cuisineOf(place: { cuisine?: string[]; kind?: string; dishes?: string[]; dishNotes?: string[]; name?: string } | null | undefined, cuisines?: { id: string; name: string }[]): string[]
export function cuisineMatches(place: { cuisine?: string[]; kind?: string; dishes?: string[]; dishNotes?: string[]; name?: string } | null | undefined, selected: string | null | undefined, cuisines?: { id: string; name: string }[]): boolean
export function priceLabel(place: { priceMin?: number | null; priceMax?: number | null; priceUnit?: string | null; price?: string | null } | null | undefined): string | null
export function cityOfPlace(place: Pick<Place, 'city' | 'areaId'> | null | undefined, areas?: Pick<Area, 'id' | 'city'>[]): City
export function cityOfArea(area: Pick<Area, 'city'> | null | undefined): City
export function cityOfPoint(point: Point | null | undefined, areas?: Pick<Area, 'lat' | 'lng' | 'city'>[]): City
export function filterPlacesByCity<T extends { city?: City; areaId?: string | null }>(places: T[], city: City, areas?: Pick<Area, 'id' | 'city'>[]): T[]
export function filterAreasByCity<T extends { city?: City }>(areas: T[], city: City): T[]
export function catalogCities(places?: Pick<Place, 'city' | 'areaId'>[], areas?: Pick<Area, 'id' | 'city'>[]): City[]
export function readCityPreference(raw: unknown, available?: City[]): City | null
