import type { EpisodeProfile } from './patient-episode-workbook'

export async function readQualityReference2026(): Promise<EpisodeProfile[]> {
  const chunks = await Promise.all([
    import('@/data/quality-profile-2026/chunk-01.json'), import('@/data/quality-profile-2026/chunk-02.json'),
    import('@/data/quality-profile-2026/chunk-03.json'), import('@/data/quality-profile-2026/chunk-04.json'),
    import('@/data/quality-profile-2026/chunk-05.json'), import('@/data/quality-profile-2026/chunk-06.json'),
    import('@/data/quality-profile-2026/chunk-07.json'), import('@/data/quality-profile-2026/chunk-08.json'),
    import('@/data/quality-profile-2026/chunk-09.json'), import('@/data/quality-profile-2026/chunk-10.json'),
    import('@/data/quality-profile-2026/chunk-11.json'), import('@/data/quality-profile-2026/chunk-12.json'),
  ])
  return chunks.flatMap(chunk => chunk.default as EpisodeProfile[])
}
