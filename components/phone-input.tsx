"use client"

import type React from "react"
import { useEffect, useRef } from "react"

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
}

export function PhoneInput({ value, onChange, onEnter }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const formatPhone = (input: string) => {
    // Remove tudo que não é número
    const numbers = input.replace(/\D/g, "")

    // Limita a 11 dígitos (DDD + 9 dígitos)
    const limited = numbers.slice(0, 11)

    // Aplica a máscara
    if (limited.length <= 2) {
      return limited
    } else if (limited.length <= 3) {
      return `(${limited.slice(0, 2)}) ${limited.slice(2)}`
    } else if (limited.length <= 7) {
      return `(${limited.slice(0, 2)}) ${limited.slice(2, 3)} ${limited.slice(3)}`
    } else {
      return `(${limited.slice(0, 2)}) ${limited.slice(2, 3)} ${limited.slice(3, 7)}-${limited.slice(7)}`
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value)
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
      type="tel"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder="(44) 9 9999-9999"
      className="w-full p-3 border border-[#e5e5e5] rounded-lg text-base focus:border-[#4f6e2c] focus:outline-none"
    />
  )
}
