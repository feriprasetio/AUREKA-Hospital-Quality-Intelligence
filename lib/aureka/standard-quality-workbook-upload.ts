'use client'

import { createContext, useContext, useEffect, useRef } from 'react'

export const StandardQualityWorkbookUpload = createContext<File | null>(null)

export function useStandardQualityWorkbookUpload(open: boolean, parse: (file: File) => Promise<void>) {
  const file = useContext(StandardQualityWorkbookUpload)
  const lastFile = useRef<File | null>(null)
  const parseRef = useRef(parse)
  useEffect(() => { parseRef.current = parse }, [parse])
  useEffect(() => {
    if (!open || !file || lastFile.current === file) return
    lastFile.current = file
    void parseRef.current(file)
  }, [open, file])
}
