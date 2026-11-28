'use client'
import type {ReactNode} from 'react'
/** Keeps existing summary content and actions available, without permanent register chrome. */
export default function ContinuumSummary({enabled,label,children}:{enabled:boolean;label:string;children:ReactNode}){
 return enabled?<details className="continuumOnDemandSummary" data-continuum-summary><summary>{label}</summary><div>{children}</div></details>:<>{children}</>
}
