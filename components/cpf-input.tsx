"use client"

import type React from "react"
import { useEffect, useRef } from "react"

interface CpfInputProps {
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
}

export function CpfInput({ value, onChange, onEnter }: CpfInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault()
      onEnter()
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder="000.000.000-00"
      maxLength={14}
      className="w-full p-3 border border-[#e5e5e5] rounded-lg text-base"
    />
  )
}
