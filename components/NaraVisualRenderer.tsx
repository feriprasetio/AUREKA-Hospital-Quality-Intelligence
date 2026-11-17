'use client'
import { useRef } from 'react'
import { type NaraVisualSpec } from '@/lib/nara-visual'

const palette = ['#176b87','#2f8f70','#d18a31','#8064a2','#bd5968','#6585b5']
const fmt = (v:number) => Number(v).toLocaleString('id-ID',{maximumFractionDigits:2})
export default function NaraVisualRenderer({spec}:{spec:NaraVisualSpec}) {
  const svgRef=useRef<SVGSVGElement>(null)
  const width=760,height=340,left=64,right=24,top=28,bottom=62
  const plotW=width-left-right,plotH=height-top-bottom
  const all=spec.data.flatMap(r=>spec.series.map(s=>Number(r[s.dataKey]??0)))
  const min=Math.min(0,...all),max=Math.max(1,...all),range=max-min||1
  const y=(v:number)=>top+(max-v)/range*plotH
  const download=(kind:'svg'|'png')=>{
    const svg=svgRef.current;if(!svg)return
    const source=new XMLSerializer().serializeToString(svg)
    const blob=new Blob([source],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob)
    if(kind==='svg'){const a=document.createElement('a');a.href=url;a.download='nara-visualisasi.svg';a.click();URL.revokeObjectURL(url);return}
    const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=1520;c.height=680;const ctx=c.getContext('2d');if(!ctx)return;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);c.toBlob(b=>{if(!b)return;const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='nara-visualisasi.png';a.click();URL.revokeObjectURL(u);URL.revokeObjectURL(url)})};img.onerror=()=>URL.revokeObjectURL(url);img.src=url
  }
  const csv=()=>{
    const rows=[ [spec.xKey||'Kategori',...(spec.chartType==='risk_matrix'?['Dampak','Jumlah']:spec.series.map(s=>s.label))] ]
    for(const r of spec.data) rows.push(spec.chartType==='risk_matrix'?[String(r.likelihood),String(r.impact),String(r.count)]:[String(r[spec.xKey||'label']??''),...(spec.chartType==='pie'?[String(r[spec.valueKey||spec.series[0]?.dataKey||'value']??'')]:spec.series.map(s=>String(r[s.dataKey]??'')))])
    const text=rows.map(row=>row.map(v=>'"'+v.replace(/"/g,'""')+'"').join(';')).join('\r\n')
    const u=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='nara-data-visualisasi.csv';a.click();URL.revokeObjectURL(u)
  }
  const pieTotal=spec.data.reduce((n,r)=>n+Number(r[spec.valueKey||spec.series[0]?.dataKey||'value']||0),0)
  let pieAngle=-Math.PI/2
  const piePaths=spec.data.map((r,i)=>{const v=Number(r[spec.valueKey||spec.series[0]?.dataKey||'value']||0),end=pieAngle+(pieTotal?v/pieTotal:0)*Math.PI*2;const p1=[380+125*Math.cos(pieAngle),165+125*Math.sin(pieAngle)],p2=[380+125*Math.cos(end),165+125*Math.sin(end)];const d=v<=0?'':`M 380 165 L ${p1[0]} ${p1[1]} A 125 125 0 ${end-pieAngle>Math.PI?1:0} 1 ${p2[0]} ${p2[1]} Z`;pieAngle=end;return <path key={i} d={d} fill={palette[i%palette.length]}><title>{String(r[spec.xKey||'label'])}: {fmt(v)}</title></path>})
  const heatCells=spec.data.map((r,i)=>{const val=Number(r[spec.valueKey||'value']),lo=Math.min(...spec.data.map(x=>Number(x[spec.valueKey||'value']))),hi=Math.max(...spec.data.map(x=>Number(x[spec.valueKey||'value']))),alpha=hi===lo?.45:.12+.78*(val-lo)/(hi-lo);return <g key={i}><rect x={left+(i%6)*108} y={top+Math.floor(i/6)*62} width="98" height="52" rx="7" fill={`rgba(23,107,135,${alpha})`}/><text x={left+(i%6)*108+49} y={top+Math.floor(i/6)*62+20} textAnchor="middle" fontSize="10" fill={alpha>.55?'#fff':'#203448'}>{String(r[spec.xKey||'label']).slice(0,14)}</text><text x={left+(i%6)*108+49} y={top+Math.floor(i/6)*62+39} textAnchor="middle" fontSize="13" fontWeight="700" fill={alpha>.55?'#fff':'#203448'}>{fmt(val)}</text></g>})
  const riskCells=Array.from({length:25},(_,i)=>{const impact=5-i%5,likelihood=Math.floor(i/5)+1;const found=spec.data.find(r=>Number(r.likelihood)===likelihood&&Number(r.impact)===impact);const count=typeof found?.count==='number'?found.count:0;const hidden=typeof found?.count==='string';const score=likelihood*impact;const fill=score>=15?'#b93838':score>=8?'#d18a31':'#2f8f70';return <g key={i}><rect x={left+(impact-1)*118} y={top+(likelihood-1)*49} width="108" height="41" rx="5" fill={fill} opacity={count?0.88:0.2}/><text x={left+(impact-1)*118+54} y={top+(likelihood-1)*49+17} textAnchor="middle" fontSize="10" fill={count?'#fff':'#536477'}>{likelihood}×{impact}</text><text x={left+(impact-1)*118+54} y={top+(likelihood-1)*49+32} textAnchor="middle" fontSize="11" fontWeight="700" fill={count?'#fff':'#536477'}>{hidden?'—':count}</text></g>})
  return <section className="naraVisual" aria-label={'Visualisasi: '+spec.title}>
    <header><div><strong>{spec.title}</strong><small>{[spec.period,spec.unit].filter(Boolean).join(' · ')}</small></div><div className="naraVisualActions"><button onClick={()=>download('png')} type="button">PNG</button><button onClick={()=>download('svg')} type="button">SVG</button><button onClick={csv} type="button">CSV</button></div></header>
    <div className="naraVisualCanvas"><svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.title} xmlns="http://www.w3.org/2000/svg">
      <rect width={width} height={height} fill="#fff"/>
      {spec.chartType==='bar'||spec.chartType==='line'?<>
        {[0,.25,.5,.75,1].map((p,i)=>{const val=max-range*p,yy=top+plotH*p;return <g key={i}><line x1={left} x2={width-right} y1={yy} y2={yy} stroke="#e5eaf0"/><text x={left-9} y={yy+4} textAnchor="end" fontSize="11" fill="#607080">{fmt(val)}</text></g>})}
        {spec.chartType==='bar'?spec.data.map((row,i)=>{const gw=plotW/spec.data.length,bw=Math.min(34,gw*.7/spec.series.length);return <g key={i}>{spec.series.map((s,si)=>{const v=Number(row[s.dataKey]),yy=y(v),xx=left+i*gw+gw/2-(spec.series.length*bw)/2+si*bw;return <rect key={s.dataKey} x={xx} y={yy} width={bw-3} height={Math.max(1,top+plotH-yy)} rx="3" fill={palette[si%palette.length]}><title>{s.label}: {fmt(v)}</title></rect>})}</g>}):spec.series.map((s,si)=>{const pts=spec.data.map((r,i)=>`${left+(spec.data.length===1?plotW/2:i*plotW/(spec.data.length-1))},${y(Number(r[s.dataKey]))}`).join(' ');return <g key={s.dataKey}><polyline points={pts} fill="none" stroke={palette[si%palette.length]} strokeWidth="3"/>{spec.data.map((r,i)=><circle key={i} cx={left+(spec.data.length===1?plotW/2:i*plotW/(spec.data.length-1))} cy={y(Number(r[s.dataKey]))} r="4" fill={palette[si%palette.length]}/>)}</g>})}
        {spec.data.map((r,i)=><text key={i} x={spec.chartType==='bar'?left+(i+.5)*plotW/spec.data.length:left+(spec.data.length===1?plotW/2:i*plotW/(spec.data.length-1))} y={height-22} textAnchor="middle" fontSize="11" fill="#536477">{String(r[spec.xKey||'label']).slice(0,16)}</text>)}
      </>:null}
      {spec.chartType==='pie'?<>{piePaths}<text x="380" y="160" textAnchor="middle" fontSize="21" fontWeight="800" fill="#203448">{fmt(pieTotal)}</text><text x="380" y="180" textAnchor="middle" fontSize="11" fill="#607080">Total</text></>:null}
      {spec.chartType==='heatmap'?heatCells:null}
      {spec.chartType==='risk_matrix'?<>{riskCells}{[1,2,3,4,5].map(i=><g key={i}><text x={left+(i-.5)*118} y={height-20} textAnchor="middle" fontSize="10" fill="#536477">{i}</text><text x="25" y={top+(i-.5)*49+3} fontSize="10" fill="#536477">{i}</text></g>)}<text x="360" y={height-3} textAnchor="middle" fontSize="10" fill="#536477">Dampak →</text><text x="10" y="14" fontSize="10" fill="#536477">Kemungkinan</text></>:null}
    </svg></div>
    {spec.chartType==='pie'&&<div className="naraVisualLegend">{spec.data.map((r,i)=><span key={i}><i style={{background:palette[i%palette.length]}}/>{String(r[spec.xKey||'label'])}: {fmt(Number(r[spec.valueKey||spec.series[0]?.dataKey||'value']))}</span>)}</div>}
    {(spec.chartType==='bar'||spec.chartType==='line')&&<div className="naraVisualLegend">{spec.series.map((s,i)=><span key={s.dataKey}><i style={{background:palette[i%palette.length]}}/>{s.label}</span>)}</div>}
    {spec.interpretation&&<p className="naraVisualInterpretation">{spec.interpretation}</p>}
    <small className="naraVisualSource">Sumber: {spec.source||'DATA AUREKA'} · Nilai ditampilkan sesuai data yang diberikan.</small>
    <div className="naraVisualTable"><table><thead><tr><th>{spec.chartType==='risk_matrix'?'Kemungkinan':spec.xKey||'Kategori'}</th>{spec.chartType==='risk_matrix'?<><th>Dampak</th><th>Jumlah</th></>:spec.chartType==='heatmap'?<><th>{spec.yKey||'Kelompok'}</th><th>{spec.valueKey||'Nilai'}</th></>:spec.chartType==='pie'?<th>{spec.unit||'Nilai'}</th>:spec.series.map(s=><th key={s.dataKey}>{s.label}</th>)}</tr></thead><tbody>{spec.data.map((r,i)=><tr key={i}>{spec.chartType==='risk_matrix'?<><td>{String(r.likelihood)}</td><td>{String(r.impact)}</td><td>{fmt(Number(r.count))}</td></>:spec.chartType==='heatmap'?<><td>{String(r[spec.xKey||'label'])}</td><td>{String(r[spec.yKey||'y'])}</td><td>{fmt(Number(r[spec.valueKey||'value']))}</td></>:spec.chartType==='pie'?<><td>{String(r[spec.xKey||'label'])}</td><td>{fmt(Number(r[spec.valueKey||spec.series[0]?.dataKey||'value']))}</td></>:<><td>{String(r[spec.xKey||'label'])}</td>{spec.series.map(s=><td key={s.dataKey}>{fmt(Number(r[s.dataKey]))}</td>)}</>}</tr>)}</tbody></table></div>
    <style jsx>{`
      .naraVisual{margin:12px 0;padding:14px;border:1px solid #dce5ed;border-radius:16px;background:#fff;color:#203448;min-width:0}
      header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}header div:first-child{display:grid;gap:4px}header strong{font-size:14px}header small,.naraVisualSource{font-size:11px;color:#66788a}
      .naraVisualActions{display:flex;gap:5px;flex-wrap:wrap}.naraVisualActions button{border:1px solid #d7e1e9;background:#f7fafc;color:#25465c;border-radius:8px;padding:6px 9px;font-size:11px;font-weight:700}
      .naraVisualCanvas{overflow-x:auto;margin-top:10px}.naraVisualCanvas svg{display:block;width:100%;min-width:440px;height:auto}
      .naraVisualLegend{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}.naraVisualLegend span{display:flex;align-items:center;gap:6px;font-size:11px;color:#526477}.naraVisualLegend i{width:9px;height:9px;border-radius:2px;flex:none}
      .naraVisualInterpretation{font-size:12px;line-height:1.55;color:#334b60;margin:10px 0 4px}.naraVisualSource{display:block;margin-top:8px}
      .naraVisualTable{overflow:auto;margin-top:10px}.naraVisualTable table{border-collapse:collapse;width:100%;font-size:11px}.naraVisualTable th,.naraVisualTable td{padding:6px 8px;text-align:right;border-bottom:1px solid #edf1f5;white-space:nowrap}.naraVisualTable th:first-child,.naraVisualTable td:first-child{text-align:left}
      :global(html[data-mode="gelap"]) .naraVisual{background:#141b26;border-color:rgba(255,255,255,.12);color:#eaf0f6}
      :global(html[data-mode="gelap"]) .naraVisualInterpretation{color:#c5d0dc}
    `}</style>
  </section>
}
