"use client"

import type React from "react"

import { useState } from "react"

interface WeightPickerProps {
  value: number
  onChange: (value: number) => void
}

export function WeightPicker({ value, onChange }: WeightPickerProps) {
  const [inputValue, setInputValue] = useState(value.toString())

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number.parseFloat(e.target.value)
    setInputValue(newValue.toFixed(1))
    onChange(newValue)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    const parsed = Number.parseFloat(newValue)
    if (!isNaN(parsed) && parsed >= 30 && parsed <= 300) {
      onChange(parsed)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-5xl font-bold text-[#4f6e2c] mb-2">
          {Number.parseFloat(value.toString()).toFixed(1)} kg
        </div>
        <input
          type="number"
          value={inputValue}
          onChange={handleInputChange}
          min="30"
          max="300"
          step="0.1"
          className="w-32 text-center p-2 border-2 border-[#e5e5e5] rounded-lg text-lg font-semibold focus:border-[#4f6e2c] focus:outline-none"
        />
      </div>

      <div className="px-2">
        <input
          type="range"
          min="30"
          max="300"
          step="0.1"
          value={value}
          onChange={handleSliderChange}
          className="w-full h-3 bg-[#e5e5e5] rounded-lg appearance-none cursor-pointer accent-[#4f6e2c]"
          style={{
            background: `linear-gradient(to right, #4f6e2c 0%, #4f6e2c ${((Number.parseFloat(value.toString()) - 30) / (300 - 30)) * 100}%, #e5e5e5 ${((Number.parseFloat(value.toString()) - 30) / (300 - 30)) * 100}%, #e5e5e5 100%)`,
          }}
        />
        <div className="flex justify-between text-xs text-[#777] mt-2">
          <span>30 kg</span>
          <span>300 kg</span>
        </div>
      </div>
    </div>
  )
}
