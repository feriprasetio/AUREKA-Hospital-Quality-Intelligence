'use client'

import { useState } from 'react'

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
  const [expanded, setExpanded] = useState(false)
  const activeIndex = nodes.findIndex((node) => node.id === activeId)
  const activeNode = activeIndex >= 0 ? nodes[activeIndex] : null

  if (!nodes.length) return null

  return (
    <section
      className={'wmmMap' + (expanded ? ' isPinned' : '')}
      aria-label={title}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget as Node | null
        if (!next || !event.currentTarget.contains(next)) setExpanded(false)
      }}
    >
      <button
        type="button"
        className="wmmMapRail"
        aria-expanded={expanded}
        aria-controls="wmm-map-panel"
        aria-label={'Peta navigasi. Area aktif: ' + (activeNode?.label || 'belum dipilih') + '. Tekan untuk membuka atau menahan panel.'}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="wmmMapRailIcon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none">
            <path d="M3 4.5h14M3 10h14M3 15.5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="6" cy="4.5" r="1.5" fill="currentColor" />
            <circle cx="14" cy="10" r="1.5" fill="currentColor" />
            <circle cx="8" cy="15.5" r="1.5" fill="currentColor" />
          </svg>
        </span>
        <span className="wmmMapRailLabel">Peta navigasi</span>
        <span className="wmmMapRailDivider" aria-hidden="true" />
        <span className="wmmMapRailActive">{activeNode?.label || 'Pilih area kerja'}</span>
        <span className="wmmMapRailCount">{String(Math.max(activeIndex + 1, 0)).padStart(2, '0')} / {String(nodes.length).padStart(2, '0')}</span>
        <span className="wmmMapRailChevron" aria-hidden="true">⌄</span>
      </button>

      <div className="wmmMapPanel" id="wmm-map-panel">
        <header className="wmmMapHead">
          <div className="wmmMapTitle">
            <span className="wmmMapEyebrow">
              <span className="wmmMapEyebrowDot" aria-hidden="true" />
              PETA KERJA · NAVIGASI MODUL
            </span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <div className="wmmMapProgress" aria-label={activeNode ? 'Area aktif ' + (activeIndex + 1) + ' dari ' + nodes.length : 'Belum ada area aktif'}>
            <span className="wmmMapProgressLabel">AREA AKTIF</span>
            <strong>{activeNode?.label || 'Pilih area kerja'}</strong>
            <small>{activeNode ? String(activeIndex + 1).padStart(2, '0') + ' / ' + String(nodes.length).padStart(2, '0') + ' area' : nodes.length + ' area tersedia'}</small>
          </div>
        </header>

        <ol className="wmmMapGrid" aria-label="Daftar area kerja">
          {nodes.map((node, index) => {
            const active = node.id === activeId
            return (
              <li className="wmmMapItem" key={node.id}>
                <button
                  type="button"
                  className={'wmmMapNode' + (active ? ' active' : '')}
                  aria-current={active ? 'step' : undefined}
                  aria-label={node.label + (node.detail ? ' · ' + node.detail : '')}
                  onClick={() => onSelect?.(node.id)}
                  disabled={!onSelect}
                >
                  <span className="wmmMapNodeTop">
                    <span className="wmmMapMarker">{node.marker || String(index + 1).padStart(2, '0')}</span>
                    <span className="wmmMapNodeState">{active ? 'SEDANG DIBUKA' : 'BUKA AREA'}</span>
                  </span>
                  <span className="wmmMapNodeTitle">{node.label}</span>
                  <span className="wmmMapNodeDetail">{node.detail || 'Ruang kerja'}</span>
                  <span className="wmmMapNodeAction" aria-hidden="true">{active ? '✓' : '↗'}</span>
                </button>
              </li>
            )
          })}
        </ol>

        <footer className="wmmMapFooter">
          <span><i aria-hidden="true" /> Peta navigasi mengikuti hak akses akun</span>
          <span>{nodes.length} area kerja</span>
        </footer>
      </div>

      <style jsx>{`
        .wmmMap {
          position: relative;
          z-index: 35;
          isolation: isolate;
          overflow: visible;
          margin: 0 0 9px;
          color: #17324d;
        }
        .wmmMapRail {
          display: flex;
          width: 100%;
          min-width: 0;
          height: 37px;
          align-items: center;
          gap: 10px;
          padding: 0 11px;
          border: 1px solid rgba(119,150,174,.23);
          border-radius: 11px;
          background: linear-gradient(100deg, rgba(249,253,255,.98), rgba(241,248,250,.97));
          box-shadow: 0 3px 10px rgba(22,51,79,.045), inset 0 1px 0 rgba(255,255,255,.9);
          color: #31566d;
          cursor: pointer;
          text-align: left;
          transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
        }
        .wmmMapRail:hover {
          border-color: rgba(55,139,143,.42);
          box-shadow: 0 5px 15px rgba(22,76,91,.08);
        }
        .wmmMapRail:focus-visible {
          outline: 3px solid rgba(42,132,143,.28);
          outline-offset: 2px;
        }
        .wmmMapRailIcon {
          display: grid;
          width: 21px;
          height: 21px;
          flex: 0 0 21px;
          place-items: center;
          border-radius: 7px;
          background: rgba(52,139,135,.10);
          color: #32847f;
        }
        .wmmMapRailIcon svg { width: 14px; height: 14px; }
        .wmmMapRailLabel {
          flex: 0 0 auto;
          color: #477184;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: .015em;
        }
        .wmmMapRailDivider {
          width: 1px;
          height: 15px;
          flex: 0 0 1px;
          background: rgba(109,145,164,.27);
        }
        .wmmMapRailActive {
          overflow: hidden;
          min-width: 0;
          color: #1d526a;
          font-size: 10px;
          font-weight: 750;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .wmmMapRailCount {
          margin-left: auto;
          color: #8196a4;
          font-size: 9px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .wmmMapRailChevron {
          display: grid;
          width: 19px;
          height: 19px;
          flex: 0 0 19px;
          place-items: center;
          border-radius: 6px;
          background: rgba(105,143,161,.09);
          color: #688696;
          font-size: 14px;
          line-height: 1;
          transition: transform .18s ease, background .18s ease;
        }
        .wmmMapPanel {
          position: absolute;
          top: calc(100% + 7px);
          right: 0;
          left: 0;
          max-height: min(68vh, 620px);
          overflow: auto;
          padding: 14px 15px 10px;
          border: 1px solid rgba(119,150,174,.25);
          border-radius: 16px;
          background:
            radial-gradient(ellipse at 2% 0%, rgba(75,153,151,.12), transparent 38%),
            radial-gradient(ellipse at 100% 15%, rgba(58,122,178,.09), transparent 34%),
            linear-gradient(145deg, #fbfdff 0%, #f4f8fc 53%, #f7fbf9 100%);
          box-shadow: 0 18px 42px rgba(22,51,79,.17), inset 0 1px 0 rgba(255,255,255,.9);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transform: translateY(-5px);
          transform-origin: top center;
          transition: opacity .16s ease, transform .16s ease, visibility .16s ease;
          scrollbar-width: thin;
          color: #17324d;
        }
        .wmmMapPanel::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: inherit;
          pointer-events: none;
          opacity: .16;
          background-image: linear-gradient(rgba(90,122,149,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(90,122,149,.10) 1px, transparent 1px);
          background-size: 24px 24px;
          mask-image: linear-gradient(135deg, rgba(0,0,0,.65), transparent 78%);
        }
        .wmmMapPanel > * { position: relative; z-index: 1; }
        .wmmMapHead {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 11px;
        }
        .wmmMapTitle { min-width: 0; }
        .wmmMapEyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #377b83;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .12em;
        }
        .wmmMapEyebrowDot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #35a28b;
          box-shadow: 0 0 0 3px rgba(53,162,139,.12);
        }
        .wmmMapTitle h2 {
          margin: 5px 0 3px;
          color: #143653;
          font-size: clamp(15px, 1.3vw, 18px);
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -.02em;
        }
        .wmmMapTitle p {
          max-width: 720px;
          margin: 0;
          color: #64778a;
          font-size: 10px;
          line-height: 1.45;
        }
        .wmmMapProgress {
          display: grid;
          gap: 2px;
          flex: 0 0 160px;
          min-width: 0;
          padding: 8px 10px;
          border: 1px solid rgba(91,130,158,.18);
          border-radius: 10px;
          background: rgba(255,255,255,.75);
        }
        .wmmMapProgressLabel {
          color: #7290a4;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .11em;
        }
        .wmmMapProgress strong {
          overflow: hidden;
          color: #1b5770;
          font-size: 10px;
          line-height: 1.3;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .wmmMapProgress small {
          color: #8293a2;
          font-size: 8px;
          font-variant-numeric: tabular-nums;
        }
        .wmmMapGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(175px, 100%), 1fr));
          gap: 8px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .wmmMapItem { min-width: 0; }
        .wmmMapNode {
          position: relative;
          display: grid;
          width: 100%;
          min-height: 73px;
          grid-template-rows: auto 1fr auto;
          gap: 5px;
          padding: 8px 10px;
          border: 1px solid rgba(126,153,175,.23);
          border-radius: 11px;
          background: rgba(255,255,255,.82);
          box-shadow: 0 2px 7px rgba(28,57,81,.035);
          color: #1d3d58;
          cursor: pointer;
          text-align: left;
          transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
        }
        .wmmMapNode:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(43,129,139,.45);
          background: #fff;
          box-shadow: 0 7px 15px rgba(26,69,95,.09);
        }
        .wmmMapNode:focus-visible {
          outline: 3px solid rgba(42,132,143,.30);
          outline-offset: 2px;
        }
        .wmmMapNode:disabled { cursor: default; }
        .wmmMapNode.active {
          border-color: rgba(33,132,126,.58);
          background: linear-gradient(145deg, rgba(225,247,241,.98), rgba(247,252,255,.96));
          box-shadow: 0 4px 12px rgba(28,112,105,.09), inset 0 0 0 1px rgba(33,132,126,.09);
        }
        .wmmMapNodeTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 7px;
        }
        .wmmMapMarker {
          display: grid;
          width: 23px;
          height: 23px;
          place-items: center;
          border-radius: 7px;
          background: #eaf1f6;
          color: #47708b;
          font-size: 8px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }
        .wmmMapNode.active .wmmMapMarker { background: #287f7a; color: #fff; }
        .wmmMapNodeState {
          color: #91a1af;
          font-size: 6px;
          font-weight: 900;
          letter-spacing: .08em;
        }
        .wmmMapNode.active .wmmMapNodeState { color: #2c8980; }
        .wmmMapNodeTitle {
          align-self: end;
          padding-right: 15px;
          color: #1c3d59;
          font-size: 10px;
          font-weight: 800;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }
        .wmmMapNodeDetail {
          color: #8292a0;
          font-size: 8px;
          line-height: 1.3;
        }
        .wmmMapNodeAction {
          position: absolute;
          right: 10px;
          bottom: 8px;
          color: #8ba0ad;
          font-size: 11px;
          font-weight: 800;
        }
        .wmmMapNode.active .wmmMapNodeAction { color: #2c8980; }
        .wmmMapFooter {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          margin-top: 9px;
          padding-top: 8px;
          border-top: 1px solid rgba(126,153,175,.15);
          color: #8093a2;
          font-size: 8px;
        }
        .wmmMapFooter span:first-child { display: inline-flex; align-items: center; gap: 6px; }
        .wmmMapFooter i {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #4a9b87;
        }
        .wmmMap.isPinned .wmmMapPanel { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0); }
        .wmmMap.isPinned .wmmMapRailChevron { transform: rotate(180deg); background: rgba(105,143,161,.16); }
        @media (hover: hover) and (pointer: fine) {
          .wmmMap:hover .wmmMapPanel { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0); }
          .wmmMap:hover .wmmMapRailChevron { transform: rotate(180deg); background: rgba(105,143,161,.16); }
        }
        :global(html[data-mode="gelap"]) .wmmMapRail {
          border-color: rgba(130,165,191,.20);
          background: linear-gradient(100deg, rgba(20,39,58,.98), rgba(22,47,61,.97));
          box-shadow: 0 3px 12px rgba(0,0,0,.14), inset 0 1px 0 rgba(255,255,255,.035);
          color: #d9eaf3;
        }
        :global(html[data-mode="gelap"]) .wmmMapRailIcon { background: rgba(93,184,171,.13); color: #8bd0c4; }
        :global(html[data-mode="gelap"]) .wmmMapRailLabel { color: #a7c4d3; }
        :global(html[data-mode="gelap"]) .wmmMapRailDivider { background: rgba(146,178,201,.22); }
        :global(html[data-mode="gelap"]) .wmmMapRailActive { color: #d2eceb; }
        :global(html[data-mode="gelap"]) .wmmMapRailCount,
        :global(html[data-mode="gelap"]) .wmmMapRailChevron { color: #9ab4c3; }
        :global(html[data-mode="gelap"]) .wmmMapRailChevron { background: rgba(122,164,190,.12); }
        :global(html[data-mode="gelap"]) .wmmMapPanel {
          border-color: rgba(130,165,191,.20);
          background:
            radial-gradient(ellipse at 2% 0%, rgba(50,132,128,.17), transparent 38%),
            radial-gradient(ellipse at 100% 15%, rgba(47,98,150,.18), transparent 34%),
            linear-gradient(145deg, #14263a 0%, #172c43 54%, #172e36 100%);
          box-shadow: 0 18px 42px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.035);
          color: #e1edf5;
        }
        :global(html[data-mode="gelap"]) .wmmMapPanel::before {
          opacity: .10;
          background-image: linear-gradient(rgba(161,190,210,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(161,190,210,.12) 1px, transparent 1px);
        }
        :global(html[data-mode="gelap"]) .wmmMapTitle h2 { color: #e4f2fb; }
        :global(html[data-mode="gelap"]) .wmmMapTitle p,
        :global(html[data-mode="gelap"]) .wmmMapFooter { color: #9fb2c2; }
        :global(html[data-mode="gelap"]) .wmmMapEyebrow { color: #81c4c1; }
        :global(html[data-mode="gelap"]) .wmmMapProgress {
          border-color: rgba(146,178,201,.16);
          background: rgba(12,28,45,.55);
        }
        :global(html[data-mode="gelap"]) .wmmMapProgressLabel,
        :global(html[data-mode="gelap"]) .wmmMapProgress small { color: #9ab1c2; }
        :global(html[data-mode="gelap"]) .wmmMapProgress strong { color: #bce8e4; }
        :global(html[data-mode="gelap"]) .wmmMapNode {
          border-color: rgba(146,178,201,.16);
          background: rgba(19,42,62,.76);
          color: #dceaf4;
        }
        :global(html[data-mode="gelap"]) .wmmMapNode:hover:not(:disabled) {
          border-color: rgba(112,196,187,.42);
          background: rgba(25,55,77,.96);
        }
        :global(html[data-mode="gelap"]) .wmmMapNode.active {
          border-color: rgba(83,183,166,.48);
          background: linear-gradient(145deg, rgba(28,97,91,.44), rgba(24,51,74,.90));
        }
        :global(html[data-mode="gelap"]) .wmmMapMarker {
          background: rgba(122,164,190,.16);
          color: #c5dbe9;
        }
        :global(html[data-mode="gelap"]) .wmmMapNodeTitle { color: #e5f1f8; }
        :global(html[data-mode="gelap"]) .wmmMapNodeDetail,
        :global(html[data-mode="gelap"]) .wmmMapNodeState { color: #9aafbf; }
        :global(html[data-mode="gelap"]) .wmmMapNode.active .wmmMapNodeState,
        :global(html[data-mode="gelap"]) .wmmMapNode.active .wmmMapNodeAction { color: #8ed6c7; }
        @media (max-width: 760px) {
          .wmmMapRail { gap: 8px; height: 36px; padding: 0 9px; }
          .wmmMapRailLabel { font-size: 9px; }
          .wmmMapPanel { padding: 12px; border-radius: 13px; }
          .wmmMapHead { display: grid; grid-template-columns: 1fr; gap: 8px; }
          .wmmMapProgress { grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 7px; flex: auto; }
          .wmmMapProgressLabel { white-space: nowrap; }
          .wmmMapProgress strong { min-width: 0; }
          .wmmMapProgress small { text-align: right; white-space: nowrap; }
          .wmmMapGrid { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 7px; }
          .wmmMapNode { min-height: 70px; padding: 8px; }
        }
        @media (max-width: 480px) {
          .wmmMapRailActive { font-size: 9px; }
          .wmmMapRailCount { font-size: 8px; }
          .wmmMapPanel { max-height: 66vh; }
          .wmmMapGrid { grid-template-columns: 1fr; }
          .wmmMapNode { min-height: 65px; }
          .wmmMapProgress { grid-template-columns: 1fr auto; }
          .wmmMapProgressLabel { grid-column: 1 / -1; }
          .wmmMapFooter { font-size: 7px; }
        }
        @media (hover: none) {
          .wmmMapPanel { position: relative; top: auto; right: auto; left: auto; margin-top: 6px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wmmMapPanel, .wmmMapRailChevron, .wmmMapNode { transition: none; }
          .wmmMapNode:hover:not(:disabled) { transform: none; }
        }
      `}</style>
    </section>
  )
}
