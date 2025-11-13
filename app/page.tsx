"use client"

import { useState, useEffect } from "react"
import { QuizStep } from "@/components/quiz-step"
import { ProgressBar } from "@/components/progress-bar"
import { BMIDisplay } from "@/components/bmi-display"
import { HeightPicker } from "@/components/height-picker"
import { WeightPicker } from "@/components/weight-picker"
import { PhoneInput } from "@/components/phone-input"
import { CpfInput } from "@/components/cpf-input"
import { LoadingScreen } from "@/components/loading-screen"
import { Moon, Heart, Candy, Calendar, CheckCircle } from "lucide-react"
import Img1 from "@/src/img/1.png"

export default function QuizPage() {
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [showJSON, setShowJSON] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const totalSteps = 27

  const updateAnswer = (key: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  const nextStep = () => {
    setCurrentStep((prev) => {
      if (prev < totalSteps - 1) {
        return prev + 1
      }
      return prev
    })
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  const handleOptionClick = (key: string, value: any, autoAdvance = true) => {
    updateAnswer(key, value)
    if (autoAdvance) {
      setTimeout(() => nextStep(), 300)
    }
  }

  useEffect(() => {
    if (currentStep === 16 && !answers.altura_cm) {
      updateAnswer("altura_cm", "170")
    }
    if (currentStep === 17 && !answers.peso_kg) {
      updateAnswer("peso_kg", "70")
    }
    if (currentStep === 18 && !answers.meta_peso_30d) {
      updateAnswer("meta_peso_30d", "65")
    }
  }, [currentStep, answers.altura_cm, answers.peso_kg, answers.meta_peso_30d])

  useEffect(() => {
    if (currentStep === 20 && answers.altura_cm && answers.peso_kg) {
      const altura = Number.parseFloat(answers.altura_cm) / 100
      const peso = Number.parseFloat(answers.peso_kg)
      const bmi = peso / (altura * altura)
      updateAnswer("imc", bmi.toFixed(2))
    }
  }, [currentStep, answers.altura_cm, answers.peso_kg])

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return !!answers.faixa_etaria
      case 1:
        return !!answers.tipo_fisico
      case 2:
        return !!answers.corpo_desejado
      case 3:
        return !!answers.peso_comportamento
      case 5:
        return !!answers.cafe_da_manha
      case 6:
        return !!answers.almoco
      case 7:
        return !!answers.lanche_tarde
      case 8:
        return !!answers.jantar
      case 9:
        return !!answers.sobremesa
      case 11:
        return !!answers.rotina_dia
      case 12:
        return !!answers.sono
      case 13:
        return !!answers.agua
      case 14:
        return answers.habitos && answers.habitos.length > 0
      case 15:
        return !!answers.motivo
      case 16:
        return !!answers.altura_cm
      case 17:
        return !!answers.peso_kg
      case 18:
        return !!answers.meta_peso_30d
      case 21:
        return !!answers.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email)
      case 22:
        return !!answers.whatsapp && answers.whatsapp.replace(/\D/g, "").length >= 10
      case 23:
        return !!answers.nome_completo && answers.nome_completo.trim().length > 0
      case 24:
        return !!answers.cpf && answers.cpf.replace(/\D/g, "").length === 11
      default:
        return true
    }
  }

  const handleNext = () => {
    if (!canProceed()) {
      alert("Por favor, responda a pergunta antes de continuar.")
      return
    }
    nextStep()
  }

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(answers, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "respostas_quiz.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSubmitQuiz = async () => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const response = await fetch('/api/submit-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answers }),
      })

      const data = await response.json()

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
        return
      }

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar formulário')
      }

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl
      } else {
        throw new Error('URL de pagamento não encontrada')
      }
    } catch (error) {
      console.error('Erro ao enviar formulário:', error)
      setSubmitError(error instanceof Error ? error.message : 'Erro desconhecido')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center p-4">
      <div className="w-full max-w-[880px] bg-white rounded-[18px] shadow-[0_12px_40px_rgba(0,0,0,0.08)] overflow-hidden">
        <div className="p-5 md:p-6">
          <ProgressBar current={currentStep + 1} total={totalSteps} />
        </div>

        <div className="px-6 md:px-7 pb-6">
          {/* Step 1 - Age */}
          {currentStep === 0 && (
            <QuizStep
              kicker="PLANO ALIMENTAR PERSONALIZADO PARA RESULTADOS REAIS"
              title="Elimine de 5 a 10 kg em 30 dias — leve, prático e sem extremismos."
              image="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=1470&auto=format&fit=crop"
              subtitle="👉 Responda ao quiz  e em poucos minutos receba um plano exclusivo para o seu perfil."
              question="Escolha sua faixa etária para começar 👇"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                {["18-24 anos", "25-34 anos", "35-44 anos", "45-59 anos"].map((age) => (
                  <button
                    key={age}
                    onClick={() => handleOptionClick("faixa_etaria", age)}
                    className="border-2 border-[#e5e5e5] rounded-xl p-4 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all"
                  >
                    {age}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Step 2 - Body Type */}
          {currentStep === 1 && (
            <QuizStep
              title="Qual dessas opções representa melhor o seu tipo físico atual?"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  {
                    value: "magro(a)",
                    icon: "🧍‍♀️",
                    title: "Magro(a)",
                    desc: "Baixo percentual de gordura, estrutura mais fina.",
                  },
                  {
                    value: "falso magro(a)",
                    icon: "🧍‍♀️",
                    title: "Falso magro(a)",
                    desc: "Peso normal, gordura localizada e pouca definição.",
                  },
                  {
                    value: "gordinho(a)",
                    icon: "🧍‍♀️",
                    title: "Gordinho(a)",
                    desc: "Leve excesso de gordura corporal.",
                  },
                  {
                    value: "muito gordinho(a)",
                    icon: "🧍‍♀️",
                    title: "Muito gordinho(a)",
                    desc: "Acúmulo de gordura evidente.",
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("tipo_fisico", option.value)}
                    className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    <span className="text-3xl">{option.icon}</span>
                    <div>
                      <div className="font-semibold">{option.title}</div>
                      <div className="text-sm text-[#555] mt-1">{option.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Step 3 - Desired Body */}
          {currentStep === 2 && (
            <QuizStep
              title="Qual desses estilos de corpo você gostaria de conquistar?"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { value: "Magro(a)", icon: "💫", title: "Magro(a)", desc: "Leve e enxuto, pouca gordura corporal." },
                  {
                    value: "Definido(a)",
                    icon: "💪",
                    title: "Definido(a)",
                    desc: "Músculos aparentes e boa tonicidade.",
                  },
                  { value: "Seco(a)", icon: "🔥", title: "Seco(a)", desc: "Baixo % de gordura e máxima definição." },
                  {
                    value: "Corpo Violão",
                    icon: "🌸",
                    title: "Corpo Violão",
                    desc: "Cintura marcada e curvas proporcionais.",
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("corpo_desejado", option.value)}
                    className="border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    <span className="text-2xl">{option.icon}</span>
                    <div>
                      <div className="font-semibold">{option.title}</div>
                      <div className="text-sm text-[#555] mt-1">{option.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Step 4 - Weight Behavior */}
          {currentStep === 3 && (
            <QuizStep
              title="Como o seu peso costuma se comportar ao longo do tempo?"
              image="https://images.unsplash.com/photo-1556229174-5ffea0c81b?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  {
                    value: "Dificuldade para ganhar peso/massa",
                    label: "💪 Tenho dificuldade para ganhar peso ou massa muscular.",
                  },
                  {
                    value: "Oscila com facilidade",
                    label: "⚖️ Meu peso oscila com facilidade — perco e ganho rapidamente.",
                  },
                  {
                    value: "Ganho com facilidade",
                    label: "🍩 Tendo a ganhar peso com facilidade e demoro mais para eliminar.",
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("peso_comportamento", option.value)}
                    className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Step 5 - Informative */}
          {currentStep === 4 && (
            <QuizStep
              title="Prepare-se para alcançar a sua melhor versão em apenas 30 dias!"
              image="https://images.unsplash.com/photo-1505751172876-fa19230c5c528?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <p className="mb-4">
                Você vai receber todas as ferramentas que realmente funcionam para eliminar peso e transformar seu corpo
                — assim como aconteceu com a <strong>Alessandra</strong>, que conquistou um resultado impressionante em
                apenas 21 dias!
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="inline-flex items-center gap-2 bg-[#eef6e8] text-[#2f4a18] rounded-full px-3 py-2 text-sm font-semibold">
                  ✅ Sem jejum forçado
                </span>
                <span className="inline-flex items-center gap-2 bg-[#eef6e8] text-[#2f4a18] rounded-full px-3 py-2 text-sm font-semibold">
                  ✅ Sem dietas radicais
                </span>
                <span className="inline-flex items-center gap-2 bg-[#eef6e8] text-[#2f4a18] rounded-full px-3 py-2 text-sm font-semibold">
                  ✅ Sem horas na academia
                </span>
              </div>
              <div className="border-l-4 border-[#4f6e2c] bg-[#f7fbf3] p-4 rounded-lg">
                📋 Um plano prático, realista e totalmente <strong>personalizado</strong> para você.
              </div>
            </QuizStep>
          )}

          {/* Steps 6-10 - Meal Times */}
          {currentStep === 5 && (
            <QuizStep
              title="Em qual horário você costuma fazer o café da manhã?"
              image="https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "6-8", label: "☀️ Entre 6h e 8h" },
                  { value: "8-10", label: "🌤️ Entre 8h e 10h" },
                  { value: "10-12", label: "🌞 Entre 10h e 12h" },
                  { value: "nao tomo", label: "🚫 Geralmente não tomo" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("cafe_da_manha", option.value)}
                    className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {currentStep === 6 && (
            <QuizStep
              title="Qual é o horário em que você costuma almoçar?"
              image="https://images.unsplash.com/photo-1512621776951-4b52a1a014c8?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "10-11", label: "🍽️ 10h–11h" },
                  { value: "11-12", label: "🥗 11h–12h" },
                  { value: "12-13", label: "🍛 12h–13h" },
                  { value: "13-14", label: "🍲 13h–14h" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("almoco", option.value)}
                    className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {currentStep === 7 && (
            <QuizStep
              title="Em qual horário você costuma fazer o lanche da tarde?"
              image="https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "14-15", label: "🕑 14h–15h" },
                  { value: "15-16", label: "🕒 15h–16h" },
                  { value: "16-17", label: "🕓 16h–17h" },
                  { value: "nao faco", label: "🚫 Não faço" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("lanche_tarde", option.value)}
                    className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {currentStep === 8 && (
            <QuizStep
              title="Qual é o horário em que você costuma jantar?"
              image="https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "16-18", label: "🍽️ 16h–18h" },
                  { value: "18-20", label: "🥗 18h–20h" },
                  { value: "20-22", label: "🍲 20h–22h" },
                  { value: "nao janto", label: "🚫 Não janto" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("jantar", option.value)}
                    className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {currentStep === 9 && (
            <QuizStep
              title="Você quer ter uma opção de sobremesa no seu plano alimentar?"
              image="https://images.unsplash.com/photo-1578985545062-69928b1d9587?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "sim", label: "🍫 Sim, com certeza!" },
                  { value: "nao", label: "🍎 Não, prefiro evitar." },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("sobremesa", option.value)}
                    className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Step 11 - Foods Info */}
          {currentStep === 10 && (
            <QuizStep
              title="Equilíbrio sem culpa"
              image="https://images.unsplash.com/photo-1484980972926-edee96e0960d?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <p className="mb-4">Olha só o que você vai poder incluir no seu plano — com estratégia e moderação:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "🍞 Pão francês",
                  "🍫 Sobremesas na medida",
                  "🍔 Hambúrguer caseiro",
                  "🥤 Refrigerante",
                  "🍚 Arroz",
                  "🌰 Feijão",
                ].map((food) => (
                  <span
                    key={food}
                    className="inline-flex items-center gap-2 bg-[#eef6e8] text-[#2f4a18] rounded-full px-3 py-2 text-sm font-semibold"
                  >
                    {food}
                  </span>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Step 12 - Daily Routine */}
          {currentStep === 11 && (
            <QuizStep
              title="Como você descreveria sua rotina durante o dia?"
              image="https://images.unsplash.com/photo-1529070538774-1843cb3265df?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "sedentario", label: "💺 Passo a maior parte do tempo sentado(a)" },
                  { value: "moderado", label: "🚶‍♀️ Pausas ativas ou movimento ocasional" },
                  { value: "ativo", label: "🧍‍♀️ Em pé ou em movimento quase todo o dia" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("rotina_dia", option.value)}
                    className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Step 13 - Sleep */}
          {currentStep === 12 && (
            <QuizStep
              title="Quantas horas de sono você costuma ter por noite?"
              image="https://images.unsplash.com/photo-1512850183-6d7990f42385?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "<5", label: "😴 Menos de 5 horas" },
                  { value: "5-6", label: "🌙 5–6 horas" },
                  { value: "7-8", label: "💤 7–8 horas" },
                  { value: ">8", label: "☀️ Mais de 8 horas" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("sono", option.value)}
                    className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Step 14 - Water */}
          {currentStep === 13 && (
            <QuizStep
              title="Qual é a sua média de consumo de água por dia?"
              image={Img1}
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "quase nao", label: "☕ Quase não bebo água" },
                  { value: "~500ml", label: "🥤 Aproximadamente 2 copos (500 ml)" },
                  { value: "0.5-1.5L", label: "💧 2–6 copos (0,5–1,5 L)" },
                  { value: ">6 copos", label: "🚰 Mais de 6 copos" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("agua", option.value)}
                    className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Step 15 - Habits (Multiple) */}
          {currentStep === 14 && (
            <QuizStep
              title="Você se identifica com algum desses hábitos alimentares?"
              subtitle="(selecione os que se aplicam)"
              image="https://images.unsplash.com/photo-1512621776951-4b52a1a014c8?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <div className="space-y-3">
                {[
                  { value: "madrugada", label: "Como de madrugada", icon: Moon },
                  { value: "emocional", label: "Como por emoção/ansiedade/tédio", icon: Heart },
                  { value: "doces", label: "Dificuldade em resistir a doces", icon: Candy },
                  { value: "finais de semana", label: "Exagero nos fins de semana", icon: Calendar },
                  { value: "nenhum", label: "Nenhum desses", icon: CheckCircle },
                ].map((option) => {
                  const IconComponent = option.icon
                  return (
                    <label
                      key={option.value}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={answers.habitos?.includes(option.value) || false}
                        onChange={(e) => {
                          const current = answers.habitos || []
                          if (e.target.checked) {
                            updateAnswer("habitos", [...current, option.value])
                          } else {
                            updateAnswer(
                              "habitos",
                              current.filter((v: string) => v !== option.value),
                            )
                          }
                        }}
                        className="w-5 h-5 accent-[#4f6e2c]"
                      />
                      <IconComponent className="w-6 h-6 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </label>
                  )
                })}
              </div>
              <div className="mt-4 bg-[#fff8e6] border border-[#f1dfa9] text-[#6a5414] p-3 rounded-lg text-sm flex items-start gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Dica: se marcar "Nenhum desses", deixe os demais desmarcados.</span>
              </div>
            </QuizStep>
          )}

          {/* Step 16 - Motivation */}
          {currentStep === 15 && (
            <QuizStep
              title="Qual é o principal motivo que te faz querer entrar em forma?"
              image="https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "autoestima", label: "💃 Aumentar autoconfiança e autoestima" },
                  { value: "saude", label: "💪 Melhorar saúde e disposição" },
                  { value: "roupas", label: "👗 Voltar a usar as roupas que gosto" },
                  { value: "pos-gestacao", label: "🤱 Recuperar o corpo pós-gestação" },
                  { value: "outro", label: "📝 Outro motivo pessoal" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick("motivo", option.value)}
                    className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Step 17 - Height */}
          {currentStep === 16 && (
            <QuizStep
              title="Qual é a sua altura (em centímetros)?"
              image="https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <HeightPicker value={answers.altura_cm || 170} onChange={(value) => updateAnswer("altura_cm", value)} />
              <div className="mt-4 bg-[#fff8e6] border border-[#f1dfa9] text-[#6a5414] p-3 rounded-lg text-sm">
                📏 Essa informação é fundamental para calcular seu plano.
              </div>
            </QuizStep>
          )}

          {/* Step 18 - Weight */}
          {currentStep === 17 && (
            <QuizStep
              title="Informe seu peso atual (em kg):"
              image="https://images.unsplash.com/photo-1607473129011-e674e9b20e8a?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <WeightPicker value={answers.peso_kg || 70} onChange={(value) => updateAnswer("peso_kg", value)} />
            </QuizStep>
          )}

          {/* Step 19 - Goal Weight */}
          {currentStep === 18 && (
            <QuizStep
              title="Qual é a sua meta de peso para os próximos 30 dias?"
              image="https://images.unsplash.com/photo-1544025162-3a38b5f1e9b1?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <WeightPicker
                value={answers.meta_peso_30d || (answers.peso_kg ? Number.parseFloat(answers.peso_kg) - 5 : 65)}
                onChange={(value) => updateAnswer("meta_peso_30d", value)}
              />
              <div className="mt-4 bg-[#fff8e6] border border-[#f1dfa9] text-[#6a5414] p-3 rounded-lg text-sm">
                Seja realista — ajustaremos o plano com base nessa meta.
              </div>
            </QuizStep>
          )}

          {/* Step 20 - BMI Display */}
          {currentStep === 19 && (
            <QuizStep
              title="Aqui está o seu perfil de bem-estar"
              image="https://images.unsplash.com/photo-1521804906057-1df8fdb0d23a?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <BMIDisplay
                height={Number.parseFloat(answers.altura_cm) || 170}
                weight={Number.parseFloat(answers.peso_kg) || 70}
              />
              <ul className="mt-4 space-y-2 text-[#555]">
                <li>✓ Menor risco de doenças crônicas (diabetes, hipertensão e cardíacas).</li>
                <li>✓ Melhor controle de colesterol e pressão arterial.</li>
                <li>✓ Mais qualidade de vida e disposição.</li>
              </ul>
            </QuizStep>
          )}

          {/* Step 21 - Prediction */}
          {currentStep === 20 && (
            <QuizStep
              title="A última dieta que você precisará para ficar em forma!"
              image="https://images.unsplash.com/photo-1544148103-0773bf10d330?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <p className="mb-4">
                Plano de 30 dias de Emagrecimento quase pronto! De acordo com as suas respostas, você está pronto(a)
                para alcançar resultados consistentes.
              </p>
              <div className="border-l-4 border-[#4f6e2c] bg-[#f7fbf3] p-4 rounded-lg">
                Previsão de peso em 30 dias: <strong>{answers.meta_peso_30d || "--"} kg</strong>
              </div>
            </QuizStep>
          )}

          {/* Step 22 - Email */}
          {currentStep === 21 && (
            <QuizStep
              title="Digite seu e-mail para receber seu plano personalizado:"
              image="https://images.unsplash.com/photo-1492724441997-5dc865305da7?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <input
                type="email"
                value={answers.email || ""}
                onChange={(e) => updateAnswer("email", e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="w-full p-3 border border-[#e5e5e5] rounded-lg text-base"
              />
            </QuizStep>
          )}

          {/* Step 23 - Phone */}
          {currentStep === 22 && (
            <QuizStep
              title="Informe seu número de WhatsApp:"
              image="https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <PhoneInput value={answers.whatsapp || ""} onChange={(value) => updateAnswer("whatsapp", value)} />
              <div className="mt-4 bg-[#fff8e6] border border-[#f1dfa9] text-[#6a5414] p-3 rounded-lg text-sm">
                📱 Inclua o DDD antes do número.
              </div>
            </QuizStep>
          )}

          {/* Step 24 - Name */}
          {currentStep === 23 && (
            <QuizStep
              title="Qual seu nome?"
              subtitle="(nome completo)"
              image="https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <input
                type="text"
                value={answers.nome_completo || ""}
                onChange={(e) => updateAnswer("nome_completo", e.target.value)}
                placeholder="Digite seu nome completo"
                className="w-full p-3 border border-[#e5e5e5] rounded-lg text-base"
              />
            </QuizStep>
          )}

          {/* Step 25 - CPF */}
          {currentStep === 24 && (
            <QuizStep
              title="Informe seu CPF:"
              subtitle="(necessário para emissão da nota fiscal)"
              image="https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <CpfInput value={answers.cpf || ""} onChange={(value) => updateAnswer("cpf", value)} />
              <div className="mt-4 bg-[#fff8e6] border border-[#f1dfa9] text-[#6a5414] p-3 rounded-lg text-sm">
                🔒 Seus dados estão seguros e protegidos.
              </div>
            </QuizStep>
          )}

          {currentStep === 25 && <LoadingScreen onComplete={nextStep} />}

          {currentStep >= 26 && (
            <QuizStep
              title={`${answers.nome_completo?.split(" ")[0] || "Seu"} plano exclusivo está pronto!`}
              image="https://images.unsplash.com/photo-1494390248081-4e521a5940db?q=80&w=1470&auto=format&fit=crop"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onPrev={prevStep}
              canGoBack={currentStep > 0 && !isSubmitting}
            >
              <p className="mb-4">
                {answers.nome_completo?.split(" ")[0] || "Você"}, seu plano para alcançar{" "}
                <strong>{answers.meta_peso_30d || "sua melhor versão"} kg</strong> está pronto. Ele é flexível, leve e
                sem restrições extremas — ajustado à sua rotina.
              </p>

              <div className="space-y-3 mb-4">
                <div className="bg-[#eef6e8] border-l-4 border-[#4f6e2c] p-4 rounded-lg">
                  <p className="font-semibold text-[#2f4a18] mb-2">✨ O que você receberá:</p>
                  <ul className="text-sm text-[#2f4a18] space-y-1">
                    <li>✓ Plano alimentar completo para 30 dias</li>
                    <li>✓ Cardápio personalizado baseado no seu perfil</li>
                    <li>✓ Lista de compras organizada</li>
                    <li>✓ Orientações nutricionais detalhadas</li>
                  </ul>
                </div>

                <div className="bg-[#fff8e6] border border-[#f1dfa9] p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-[#4f6e2c] mb-1">R$ 49,90</p>
                  <p className="text-sm text-[#6a5414]">Investimento único • Acesso imediato</p>
                </div>
              </div>

              {submitError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
                  ⚠️ {submitError}
                </div>
              )}

              <button
                onClick={handleSubmitQuiz}
                disabled={isSubmitting}
                className="w-full bg-[#4f6e2c] text-white font-bold py-4 px-6 rounded-lg hover:brightness-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              >
                {isSubmitting ? '⏳ Processando...' : '🔒 Garantir Meu Plano Agora'}
              </button>

              <p className="text-xs text-center text-[#888] mt-3">
                Você será redirecionado para a página de pagamento seguro
              </p>
            </QuizStep>
          )}
        </div>
      </div>
    </div>
  )
}
