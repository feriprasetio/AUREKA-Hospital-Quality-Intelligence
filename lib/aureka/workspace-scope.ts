export type WorkspaceRoom = { id: number | string; name?: string | null }

export function normalizeWorkspaceRoomId(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/** Resolve the global Super Admin room using only rooms in the active room master. */
export function resolveAdminWorkspaceRoomId(
  rooms: readonly WorkspaceRoom[],
  candidates: readonly unknown[] = [],
): number | null {
  const available = new Set(rooms.map((room) => normalizeWorkspaceRoomId(room.id)).filter((id): id is number => id !== null))
  for (const candidate of candidates) {
    const id = normalizeWorkspaceRoomId(candidate)
    if (id !== null && available.has(id)) return id
  }
  return normalizeWorkspaceRoomId(rooms[0]?.id)
}
