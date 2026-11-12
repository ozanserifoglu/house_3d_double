// Room data and the room selection: no three.js, no DOM.
// `rooms` and `selectedRoomId` are live bindings: importers always see the
// current value, but only this module may reassign them (setRooms, selectRoomId).
import { rectPts, normalizePolygon, polygonsOverlap } from './polygon.js';
import { parseLocks } from './locks.js';
import { FLOOR_KINDS } from './textures.js';

export const WALL_T = 12; // outer wall thickness; walls sit outside the outline

// Room: { id, name, pts: [[x, z], ...] inside outline (see polygon.js), h, floor, wall,
//   locked, roomLock, floorTex? ('parquet' | 'tile'; missing = plain) }
export let rooms = [];
let nextRoomId = 1;

export function setRooms(list) {
  rooms = list;
  rooms.forEach((r) => (nextRoomId = Math.max(nextRoomId, r.id + 1)));
}

export const newRoom = (props) => ({ id: nextRoomId++, name: 'Room', pts: rectPts(500, 400), h: 260, floor: '#c9b79c', wall: '#f2efe9', locked: [], roomLock: false, ...props });

export function nextRoomName() {
  let k = rooms.length + 1;
  while (rooms.some((r) => r.name === `Room ${k}`)) k++;
  return `Room ${k}`;
}

// The room the Room tab edits and Eye level stands in (UI state, not saved).
// null (or a deleted room's id) falls back to the first room.
export let selectedRoomId = null;
export const selectRoomId = (id) => (selectedRoomId = id);
export const currentRoom = () => rooms.find((r) => r.id === selectedRoomId) || rooms[0];

// Would this outline overlap any room other than `exceptId`?
export const overlapsOthers = (pts, exceptId) => rooms.some((r) => r.id !== exceptId && polygonsOverlap(pts, r.pts));

// The saved fields of each room (layout JSON and undo snapshots).
export const roomData = () => rooms.map(({ id, name, pts, h, floor, floorTex, wall, locked, roomLock }) => ({ id, name, pts, h, floor, floorTex, wall, locked, roomLock }));

// Rooms from either layout version (v2 `rooms`, or v1's single `room`
// rectangle). Outlines with < 3 corners are dropped.
export function parseRooms(parsed) {
  if (Array.isArray(parsed.rooms)) {
    const list = parsed.rooms
      .filter((r) => Array.isArray(r.pts))
      .map((r) => ({ ...r, pts: normalizePolygon(r.pts.filter((p) => isFinite(p[0]) && isFinite(p[1]))), locked: parseLocks(r.locked), roomLock: r.roomLock === true, floorTex: FLOOR_KINDS.includes(r.floorTex) && r.floorTex !== 'plain' ? r.floorTex : undefined }))
      .filter((r) => r.pts.length >= 3)
      .map(({ id, ...r }) => newRoom({ ...r, ...(Number.isInteger(id) ? { id } : {}) }));
    if (list.length) return list;
  }
  const old = parsed.room || {};
  const pick = (k) => (old[k] !== undefined ? { [k]: old[k] } : {});
  return [newRoom({ pts: rectPts(old.w || 500, old.d || 400), ...pick('h'), ...pick('floor'), ...pick('wall') })];
}
