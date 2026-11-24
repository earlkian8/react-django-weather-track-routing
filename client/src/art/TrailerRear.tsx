interface Props {
  x: number
  y: number
  width: number
}

/** The back of a semi-trailer, standing on the road at x, y. */
export function TrailerRear({ x, y, width }: Props) {
  return (
    <g transform={`translate(${x - width / 2} ${y - width * 1.5}) scale(${width / 100})`}>
      <path d="M4 148h92l8 4H-4Z" fill="#000" opacity="0.3" />
      <path d="M8 112h20v36H8ZM72 112h20v36H72Z" fill="#171d20" />
      <path d="M18 112v36M82 112v36" stroke="#3a4347" strokeWidth="1.600" />
      <rect x="28" y="112" width="44" height="10" fill="#20292d" />
      <path d="M6 5h88v107H6Z" fill="#f2f6f3" stroke="#20292d" strokeWidth="2.400" />
      <path d="M50 8v98" stroke="#20292d" strokeWidth="1.800" />
      <path d="M11 10h35v92H11ZM54 10h35v92H54Z" fill="#e3eae6" />
      <path d="M41 8v96M59 8v96" stroke="#7e8b87" strokeWidth="2.200" />
      <path d="M37 60h8M55 60h8" stroke="#4a5559" strokeWidth="3" strokeLinecap="round" />
      <path d="M6 36h88v14H6Z" fill="#00644a" />
      <path d="M7 106h86v6H7Z" fill="#fff" />
      <path d="M7 109h86" stroke="#b4232f" strokeWidth="6" strokeDasharray="9 7" />
      <path d="M6 3h88v3H6Z" fill="#20292d" />
      <path d="M40 4.500h4M48 4.500h4M56 4.500h4M9 4.500h4M87 4.500h4" stroke="#ff5a3d" strokeWidth="2.600" />
      <path d="M11 115h12v5H11ZM77 115h12v5H77Z" fill="#ff4a3a" />
      <path d="M10 124h14l-1 12H11ZM76 124h14l-1 12H77Z" fill="#20292d" />
      <rect x="43" y="124" width="14" height="7" fill="#fff" />
    </g>
  )
}
