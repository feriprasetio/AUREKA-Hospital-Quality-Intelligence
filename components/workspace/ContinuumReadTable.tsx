'use client'
import type {ReactNode} from 'react'
import type {ReadGridDisplayColumn} from '@/lib/aureka/read-grid'
export type ReadTableColumn<T>=ReadGridDisplayColumn&{cell:(row:T)=>ReactNode}
export default function ContinuumReadTable<T>({rows,columns,keys,rowKey,empty,className,marker,disableDomSort}:{rows:readonly T[];columns:readonly ReadTableColumn<T>[];keys?:readonly string[];rowKey:(row:T)=>string|number;empty:ReactNode;className?:string;marker?:boolean;disableDomSort:boolean}){
 const visible=keys?.length?keys.flatMap(id=>{const column=columns.find(c=>c.id===id);return column?[column]:[]}):columns
 return <table className={className} data-continuum-spm-monthly={marker||undefined} data-ak-sort={disableDomSort?'off':undefined}><thead><tr>{visible.map(c=><th key={c.id} scope="col" data-read-column={c.id}>{c.label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={rowKey(row)}>{visible.map(c=><td key={c.id} data-read-column={c.id}>{c.cell(row)}</td>)}</tr>)}{!rows.length&&<tr><td colSpan={visible.length}>{empty}</td></tr>}</tbody></table>
}
