'use client'

import { useState } from 'react'
import QualityIndicatorWorkspace from '@/components/QualityIndicatorWorkspace'

type Room = { id: number; name: string }
type RegisterTab = 'add' | 'recap'

export default function RegisterPasienWorkspace({
  initialRoomId, rooms, isAdmin, isValidator, canViewAllRooms, onRoomChange,
}: {
  initialRoomId: number | null
  rooms: Room[]
  isAdmin: boolean
  isValidator: boolean
  canViewAllRooms: boolean
  onRoomChange?: (roomId: number | null) => void
}) {
  const [tab, setTab] = useState<RegisterTab>('add')
  return <div className="rpWorkspace">
    <nav className="rpTabs" role="tablist" aria-label="Register Pasien">
      <button type="button" role="tab" aria-selected={tab === 'add'} className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>
        <span className="rpTabIcon" aria-hidden="true">＋</span>Tambah Pasien
      </button>
      <button type="button" role="tab" aria-selected={tab === 'recap'} className={tab === 'recap' ? 'active' : ''} onClick={() => setTab('recap')}>
        <span className="rpTabIcon" aria-hidden="true">▤</span>Rekapan Pasien
      </button>
    </nav>
    <QualityIndicatorWorkspace
      initialRoomId={initialRoomId}
      rooms={rooms}
      isAdmin={isAdmin}
      isValidator={isValidator}
      canViewAllRooms={canViewAllRooms}
      onRoomChange={onRoomChange}
      initialContainer="Audit Indikator Mutu"
      showContainerTabs={false}
      workspaceMode="register"
      registerTab={tab}
    />
    <style jsx>{`
      .rpWorkspace{display:grid;gap:12px;min-width:0}
      .rpTabs{display:flex;align-items:center;gap:7px;padding:5px;border:1px solid #e3ebe5;border-radius:13px;background:#f5f8f6;width:max-content;max-width:100%;overflow-x:auto}
      .rpTabs button{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:8px 14px;border:0;border-radius:9px;background:transparent;color:#617269;font:inherit;font-size:12px;font-weight:750;white-space:nowrap;cursor:pointer}
      .rpTabs button.active{background:#fff;color:#176b49;box-shadow:0 1px 4px rgba(20,48,34,.09)}
      .rpTabIcon{font-size:17px;line-height:1}
      @media(max-width:520px){.rpTabs{width:100%}.rpTabs button{flex:1;justify-content:center;padding:8px}}
    `}</style>
  </div>
}
