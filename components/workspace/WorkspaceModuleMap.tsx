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
  const activeIndex = nodes.findIndex((node) => node.id === activeId)
  const activeNode = activeIndex >= 0 ? nodes[activeIndex] : null

  if (!nodes.length) return null

  return (
    <section className="wmmMap" aria-label={title}>
      <header className="wmmMapHead">
        <div className="wmmMapTitle">
          <span className="wmmMapEyebrow">
            <span className="wmmMapEyebrowDot" aria-hidden="true" />
            PETA KERJA · NAVIGASI MODUL
          </span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="wmmMapProgress" aria-label={activeNode ? `Area aktif ${activeIndex + 1} dari ${nodes.length}` : 'Belum ada area aktif'}>
          <span className="wmmMapProgressLabel">AREA AKTIF</span>
          <strong>{activeNode?.label || 'Pilih area kerja'}</strong>
          <small>{activeNode ? `${String(activeIndex + 1).padStart(2, '0')} / ${String(nodes.length).padStart(2, '0')} area` : `${nodes.length} area tersedia`}</small>
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

      <style jsx>{`
        .wmmMap {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          margin: 0 0 16px;
          padding: 19px 20px 13px;
          border: 1px solid rgba(119, 150, 174, .22);
          border-radius: 20px;
          background:
            radial-gradient(ellipse at 2% 0%, rgba(75, 153, 151, .13), transparent 38%),
            radial-gradient(ellipse at 100% 15%, rgba(58, 122, 178, .10), transparent 34%),
            linear-gradient(145deg, #fbfdff 0%, #f4f8fc 53%, #f7fbf9 100%);
          box-shadow: 0 12px 32px rgba(22, 51, 79, .07), inset 0 1px 0 rgba(255,255,255,.9);
          color: #17324d;
        }
        .wmmMap::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          opacity: .20;
          background-image: linear-gradient(rgba(90,122,149,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(90,122,149,.10) 1px, transparent 1px);
          background-size: 24px 24px;
          mask-image: linear-gradient(135deg, rgba(0,0,0,.65), transparent 78%);
        }
        .wmmMapHead {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 15px;
        }
        .wmmMapTitle { min-width: 0; }
        .wmmMapEyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #377b83;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .13em;
        }
        .wmmMapEyebrowDot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #35a28b;
          box-shadow: 0 0 0 4px rgba(53,162,139,.12);
        }
        .wmmMapTitle h2 {
          margin: 7px 0 4px;
          color: #143653;
          font-size: clamp(17px, 1.5vw, 21px);
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -.025em;
        }
        .wmmMapTitle p {
          max-width: 760px;
          margin: 0;
          color: #64778a;
          font-size: 11px;
          line-height: 1.55;
        }
        .wmmMapProgress {
          display: grid;
          gap: 3px;
          flex: 0 0 188px;
          min-width: 0;
          padding: 10px 13px;
          border: 1px solid rgba(91,130,158,.18);
          border-radius: 13px;
          background: rgba(255,255,255,.72);
          box-shadow: 0 4px 12px rgba(25,57,82,.04);
        }
        .wmmMapProgressLabel {
          color: #7290a4;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .12em;
        }
        .wmmMapProgress strong {
          overflow: hidden;
          color: #1b5770;
          font-size: 12px;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .wmmMapProgress small {
          color: #8293a2;
          font-size: 9px;
          font-variant-numeric: tabular-nums;
        }
        .wmmMapGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(205px, 100%), 1fr));
          gap: 10px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .wmmMapItem { min-width: 0; }
        .wmmMapNode {
          position: relative;
          display: grid;
          width: 100%;
          min-height: 104px;
          grid-template-rows: auto 1fr auto;
          gap: 7px;
          padding: 12px 13px;
          border: 1px solid rgba(126,153,175,.23);
          border-radius: 14px;
          background: rgba(255,255,255,.78);
          box-shadow: 0 3px 10px rgba(28,57,81,.035);
          color: #1d3d58;
          cursor: pointer;
          text-align: left;
          transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
        }
        .wmmMapNode:hover:not(:disabled) {
          transform: translateY(-2px);
          border-color: rgba(43,129,139,.45);
          background: #fff;
          box-shadow: 0 9px 20px rgba(26,69,95,.10);
        }
        .wmmMapNode:focus-visible {
          outline: 3px solid rgba(42,132,143,.32);
          outline-offset: 2px;
        }
        .wmmMapNode:disabled { cursor: default; }
        .wmmMapNode.active {
          border-color: rgba(33,132,126,.58);
          background: linear-gradient(145deg, rgba(225,247,241,.98), rgba(247,252,255,.96));
          box-shadow: 0 5px 15px rgba(28,112,105,.10), inset 0 0 0 1px rgba(33,132,126,.10);
        }
        .wmmMapNodeTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .wmmMapMarker {
          display: grid;
          width: 29px;
          height: 29px;
          place-items: center;
          border-radius: 9px;
          background: #eaf1f6;
          color: #47708b;
          font-size: 9px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }
        .wmmMapNode.active .wmmMapMarker {
          background: #287f7a;
          color: #fff;
        }
        .wmmMapNodeState {
          color: #91a1af;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .09em;
        }
        .wmmMapNode.active .wmmMapNodeState { color: #2c8980; }
        .wmmMapNodeTitle {
          align-self: end;
          padding-right: 17px;
          color: #1c3d59;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }
        .wmmMapNodeDetail {
          color: #8292a0;
          font-size: 9px;
          line-height: 1.35;
        }
        .wmmMapNodeAction {
          position: absolute;
          right: 12px;
          bottom: 11px;
          color: #8ba0ad;
          font-size: 13px;
          font-weight: 800;
        }
        .wmmMapNode.active .wmmMapNodeAction { color: #2c8980; }
        .wmmMapFooter {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid rgba(126,153,175,.15);
          color: #8093a2;
          font-size: 9px;
        }
        .wmmMapFooter span:first-child { display: inline-flex; align-items: center; gap: 7px; }
        .wmmMapFooter i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4a9b87;
        }
        :global(html[data-mode="gelap"]) .wmmMap {
          border-color: rgba(130,165,191,.18);
          background:
            radial-gradient(ellipse at 2% 0%, rgba(50,132,128,.17), transparent 38%),
            radial-gradient(ellipse at 100% 15%, rgba(47,98,150,.18), transparent 34%),
            linear-gradient(145deg, #14263a 0%, #172c43 54%, #172e36 100%);
          box-shadow: 0 12px 32px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.035);
          color: #e1edf5;
        }
        :global(html[data-mode="gelap"]) .wmmMap::before {
          opacity: .11;
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
          .wmmMap { padding: 15px; border-radius: 16px; }
          .wmmMapHead { display: grid; grid-template-columns: 1fr; gap: 11px; }
          .wmmMapProgress { grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 8px; flex: auto; }
          .wmmMapProgressLabel { white-space: nowrap; }
          .wmmMapProgress strong { min-width: 0; }
          .wmmMapProgress small { text-align: right; white-space: nowrap; }
          .wmmMapGrid { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
          .wmmMapNode { min-height: 94px; padding: 10px; }
        }
        @media (max-width: 480px) {
          .wmmMapGrid { grid-template-columns: 1fr; }
          .wmmMapNode { min-height: 84px; }
          .wmmMapProgress { grid-template-columns: 1fr auto; }
          .wmmMapProgressLabel { grid-column: 1 / -1; }
          .wmmMapFooter { font-size: 8px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wmmMapNode { transition: none; }
          .wmmMapNode:hover:not(:disabled) { transform: none; }
        }
      `}</style>
    </section>
  )
}
