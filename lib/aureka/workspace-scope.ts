export type WorkspaceRoom = { id: number | string; name?: string | null }

/** Accept only active room identifiers that belong to the current room master. */
export function normalizeWorkspaceRoomId(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/** Resolve a global workspace scope without ever returning an unknown room ID. */
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

export function isWorkspaceRoomSelected(selectedRoomId: unknown, recordRoomId: unknown): boolean {
  const selected = normalizeWorkspaceRoomId(selectedRoomId)
  const record = normalizeWorkspaceRoomId(recordRoomId)
  return selected !== null && record === selected
}
