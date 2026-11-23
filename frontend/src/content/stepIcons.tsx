import React from 'react'
import { ImageIcon, ShieldCheckIcon, ShieldIcon } from '../components/ui'
import type { LandingStepIcon } from './types'

const ICONS: Record<string, React.FC> = {
  image: ImageIcon,
  'shield-check': ShieldCheckIcon,
  shield: ShieldIcon,
}

export function StepIcon({ icon }: { icon: LandingStepIcon }) {
  const Icon = ICONS[icon] || ImageIcon
  return <Icon />
}
