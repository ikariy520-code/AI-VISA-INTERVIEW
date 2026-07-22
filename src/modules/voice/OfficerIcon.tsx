import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowsRightLeft,
  HiOutlineBolt,
  HiOutlineHeart,
  HiOutlineScale,
} from 'react-icons/hi2'
import type { OfficerType } from './types'

const icons = {
  random: HiOutlineArrowsRightLeft,
  pressure: HiOutlineBolt,
  standard: HiOutlineScale,
  friendly: HiOutlineHeart,
  custom: HiOutlineAdjustmentsHorizontal,
}

const tones = {
  random: 'bg-[#f2f2f7] text-[#424245]',
  pressure: 'bg-[#fff0ef] text-[#b53a34]',
  standard: 'bg-[#eaf4ff] text-[#0062c3]',
  friendly: 'bg-[#eaf8f2] text-[#147a58]',
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
