'use client'

type MapNode = { id: string; label: string; detail: string; marker?: string }

export default function WorkspaceModuleMap({
  title,
  description,
  nodes,
  activeId,
  onSelect,
}: {
  title: string
  description: string
  nodes: MapNode[]
  activeId: string
  onSelect?: (id: string) => void
}) {
  return (
    <section className="wmmRoot" aria-label={title}>
      <header className="wmmHead">
        <div><span className="wmmEyebrow">PETA KERJA · NAVIGASI OPERASIONAL</span><h2>{title}</h2><p>{description}</p></div>
        <span className="wmmCurrent">Bagian aktif: {nodes.find((node) => node.id === activeId)?.label || 'Ringkasan'}</span>
      </header>
      <div className="wmmTrack" role="list">
        {nodes.map((node, index) => (
          <div className="wmmNodeWrap" role="listitem" key={node.id}>
            <button type="button" className={'wmmNode' + (node.id === activeId ? ' active' : '')} aria-current={node.id === activeId ? 'step' : undefined} onClick={() => onSelect?.(node.id)} disabled={!onSelect}>
              <span className="wmmMarker">{node.marker || String(index + 1).padStart(2, '0')}</span>
              <span className="wmmNodeText"><b>{node.label}</b><small>{node.detail}</small></span>
              <span className="wmmArrow" aria-hidden="true">↗</span>
            </button>
            {index < nodes.length - 1 && <span className="wmmConnector" aria-hidden="true"/>}
          </div>
        ))}
      </div>
      <style jsx>{`
        .wmmRoot{margin:0 0 14px;padding:16px 18px 14px;border:1px solid rgba(255,255,255,.78);border-radius:20px;background:linear-gradient(135deg,rgba(255,255,255,.78),rgba(238,246,241,.62));box-shadow:0 8px 26px rgba(38,73,54,.055);color:var(--ink,#244b39)}
        .wmmHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:13px}
        .wmmEyebrow{font-size:9px;font-weight:900;letter-spacing:.09em;color:var(--accent2,#438363)}
        .wmmHead h2{font-size:16px;line-height:1.25;margin:4px 0}
        .wmmHead p{font-size:10px;line-height:1.5;color:var(--muted,#68796f);margin:0;max-width:760px}
        .wmmCurrent{font-size:9px;font-weight:850;color:var(--accent2,#438363);background:rgba(31,111,76,.08);border:1px solid rgba(31,111,76,.12);border-radius:999px;padding:7px 10px}
        .wmmTrack{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:7px}
        .wmmNodeWrap{position:relative;min-width:0}
        .wmmNode{width:100%;height:100%;min-height:67px;display:grid;grid-template-columns:27px minmax(0,1fr) 12px;align-items:start;gap:8px;text-align:left;padding:10px;border:1px solid rgba(35,76,54,.11);border-radius:13px;background:rgba(255,255,255,.55);color:inherit;cursor:pointer;transition:background .16s,border-color .16s,transform .16s}
        .wmmNode:hover:not(:disabled){transform:translateY(-1px);border-color:rgba(35,116,78,.34);background:#fff}
        .wmmNode.active{border-color:rgba(31,111,76,.42);background:linear-gradient(135deg,rgba(224,242,231,.94),rgba(255,255,255,.88));box-shadow:inset 0 0 0 1px rgba(31,111,76,.08)}
        .wmmNode:disabled{cursor:default}
        .wmmMarker{display:grid;place-items:center;width:27px;height:27px;border-radius:9px;background:rgba(38,115,78,.09);color:var(--accent2,#397b58);font-size:9px;font-weight:950}
        .wmmNode.active .wmmMarker{background:var(--accent,#3a8a61);color:white}
        .wmmNodeText{display:grid;gap:4px;min-width:0}
        .wmmNodeText b{font-size:10px;line-height:1.3}
        .wmmNodeText small{font-size:9px;line-height:1.4;color:var(--muted,#718078)}
        .wmmArrow{font-size:11px;color:#8a9b90}
        @media(max-width:620px){.wmmRoot{padding:13px;border-radius:16px}.wmmTrack{grid-template-columns:repeat(2,minmax(0,1fr))}.wmmNode{min-height:65px;padding:9px;gap:6px}.wmmCurrent{width:100%;text-align:left}}
        @media(max-width:360px){.wmmTrack{grid-template-columns:1fr}}
      `}</style>
    </section>
  )
}
