"use client"

import { Check } from 'lucide-react'

interface SummaryStepProps {
  answers: Record<string, any>
}

export function SummaryStep({ answers }: SummaryStepProps) {
  const getSummaryData = () => {
    return [
      { label: "Faixa Etária", value: answers.faixa_etaria },
      { label: "Tipo Físico", value: answers.tipo_fisico },
      { label: "Corpo Desejado", value: answers.corpo_desejado },
      { label: "Altura", value: `${answers.altura_cm} cm` },
      { label: "Peso Atual", value: `${answers.peso_kg} kg` },
      { label: "Meta de Peso (30 dias)", value: `${answers.meta_peso_30d} kg` },
      { label: "IMC", value: answers.imc },
      { label: "Café da Manhã", value: answers.cafe_da_manha },
      { label: "Almoço", value: answers.almoco },
      { label: "Lanche da Tarde", value: answers.lanche_tarde },
      { label: "Jantar", value: answers.jantar },
      { label: "Sobremesa", value: answers.sobremesa === "sim" ? "Sim" : "Não" },
      { label: "Rotina", value: answers.rotina_dia },
      { label: "Sono", value: answers.sono },
      { label: "Água", value: answers.agua },
      { label: "Email", value: answers.email },
      { label: "WhatsApp", value: answers.whatsapp },
      { label: "Nome", value: answers.nome_completo },
    ].filter(item => item.value)
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-[#eef6e8] to-[#f7fbf3] border-2 border-[#4f6e2c] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Check className="w-6 h-6 text-[#4f6e2c]" />
          <h3 className="text-lg font-bold text-[#2f4a18]">Resumo do Seu Perfil</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {getSummaryData().map((item, index) => (
            <div key={index} className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-xs text-[#888] uppercase tracking-wide mb-1">{item.label}</div>
              <div className="font-semibold text-[#2f4a18]">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#fff8e6] border-l-4 border-[#bb951c] p-4 rounded-lg">
        <p className="text-sm text-[#6a5414]">
          Revise suas informações. Seu plano será totalmente personalizado com base nesses dados.
        </p>
      </div>
    </div>
  )
}
