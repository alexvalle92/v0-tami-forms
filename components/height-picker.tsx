"use client"

import type React from "react"

import { useState } from "react"

interface HeightPickerProps {
  value: number
  onChange: (value: number) => void
}

export function HeightPicker({ value, onChange }: HeightPickerProps) {
  const [inputValue, setInputValue] = useState(value.toString())

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number.parseInt(e.target.value)
    setInputValue(newValue.toString())
    onChange(newValue)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    const parsed = Number.parseInt(newValue)
    if (!isNaN(parsed) && parsed >= 120 && parsed <= 230) {
      onChange(parsed)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-5xl font-bold text-[#4f6e2c] mb-2">{value} cm</div>
        <input
          type="number"
          value={inputValue}
          onChange={handleInputChange}
          min="120"
          max="230"
          className="w-32 text-center p-2 border-2 border-[#e5e5e5] rounded-lg text-lg font-semibold focus:border-[#4f6e2c] focus:outline-none"
        />
      </div>

      <div className="px-2">
        <input
          type="range"
          min="120"
          max="230"
          value={value}
          onChange={handleSliderChange}
          className="w-full h-3 bg-[#e5e5e5] rounded-lg appearance-none cursor-pointer accent-[#4f6e2c]"
          style={{
            background: `linear-gradient(to right, #4f6e2c 0%, #4f6e2c ${((value - 120) / (230 - 120)) * 100}%, #e5e5e5 ${((value - 120) / (230 - 120)) * 100}%, #e5e5e5 100%)`,
          }}
        />
        <div className="flex justify-between text-xs text-[#777] mt-2">
          <span>120 cm</span>
          <span>230 cm</span>
        </div>
      </div>
    </div>
  )
}
