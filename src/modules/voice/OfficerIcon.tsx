import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineBolt,
  HiOutlineHeart,
  HiOutlineScale,
  HiOutlineStar,
} from 'react-icons/hi2'
import type { OfficerType } from './types'

const icons = {
  pressure: HiOutlineBolt,
  standard: HiOutlineScale,
  friendly: HiOutlineHeart,
  trump: HiOutlineStar,
  custom: HiOutlineAdjustmentsHorizontal,
}

const tones = {
  pressure: 'bg-[#fff0ef] text-[#b53a34]',
  standard: 'bg-[#eaf4ff] text-[#0062c3]',
  friendly: 'bg-[#eaf8f2] text-[#147a58]',
  trump: 'bg-[#fff6e6] text-[#9a5f12]',
  custom: 'bg-[#f1efff] text-[#6554c0]',
}

export default function OfficerIcon({ type, className = '' }: { type: OfficerType; className?: string }) {
  const Icon = icons[type]
  return (
    <span className={`flex items-center justify-center ${tones[type]} ${className}`} aria-hidden="true">
      <Icon className="h-[22px] w-[22px]" />
    </span>
  )
}
