"use client"

import type React from "react"

interface CpfInputProps {
  value: string
  onChange: (value: string) => void
}

export function CpfInput({ value, onChange }: CpfInputProps) {
  const formatCpf = (input: string): string => {
    const numbers = input.replace(/\D/g, "").slice(0, 11)
    
    if (numbers.length <= 3) return numbers
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCpf(e.target.value)
    onChange(formatted)
  }

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      placeholder="000.000.000-00"
      maxLength={14}
      className="w-full p-3 border border-[#e5e5e5] rounded-lg text-base"
    />
  )
}
