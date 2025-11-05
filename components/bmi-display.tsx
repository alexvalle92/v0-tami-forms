interface BMIDisplayProps {
  height: number // in cm
  weight: number // in kg
}

export function BMIDisplay({ height, weight }: BMIDisplayProps) {
  const heightInMeters = height / 100
  const bmi = weight / (heightInMeters * heightInMeters)

  let category = ""
  let description = ""
  let position = 0 // Position on the scale (0-100%)

  if (bmi < 18.5) {
    category = "Abaixo do peso"
    description =
      "Seu IMC indica que você está abaixo do peso ideal. É importante garantir uma alimentação adequada para ganhar massa de forma saudável."
    position = (bmi / 18.5) * 20 // 0-20% of scale
  } else if (bmi < 25) {
    category = "Peso saudável"
    description =
      "Parabéns! Seu IMC está na faixa saudável. Mantenha seus hábitos alimentares equilibrados e continue cuidando da sua saúde."
    position = 20 + ((bmi - 18.5) / (25 - 18.5)) * 20 // 20-40% of scale
  } else if (bmi < 30) {
    category = "Sobrepeso"
    description =
      "Seu IMC indica sobrepeso. Com o plano alimentar adequado, você pode alcançar o peso ideal e melhorar sua saúde significativamente."
    position = 40 + ((bmi - 25) / (30 - 25)) * 20 // 40-60% of scale
  } else if (bmi < 40) {
    category = "Obeso"
    description =
      "Seu IMC indica obesidade. É fundamental iniciar mudanças nos hábitos alimentares para prevenir problemas de saúde e melhorar sua qualidade de vida."
    position = 60 + ((bmi - 30) / (40 - 30)) * 20 // 60-80% of scale
  } else {
    category = "Obeso Mórbido"
    description =
      "Seu IMC indica obesidade mórbida. Recomendamos acompanhamento médico junto com o plano alimentar para garantir sua saúde e bem-estar."
    position = 80 + Math.min(((bmi - 40) / 10) * 20, 20) // 80-100% of scale
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-[#4f6e2c] font-bold text-4xl mb-2">IMC: {bmi.toFixed(1)}</div>
        <div className="text-xl font-semibold text-[#1e1e1e] mb-2">{category}</div>
        <p className="text-[#555] text-sm leading-relaxed">{description}</p>
      </div>

      {/* BMI Scale */}
      <div className="relative">
        {/* Labels */}
        <div className="flex justify-between text-xs font-semibold mb-2 text-[#1e1e1e]">
          <span className="text-center flex-1">Abaixo do peso</span>
          <span className="text-center flex-1">Peso saudável</span>
          <span className="text-center flex-1">Sobrepeso</span>
          <span className="text-center flex-1">Obeso</span>
          <span className="text-center flex-1">Obeso Mórbido</span>
        </div>

        {/* Range values */}
        <div className="flex justify-between text-xs text-[#555] mb-1">
          <span>Menor que 18,5</span>
          <span>18,5 – 24,9</span>
          <span>25,0 – 30,0</span>
          <span>30,1 – 39,9</span>
          <span>Maior que 40</span>
        </div>

        {/* Color bar */}
        <div className="relative h-12 rounded-lg overflow-hidden flex">
          <div className="flex-1 bg-yellow-300" />
          <div className="flex-1 bg-green-500" />
          <div className="flex-1 bg-orange-400" />
          <div className="flex-1 bg-red-500" />
          <div className="flex-1 bg-red-900" />
        </div>

        {/* Indicator */}
        <div
          className="absolute top-[52px] transform -translate-x-1/2 transition-all duration-500"
          style={{ left: `${position}%` }}
        >
          <div className="bg-white border-2 border-[#1e1e1e] rounded-lg px-3 py-1 shadow-lg">
            <div className="text-xs font-bold text-[#1e1e1e]">Seu IMC</div>
            <div className="text-sm font-bold text-[#4f6e2c]">{bmi.toFixed(1)}</div>
          </div>
          <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-[#1e1e1e] mx-auto" />
        </div>
      </div>

      {/* Info boxes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-16">
        <div className="bg-[#f7f7f7] p-3 rounded-lg text-center">
          <div className="text-xs text-[#777] mb-1">SEU IMC</div>
          <div className="font-bold text-[#1e1e1e]">{bmi.toFixed(1)}</div>
        </div>
        <div className="bg-[#f7f7f7] p-3 rounded-lg text-center">
          <div className="text-xs text-[#777] mb-1">PESO IDEAL</div>
          <div className="font-bold text-[#1e1e1e]">
            {(18.5 * heightInMeters * heightInMeters).toFixed(1)} -{" "}
            {(24.9 * heightInMeters * heightInMeters).toFixed(1)} KG
          </div>
        </div>
        <div className="bg-[#f7f7f7] p-3 rounded-lg text-center">
          <div className="text-xs text-[#777] mb-1">SUA ALTURA</div>
          <div className="font-bold text-[#1e1e1e]">{height} CM</div>
        </div>
        <div className="bg-[#f7f7f7] p-3 rounded-lg text-center">
          <div className="text-xs text-[#777] mb-1">SEU PESO</div>
          <div className="font-bold text-[#1e1e1e]">{weight} KG</div>
        </div>
      </div>
    </div>
  )
}
