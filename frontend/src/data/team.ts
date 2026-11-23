/* Team roster defaults now live in content/defaults.ts (About CMS).
   Kept for backward-compatible imports. */

export type { AboutTeamMemberContent as TeamMember } from '../content/types'
export { teamInitials } from '../content/teamInitials'
import { ABOUT_DEFAULT } from '../content/defaults'

export const TEAM = ABOUT_DEFAULT.team.map(({ id, name, role, photoSrc }) => ({
  id,
  name,
  role,
  photoSrc: photoSrc || undefined,
}))
