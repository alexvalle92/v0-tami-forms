"use client"

import type React from "react"

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
}

export function PhoneInput({ value, onChange }: PhoneInputProps) {
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

  return (
    <input
      type="tel"
      value={value}
      onChange={handleChange}
      placeholder="(44) 9 9999-9999"
      className="w-full p-3 border border-[#e5e5e5] rounded-lg text-base focus:border-[#4f6e2c] focus:outline-none"
    />
  )
}
