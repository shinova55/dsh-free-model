import { tr } from './i18n.mjs'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { createSponsorUI } from '../../../src/sponsor.js'
import image from '../../../docs/images/sponsor-beichen-examples.jpg?inline'
import '../../../src/sponsor.css'

// This shared module contains only fixed sponsor copy. Translate display text and
// accessibility labels without changing referral URLs or clipboard values.
const display = (value: React.ReactNode): React.ReactNode => typeof value === 'string' ? tr(value)
  : Array.isArray(value) ? value.map(display) : value
const localizedReact = { ...React, createElement: (type: React.ElementType, props: Record<string, unknown> | null, ...children: React.ReactNode[]) => {
  const localized = props ? { ...props } : null
  if (localized) for (const key of ['title', 'alt', 'aria-label']) {
    if (typeof localized[key] === 'string') localized[key] = tr(localized[key])
  }
  return React.createElement(type, localized, ...children.map(display))
} }
export const { SponsorPage, SponsorNotice } = createSponsorUI(localizedReact, image, createPortal, 'desktop')
