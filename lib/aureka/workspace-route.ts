export type WorkspaceDestination = { module: string; section: string }

const modules: Record<string, string> = {
  beranda: 'home', ringkasan: 'home', 'halaman-utama': 'home',
  analitik: 'home', infografis: 'home', infographics: 'home', 'analitik-laporan': 'home',
  nara: 'nara', 'nara-ai': 'nara',
  pasien: 'patients', 'register-pasien': 'patients',
  'indikator-mutu': 'quality', 'mutu-klinis': 'quality', metadata: 'quality',
  'peningkatan-kinerja-klinis': 'clinical',
  'keselamatan-pasien': 'safety', 'manajemen-risiko': 'risk',
  'sumber-daya-manusia': 'staff', 'tenaga-klinis': 'staff', 'pendidikan-dan-pelatihan': 'staff',
  program: 'analytics', 'program-indikator': 'analytics',
  sekretariat: 'secretariat', secretariat: 'secretariat',
  pengaturan: 'settings', administrasi: 'settings',
}

export function readWorkspaceHash(hash: string): WorkspaceDestination {
  const [path, part = '', detail = '', extra = ''] = hash.replace(/^#\/?/, '').toLowerCase().split('/')
  const module = Object.hasOwn(modules, path) ? modules[path] : 'home'
  const destination = (section = '') => ({ module, section })

  switch (module) {
    case 'patients': {
      const target = ['register-pasien', 'metadata-pasien', 'database-pasien'].includes(part) ? detail : part
      if (target === 'tambah-pasien') return { module: 'quality', section: 'audit-indicators' }
      if (['direktori-pasien', 'rekapan-pasien'].includes(target) || ['metadata-pasien', 'database-pasien'].includes(part)) return destination('directory')
      if (['pola-perawatan', 'analisis-rekam-medis', 'statistik', 'stats'].includes(target)) {
        const tab = part === 'register-pasien' ? extra : detail
        if (['icd', 'los', 'readmisi'].includes(tab)) return destination(tab)
        return destination(['statistik', 'stats', 'analisis-rekam-medis'].includes(target) ? 'icd' : 'patterns')
      }
      return destination('overview')
    }
    case 'clinical':
      if (part === 'realcost') return destination('realcost')
      if (part === 'clinical-pathway') return destination(detail === 'hasil-capaian' ? 'pathway-analysis' : detail === 'manual' ? 'pathway-manual' : 'audit-pathway')
      if (['audit-kematian', 'audit-death', 'audit-klinis', 'clinical-audit', 'audit-klinis-dan-kematian'].includes(part)) {
        if (detail === 'hasil-capaian') return destination('result-clinical-death')
        return destination(['audit-kematian', 'audit-death'].includes(part) ? 'audit-death' : 'audit-clinical')
      }
      return destination('audit-pathway')
    case 'quality': {
      if (path === 'metadata') return destination('profile-indicators')
      if (path === 'mutu-klinis') {
        if (part === 'oppe-fppe') return { module: 'staff', section: 'oppe-fppe' }
        if (part === 'clinical-pathway') return { module: 'clinical', section: detail === 'hasil-capaian' ? 'pathway-analysis' : 'audit-pathway' }
        if (part === 'audit-klinis-dan-kematian') return { module: 'clinical', section: detail === 'hasil-capaian' ? 'result-clinical-death' : 'audit-clinical' }
        if (part === 'audit-indikator') return destination(detail === 'hasil-capaian' ? 'result-unit' : 'audit-indicators')
      }
      if (part === 'hasil-capaian') return destination(detail === 'kategori-indikator' ? 'result-category' : 'result-unit')
      if (part === 'monitoring') return destination(detail === 'kinerja-pic' ? 'pic-performance' : 'quality-reporting')
      if (part === 'usulan-indikator') return { module: 'analytics', section: 'proposals' }
      const sections: Record<string, string> = {
        'form-logbook': 'audit-indicators', 'profil-indikator': 'profile-indicators',
        rekonsiliasi: 'quality-reconciliation', spm: 'spm', spo: 'sop',
      }
      return destination(Object.hasOwn(sections, part) ? sections[part] : 'quality-overview')
    }
    case 'staff':
      if (part === 'kinerja-pic') return { module: 'quality', section: 'pic-performance' }
      if (['oppe', 'oppe-fppe'].includes(part)) return destination('oppe-fppe')
      if (['training', 'in-house-training'].includes(part)) return destination('training')
      if (['student-orientation', 'orientasi-mahasiswa'].includes(part)) return destination('student-orientation')
      return destination(['directory', 'team', 'fppe'].includes(part) ? part : '')
    case 'secretariat':
      if (part === 'program-kerja') {
        return { module: 'analytics', section: detail === 'area-prioritas' ? 'priorities' : detail === 'usulan-indikator' ? 'proposals' : detail === 'timeline' ? 'timeline' : 'programs' }
      }
      return destination(['undangan', 'invitations', 'kirim-undangan'].includes(part) ? 'invitations' : 'register')
    case 'analytics':
      return destination(['recommendations', 'rtl', 'rtl-dewas', 'rtl-direktur', 'rtl-kabid'].includes(part) ? 'recommendations' : 'programs')
    case 'settings':
      return destination(part === 'audit-log' ? 'audit' : ['profile', 'security', 'users', 'units', 'appearance', 'system', 'permissions', 'mydata', 'legal'].includes(part) ? part : 'profile')
    case 'safety':
      return destination(['incidents', 'investigation', 'fmea-reactive', 'survey', 'responses'].includes(part) ? part : 'overview')
    case 'risk':
      return destination(['register', 'mitigation', 'connections', 'fmea', 'fmea-overview', 'profile', 'evaluation'].includes(part) ? part : 'overview')
    default:
      return destination()
  }
}
