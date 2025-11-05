interface ProgressBarProps {
  current: number
  total: number
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const percentage = (current / total) * 100

  return (
    <div className="w-full h-2 bg-[#eee] rounded-full overflow-hidden">
      <div className="h-full bg-[#4f6e2c] transition-all duration-300 ease-out" style={{ width: `${percentage}%` }} />
    </div>
  )
}
