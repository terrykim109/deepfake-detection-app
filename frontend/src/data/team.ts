/* Team roster for the About page. Update this file when members or roles change.
   Prefer real names and contributions from the project; leave photoSrc unset to
   show initials. Do not invent photographs or credentials. */

export interface TeamMember {
  name: string
  role: string
  /** Optional path under /public (e.g. /assets/team/name.jpg). */
  photoSrc?: string
}

export const TEAM: TeamMember[] = [
  {
    name: 'Terry Kim',
    role: 'Team Lead',
  },
  {
    name: 'Lucy Kwak',
    role: 'Product Manager',
  },
  {
    name: 'Rojin Osia',
    role: 'Backend Developer',
  },
  {
    name: 'Nattharut Natvongsaku',
    role: 'Frontend Developer',
  },
 
  {
    name: 'Trinity Ma',
    role: 'QA Engineer',
  },
]

export function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}
