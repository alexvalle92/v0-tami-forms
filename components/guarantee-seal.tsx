import { useId } from "react"

const CX = 100
const CY = 100

/** Borda serrilhada: alterna raio externo e interno. */
const SERRATED_POINTS = Array.from({ length: 72 }, (_, i) => {
  const r = i % 2 === 0 ? 99 : 91
  const a = (Math.PI * 2 * i) / 72 - Math.PI / 2
  return `${(CX + r * Math.cos(a)).toFixed(2)},${(CY + r * Math.sin(a)).toFixed(2)}`
}).join(" ")

/** Raios de luz do miolo: triângulos finos saindo do centro. */
const RAYS = Array.from({ length: 28 }, (_, i) => {
  const a = (Math.PI * 2 * i) / 28
  const spread = 0.045
  const r = 60
  const p1 = `${(CX + r * Math.cos(a - spread)).toFixed(2)},${(CY + r * Math.sin(a - spread)).toFixed(2)}`
  const p2 = `${(CX + r * Math.cos(a + spread)).toFixed(2)},${(CY + r * Math.sin(a + spread)).toFixed(2)}`
  return `${CX},${CY} ${p1} ${p2}`
})

function starPoints(x: number, y: number, outer: number, inner: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI * i) / 5 - Math.PI / 2
    return `${(x + r * Math.cos(a)).toFixed(2)},${(y + r * Math.sin(a)).toFixed(2)}`
  }).join(" ")
}

const STARS = [88, 100, 112].flatMap((y) => [starPoints(30, y, 4, 1.7), starPoints(170, y, 4, 1.7)])

export function GuaranteeSeal({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "")
  const gold = `gold-${id}`
  const goldEdge = `gold-edge-${id}`
  const dark = `dark-${id}`
  const top = `top-${id}`
  const bottom = `bottom-${id}`
  const clip = `clip-${id}`

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Selo de garantia de 7 dias">
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff1a8" />
          <stop offset="30%" stopColor="#e9c25a" />
          <stop offset="55%" stopColor="#b8862b" />
          <stop offset="80%" stopColor="#f3d57a" />
          <stop offset="100%" stopColor="#9c6d1c" />
        </linearGradient>
        <linearGradient id={goldEdge} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#7a5312" />
          <stop offset="50%" stopColor="#f6dc8a" />
          <stop offset="100%" stopColor="#7a5312" />
        </linearGradient>
        <radialGradient id={dark} cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#2a3550" />
          <stop offset="70%" stopColor="#141a2b" />
          <stop offset="100%" stopColor="#0a0d16" />
        </radialGradient>
        <path id={top} d={`M ${CX - 63} ${CY} A 63 63 0 0 1 ${CX + 63} ${CY}`} />
        <path id={bottom} d={`M ${CX - 76} ${CY} A 76 76 0 0 0 ${CX + 76} ${CY}`} />
        <clipPath id={clip}>
          <circle cx={CX} cy={CY} r="57" />
        </clipPath>
      </defs>

      {/* Borda dourada serrilhada */}
      <polygon points={SERRATED_POINTS} fill={`url(#${gold})`} />
      <circle cx={CX} cy={CY} r="86" fill="none" stroke={`url(#${goldEdge})`} strokeWidth="2" />

      {/* Anel escuro com o texto */}
      <circle cx={CX} cy={CY} r="82" fill={`url(#${dark})`} stroke={`url(#${goldEdge})`} strokeWidth="2.5" />

      {/* Miolo com raios */}
      <circle cx={CX} cy={CY} r="58" fill={`url(#${dark})`} stroke={`url(#${gold})`} strokeWidth="3" />
      <g clipPath={`url(#${clip})`} fill="#f3d57a" opacity="0.12">
        {RAYS.map((pts, i) => (
          <polygon key={i} points={pts} />
        ))}
      </g>

      <g fill={`url(#${gold})`} fontFamily="inherit" fontWeight="800" letterSpacing="2">
        <text fontSize="15" textAnchor="middle">
          <textPath href={`#${top}`} startOffset="50%">
            GARANTIA
          </textPath>
        </text>
        <text fontSize="15" textAnchor="middle">
          <textPath href={`#${bottom}`} startOffset="50%">
            GARANTIA
          </textPath>
        </text>
      </g>

      <g fill={`url(#${gold})`}>
        {STARS.map((pts, i) => (
          <polygon key={i} points={pts} />
        ))}
      </g>

      <g fill={`url(#${gold})`} fontFamily="inherit" fontWeight="900" textAnchor="middle">
        <text x={CX} y="118" fontSize="62">
          7
        </text>
        <text x={CX} y="142" fontSize="17" letterSpacing="2">
          DIAS
        </text>
      </g>
    </svg>
  )
}
