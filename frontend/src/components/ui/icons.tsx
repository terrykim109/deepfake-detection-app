import React from 'react'

/* Small inline icons for status UI. They inherit currentColor so they
   match whatever tone the parent component sets. */

type IconProps = React.SVGProps<SVGSVGElement>

const base: IconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

export const CheckCircleIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </svg>
)

export const WarningIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
)

export const QuestionIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
  </svg>
)

export const AlertIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
)

export const InfoIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
)

export const TrashCheckIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <path d="M3 6h18M8 6V4h8v2M5 6l1 14h12l1-14" />
    <path d="m9 13 2 2 4-4" />
  </svg>
)

export const MailIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
)

export const CloseIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const TrashIcon: React.FC<IconProps> = (p) => (
  <svg {...base} {...p}>
    <path d="M3 6h18M8 6V4h8v2M5 6l1 14h12l1-14" />
    <path d="M10 11v5M14 11v5" />
  </svg>
)
