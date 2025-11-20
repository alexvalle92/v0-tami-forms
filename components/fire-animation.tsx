"use client"

import { useEffect, useRef } from "react"

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

export function FireAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const particles: Particle[] = []
    const particleCount = 80
    let animationFrameId: number

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    const createParticle = () => {
      const centerX = canvas.width / (window.devicePixelRatio || 1) / 2
      const baseY = canvas.height / (window.devicePixelRatio || 1) - 20

      return {
        x: centerX + (Math.random() - 0.5) * 40,
        y: baseY,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 4 - 2,
        life: 1,
        maxLife: Math.random() * 60 + 40,
        size: Math.random() * 8 + 4,
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(createParticle())
    }

    const animate = () => {
      const rect = canvas.getBoundingClientRect()
      ctx.clearRect(0, 0, rect.width, rect.height)

      particles.forEach((particle, index) => {
        particle.x += particle.vx
        particle.y += particle.vy
        particle.vy += 0.1
        particle.life -= 1

        if (particle.life <= 0) {
          particles[index] = createParticle()
          return
        }

        const opacity = particle.life / particle.maxLife
        const normalizedLife = 1 - particle.life / particle.maxLife

        let r, g, b
        if (normalizedLife < 0.3) {
          r = 255
          g = Math.floor(255 * (normalizedLife / 0.3))
          b = 0
        } else if (normalizedLife < 0.6) {
          r = 255
          g = 200 + Math.floor(55 * ((normalizedLife - 0.3) / 0.3))
          b = 0
        } else {
          const fade = (normalizedLife - 0.6) / 0.4
          r = 255 - Math.floor(100 * fade)
          g = 255 - Math.floor(100 * fade)
          b = Math.floor(50 * fade)
        }

        const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.size)
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity})`)
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${opacity * 0.5})`)
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
      })

      animationFrameId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resizeCanvas)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <div className="relative w-full h-64 md:h-80 flex items-center justify-center my-6">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="relative z-10 text-center">
        <div className="text-5xl md:text-7xl font-bold bg-gradient-to-t from-[#ff6b00] via-[#ff9500] to-[#ffd700] bg-clip-text text-transparent animate-pulse">
          🔥
        </div>
        <p className="text-sm md:text-base text-[#ff6b00] font-semibold mt-2 drop-shadow-lg">
          Transformação em progresso
        </p>
      </div>
    </div>
  )
}
