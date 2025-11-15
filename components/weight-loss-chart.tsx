"use client"

import { useEffect, useRef } from "react"

interface WeightLossChartProps {
  currentWeight: number
  goalWeight: number
}

export function WeightLossChart({ currentWeight, goalWeight }: WeightLossChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    let animationFrame = 0
    const maxFrames = 120

    const drawChart = (frame: number) => {
      ctx.clearRect(0, 0, width, height)

      const progress = Math.min(frame / maxFrames, 1)
      
      // Calculate animated weight loss curve
      const weightDiff = currentWeight - goalWeight
      const dayPoints = 30
      const points: { x: number; y: number }[] = []

      for (let i = 0; i <= dayPoints; i++) {
        const dayProgress = i / dayPoints
        const x = (i / dayPoints) * width
        
        // Exponential decay curve for realistic weight loss
        const weightAtDay = currentWeight - weightDiff * (1 - Math.pow(1 - dayProgress, 1.5)) * progress
        const y = height - ((weightAtDay - goalWeight + 5) / (currentWeight - goalWeight + 10)) * (height - 40) - 20
        
        points.push({ x, y })
      }

      // Draw gradient fill
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, "rgba(79, 110, 44, 0.3)")
      gradient.addColorStop(1, "rgba(79, 110, 44, 0.05)")

      ctx.beginPath()
      ctx.moveTo(0, height)
      points.forEach((point, index) => {
        if (index === 0) {
          ctx.lineTo(point.x, point.y)
        } else {
          ctx.lineTo(point.x, point.y)
        }
      })
      ctx.lineTo(width, height)
      ctx.closePath()
      ctx.fillStyle = gradient
      ctx.fill()

      // Draw line
      ctx.beginPath()
      ctx.strokeStyle = "#4f6e2c"
      ctx.lineWidth = 3
      ctx.lineCap = "round"
      ctx.lineJoin = "round"

      points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y)
        } else {
          ctx.lineTo(point.x, point.y)
        }
      })
      ctx.stroke()

      // Draw start point circle
      if (progress > 0.1) {
        ctx.beginPath()
        ctx.arc(points[0].x, points[0].y, 8, 0, Math.PI * 2)
        ctx.fillStyle = "#4f6e2c"
        ctx.fill()
        ctx.strokeStyle = "white"
        ctx.lineWidth = 3
        ctx.stroke()
      }

      // Draw end point with label (animated)
      if (progress > 0.8) {
        const endPoint = points[points.length - 1]
        const endProgress = Math.min((progress - 0.8) / 0.2, 1)
        
        ctx.beginPath()
        ctx.arc(endPoint.x, endPoint.y, 8 * endProgress, 0, Math.PI * 2)
        ctx.fillStyle = "#bb951c"
        ctx.fill()
        ctx.strokeStyle = "white"
        ctx.lineWidth = 3
        ctx.stroke()

        // Draw goal weight label
        if (endProgress > 0.5) {
          ctx.font = "bold 16px system-ui"
          ctx.fillStyle = "#333"
          ctx.textAlign = "right"
          ctx.fillText(`${goalWeight.toFixed(1)}kg`, endPoint.x - 15, endPoint.y - 15)
        }
      }

      // Draw grid lines (subtle)
      ctx.strokeStyle = "rgba(0, 0, 0, 0.05)"
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])

      for (let i = 1; i < 4; i++) {
        const y = (height / 4) * i
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      ctx.setLineDash([])

      if (frame < maxFrames) {
        animationFrame = requestAnimationFrame(() => drawChart(frame + 1))
      }
    }

    drawChart(0)

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [currentWeight, goalWeight])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-6 border border-[#e5e5e5]">
        <div className="mb-4 text-center">
          <p className="text-lg text-[#555]">
            Prevejo que você estará com{" "}
            <span className="font-bold text-[#bb951c] text-2xl">{goalWeight}kg</span> em{" "}
            <span className="font-bold text-[#4f6e2c]">30 dias</span>
          </p>
        </div>

        <div className="relative">
          <canvas ref={canvasRef} width={600} height={300} className="w-full h-auto" />
          
          <div className="flex justify-between mt-2 text-sm text-[#888]">
            <span>Hoje</span>
            <span>15 dias</span>
            <span>30 dias</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="bg-[#f5f9f1] rounded-lg p-3 text-center">
            <p className="text-xs text-[#555] mb-1">Peso Atual</p>
            <p className="text-xl font-bold text-[#4f6e2c]">{currentWeight}kg</p>
          </div>
          <div className="bg-[#fff8e6] rounded-lg p-3 text-center">
            <p className="text-xs text-[#555] mb-1">Meta em 30 dias</p>
            <p className="text-xl font-bold text-[#bb951c]">{goalWeight}kg</p>
          </div>
        </div>
      </div>
    </div>
  )
}
