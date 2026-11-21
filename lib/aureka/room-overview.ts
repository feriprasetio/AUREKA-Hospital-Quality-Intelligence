/**
 * Convert scoped room/month/grain aggregate rows to room-level totals.
 * A failed RPC is handled by its caller as unknown, not fabricated as zero.
 */
export function aggregateRoomOverviewCounts(
  rooms: Array<{ id: number }>,
  rows: Array<{ room_id: number | string; total: number | string }>,
): Array<{ roomId: number; records: number }> {
  const counts = new Map<number, number>()
  for (const item of rows) {
    const roomId = Number(item.room_id)
    const count = Number(item.total)
    if (!Number.isSafeInteger(roomId) || roomId <= 0 ||
        !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Invalid aggregated room count response')
    }
    const total = (counts.get(roomId) ?? 0) + count
    if (!Number.isSafeInteger(total)) throw new Error('Room count exceeds safe integer range')
    counts.set(roomId, total)
  }
  return rooms.map(room => ({
    roomId: Number(room.id), records: counts.get(Number(room.id)) ?? 0,
  }))
}
