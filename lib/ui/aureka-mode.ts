'use client'

import { useSyncExternalStore } from 'react'

type AurekaMode = 'terang' | 'gelap'

const modeKey = 'aureka-mode'
const modeEvent = 'aureka-mode-change'

function readMode(): AurekaMode {
  return document.documentElement.dataset.mode === 'gelap' ? 'gelap' : 'terang'
}

function subscribe(callback: () => void) {
  const sync = () => {
    try {
      const stored = localStorage.getItem(modeKey)
      document.documentElement.dataset.mode = stored === 'gelap' ? 'gelap' : 'terang'
    } catch { /* The current tab keeps its selection. */ }
    callback()
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === modeKey || event.key === null) sync()
  }
  window.addEventListener(modeEvent, callback)
  window.addEventListener('storage', onStorage)
  window.addEventListener('pageshow', sync)
  sync()
  return () => {
    window.removeEventListener(modeEvent, callback)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('pageshow', sync)
  }
}

export function useAurekaMode() {
  return useSyncExternalStore(subscribe, readMode, (): AurekaMode => 'terang')
}

export function setAurekaMode(mode: AurekaMode) {
  document.documentElement.dataset.mode = mode
  try {
    localStorage.setItem(modeKey, mode)
  } catch { /* The current tab keeps its selection. */ }
  window.dispatchEvent(new Event(modeEvent))
}
