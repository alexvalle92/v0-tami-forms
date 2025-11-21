"use client"

import { useState, useEffect } from "react"
import { QuizStep } from "@/components/quiz-step"
import Image from "next/image"
import { ProgressBar } from "@/components/progress-bar"
import { BMIDisplay } from "@/components/bmi-display"
import { HeightPicker } from "@/components/height-picker"
import { WeightPicker } from "@/components/weight-picker"
import { PhoneInput } from "@/components/phone-input"
import { CpfInput } from "@/components/cpf-input"
import { LoadingScreen } from "@/components/loading-screen"
import { WeightLossChart } from "@/components/weight-loss-chart"
import { ErrorModal } from "@/components/error-modal"
import { SummaryStep } from "@/components/summary-step"
import {
  Moon,
  Heart,
  Candy,
  Calendar,
  CheckCircle,
  Sparkles,
  Dumbbell,
  Scale,
  Donut,
  Sunrise,
  Sun,
  CloudSun,
  X,
  Clock,
  Apple,
  IceCream,
  Croissant,
  Cookie,
  Armchair,
  Droplet,
  GlassWater,
  Shirt,
  Baby,
  Pencil,
  ArrowRight,
  Ruler,
  Check,
  Smartphone,
  Lock,
  AlertTriangle,
  Loader,
  CookingPot,
  Bean,
  CupSoda,
  Pizza,
  Footprints,
  Activity,
  GraduationCap,
  Award,
} from "lucide-react"
import CopoAgua from "@/src/img/copoAgua.png"
import CorpoMagra from "@/src/img/magra.jpg"
import CorpoFalsaMagra from "@/src/img/falsaMagra.jpg"
import CorpoGordinha from "@/src/img/gordinha.jpg"
import CorpoMuitoGordinha from "@/src/img/muitoGordinha.jpg"
import PesoMedida from "@/src/img/PesoMedida.png"
import Almoco from "@/src/img/almoco.png"
import CafeManha from "@/src/img/cafeManha.png"
import CafeTarde from "@/src/img/cafeTarde.png"
import Sobremesa from "@/src/img/sobremesa.png"
import PessoaComendo from "@/src/img/pessoaComendo.png"
import Noite from "@/src/img/noite.png"
import Masculino from "@/src/img/masculino.png"
import Feminino from "@/src/img/feminino.png"
import Saude from "@/src/img/saude.png"
import AutoEstima from "@/src/img/auto-estima.png"
import Peso from "@/src/img/peso.png"
import Fogo from "@/src/img/fogo.gif"

export default function QuizPage() {
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [showJSON, setShowJSON] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [errorModal, setErrorModal] = useState({ isOpen: false, message: "" })

  const totalSteps = 29

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
    // Updated step indices for height, weight, and goal weight
    if (currentStep === 18 && !answers.altura_cm) {
      // Changed from 17 to 18
      updateAnswer("altura_cm", "170")
    }
    if (currentStep === 19 && !answers.peso_kg) {
      // Changed from 18 to 19
      updateAnswer("peso_kg", "70")
    }
    if (currentStep === 20 && !answers.meta_peso_30d) {
      // Changed from 19 to 20
      updateAnswer("meta_peso_30d", "65")
    }
  }, [currentStep, answers.altura_cm, answers.peso_kg, answers.meta_peso_30d])

  useEffect(() => {
    // Updated step index for BMI calculation
    if (currentStep === 21 && answers.altura_cm && answers.peso_kg) {
      // Changed from 21 to 22
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
        return !!answers.sexo_biologico
      case 2:
        return !!answers.tipo_fisico
      case 3:
        return true
      case 4:
        return !!answers.peso_comportamento
      case 6:
        return !!answers.cafe_da_manha
      case 7:
        return !!answers.almoco
      case 8:
        return !!answers.lanche_tarde
      case 9:
        return !!answers.jantar
      case 10:
        return !!answers.sobremesa
      case 12:
        return !!answers.rotina_dia
      case 13:
        return !!answers.sono
      case 14:
        return !!answers.agua
      case 15:
        return answers.habitos && answers.habitos.length > 0
      case 16:
        return !!answers.motivo
      // Updated step indices for height, weight, and goal weight
      case 18: // Changed from 17
        return !!answers.altura_cm
      case 19: // Changed from 18
        return !!answers.peso_kg
      case 20: // Changed from 19
        return !!answers.meta_peso_30d
      // Updated step indices for email, phone, name, CPF
      case 23: // Changed from 22
        return !!answers.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email)
      case 24: // Changed from 23
        return !!answers.whatsapp && answers.whatsapp.replace(/\D/g, "").length >= 10
      case 25: // Changed from 24
        return !!answers.nome_completo && answers.nome_completo.trim().length > 0
      case 26: // Changed from 25
        return !!answers.cpf && answers.cpf.replace(/\D/g, "").length === 11
      default:
        return true
    }
  }

  const handleNext = () => {
    if (!canProceed()) {
      let errorMessage = "Por favor, responda a pergunta antes de continuar."

      switch (currentStep) {
        // Updated step index for email error message
        case 23: // Changed from 22
          if (!answers.email) {
            errorMessage = "Por favor, informe seu e-mail para continuar."
          } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email)) {
            errorMessage = "Por favor, insira um e-mail válido (exemplo: seuemail@exemplo.com)"
          }
          break
        // Updated step index for phone error message
        case 24: // Changed from 23
          if (!answers.whatsapp) {
            errorMessage = "Por favor, informe seu número de WhatsApp."
          } else if (answers.whatsapp.replace(/\D/g, "").length < 10) {
            errorMessage = "Por favor, insira um telefone válido com DDD (exemplo: (11) 98765-4321)"
          }
          break
        // Updated step index for name error message
        case 25: // Changed from 24
          errorMessage = "Por favor, informe seu nome completo para continuar."
          break
        // Updated step index for CPF error message
        case 26: // Changed from 25
          if (!answers.cpf) {
            errorMessage = "Por favor, informe seu CPF para continuar."
          } else if (answers.cpf.replace(/\D/g, "").length !== 11) {
            errorMessage = "Por favor, insira um CPF válido com 11 dígitos."
          }
          break
        // Updated step index for height error message
        case 18: // Changed from 17
          errorMessage = "Por favor, selecione sua altura antes de continuar."
          break
        // Updated step index for weight error message
        case 19: // Changed from 18
          errorMessage = "Por favor, informe seu peso atual para continuar."
          break
        // Updated step index for goal weight error message
        case 20: // Changed from 19
          errorMessage = "Por favor, defina sua meta de peso para continuar."
          break
        // Updated step index for habits error message
        case 15:
          errorMessage = "Por favor, selecione pelo menos uma opção de hábito alimentar."
          break
        default:
          errorMessage = "Por favor, selecione uma opção antes de continuar."
      }

      setErrorModal({
        isOpen: true,
        message: errorMessage,
      })
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
      const response = await fetch("/api/submit-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ answers }),
      })

      const data = await response.json()

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
        return
      }

      if (!response.ok) {
        throw new Error(data.error || "Erro ao processar formulário")
      }

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl
      } else {
        throw new Error("URL de pagamento não encontrada")
      }
    } catch (error) {
      console.error("Erro ao enviar formulário:", error)
      setSubmitError(error instanceof Error ? error.message : "Erro desconhecido")
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center p-4">
      <ErrorModal
        isOpen={errorModal.isOpen}
        message={errorModal.message}
        onClose={() => setErrorModal({ isOpen: false, message: "" })}
      />

      <div className="w-full max-w-[880px] bg-white rounded-[18px] shadow-[0_12px_40px_rgba(0,0,0,0.08)] overflow-hidden">
        {/* CHANGE: Only show progress bar if not on first step */}
        {currentStep > 0 && (
          <div className="p-5 md:p-6 bg-gradient-to-r from-[#f7fbf3] to-white">
            <ProgressBar current={currentStep + 1} total={totalSteps} />
            <div className="text-center mt-2">
              <span className="text-sm font-semibold text-[#4f6e2c]">
                {Math.round(((currentStep + 1) / totalSteps) * 100)}% concluído
              </span>
            </div>
          </div>
        )}

        {currentStep == 0 && <div className="p-5 md:p-6 bg-gradient-to-r from-[#f7fbf3] to-white"></div>}

        <div className="px-6 md:px-7 pb-6">
          {/* Step 1 - Age */}
          {currentStep === 0 && (
            <QuizStep
              kicker="PLANO ALIMENTAR PERSONALIZADO PARA RESULTADOS REAIS"
              title="Elimine até 8kg em 30 dias — leve, prático e sem extremismos."
              subtitle={
                <span className="flex items-center gap-2 text-base md:text-lg">
                  <ArrowRight className="w-5 h-5 md:w-6 md:h-6 inline-block flex-shrink-0" />
                  Responda ao quiz e em poucos minutos receba um plano alimentar exclusivo para o seu perfil.
                </span>
              }
              question="Escolha sua faixa etária para começar"
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
                    className="border-2 border-[#e5e5e5] rounded-xl p-4 md:p-5 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all hover:scale-105 active:scale-95 text-base md:text-lg font-medium"
                  >
                    {age}
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {currentStep === 1 && (
            <QuizStep
              title="Qual é o seu sexo biológico?"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                {[
                  { value: "Masculino", image: Masculino },
                  { value: "Feminino", image: Feminino },
                ].map((option) => {
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("sexo_biologico", option.value)}
                      className="border-2 border-[#e5e5e5] rounded-xl p-6 md:p-8 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all hover:scale-105 active:scale-95 flex flex-col items-center gap-3"
                    >
                      <Image
                        src={option.image || "/placeholder.svg"}
                        alt=""
                        width={90}
                        height={90}
                        className="flex-shrink-0 rounded-lg"
                      />
                      <span className="text-base md:text-lg font-medium">{option.value}</span>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {/* Step 3 - Body Type */}
          {currentStep === 2 && (
            <QuizStep
              title="Qual dessas opções representa melhor o seu tipo físico atual?"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    value: "Magro(a)",
                    image: CorpoMagra,
                    title: "Magro(a)",
                    desc: "Baixo percentual de gordura, estrutura mais fina.",
                  },
                  {
                    value: "Falso Magro(a)",
                    image: CorpoFalsaMagra,
                    title: "Falso Magro(a)",
                    desc: "Peso normal, gordura localizada e pouca definição.",
                  },
                  {
                    value: "Gordinho(a)",
                    image: CorpoGordinha,
                    title: "Gordinho(a)",
                    desc: "Leve excesso de gordura corporal.",
                  },
                  {
                    value: "Muito gordinho(a)",
                    image: CorpoMuitoGordinha,
                    title: "Muito gordinho(a)",
                    desc: "Acúmulo de gordura evidente.",
                  },
                ].map((option) => {
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("tipo_fisico", option.value)}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                    >
                      <Image
                        src={option.image || "/placeholder.svg"}
                        alt={option.title}
                        width={40}
                        height={40}
                        className="flex-shrink-0 rounded-lg"
                      />

                      <div>
                        <div className="font-semibold">{option.title}</div>
                        <div className="text-sm text-[#555] mt-1">{option.desc}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {currentStep === 3 && (
            <QuizStep
              title="o que você pode esperar:"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-5 bg-gradient-to-br from-[#eef6e8] to-white rounded-xl border-2 border-[#e5f3dd]">
                  <Image
                    src={Saude || "/placeholder.svg"}
                    alt=""
                    width={60}
                    height={60}
                    className="flex-shrink-0 rounded-lg"
                  />
                  <div className="flex-1 flex items-center">
                    <p className="text-base md:text-lg font-medium text-[#2f4a18]">- Saúde e bem-estar</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-5 bg-gradient-to-br from-[#f6f0d8] to-white rounded-xl border-2 border-[#e5f3dd]">
                  <Image
                    src={Peso || "/placeholder.svg"}
                    alt=""
                    width={60}
                    height={60}
                    className="flex-shrink-0 rounded-lg"
                  />
                  <div className="flex-1 flex items-center">
                    <p className="text-base md:text-lg font-medium text-[#2f4a18]">
                      - Perda de peso sustentável e saudável a longo prazo
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-5 bg-gradient-to-br from-[#eef6e8] to-white rounded-xl border-2 border-[#e5f3dd]">
                  <Image
                    src={AutoEstima || "/placeholder.svg"}
                    alt=""
                    width={60}
                    height={60}
                    className="flex-shrink-0 rounded-lg"
                  />
                  <div className="flex-1 flex items-center">
                    <p className="text-base md:text-lg font-medium text-[#2f4a18]">
                      - Mais confiança e autoestima renovada
                    </p>
                  </div>
                </div>
              </div>
            </QuizStep>
          )}

          {currentStep === 4 && (
            <QuizStep
              title="Como o seu peso costuma se comportar ao longo do tempo?"
              image={PesoMedida}
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  {
                    value: "Dificuldade para ganhar peso/massa",
                    label: "Tenho dificuldade para ganhar peso ou massa muscular.",
                    icon: Dumbbell,
                  },
                  {
                    value: "Oscila com facilidade",
                    label: "Meu peso oscila com facilidade — perco e ganho rapidamente.",
                    icon: Scale,
                  },
                  {
                    value: "Ganho com facilidade",
                    label: "Tendo a ganhar peso com facilidade e demoro mais para eliminar.",
                    icon: Donut,
                  },
                ].map((option) => {
                  const IconComponent = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("peso_comportamento", option.value)}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                    >
                      <IconComponent className="w-6 h-6 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {/* Step 6 - Informative (was Step 5) */}
          {currentStep === 5 && (
            <QuizStep
              title="Prepare-se para alcançar a sua melhor versão!"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="flex justify-center items-center mb-6">
                <Image src={Fogo || "/placeholder.svg"} alt="" />
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <span className="inline-flex items-center gap-2 bg-[#eef6e8] text-[#2f4a18] rounded-full px-3 py-2 text-sm font-semibold">
                  <CheckCircle className="w-6 h-6" /> Sem jejum forçado
                </span>
                <span className="inline-flex items-center gap-2 bg-[#eef6e8] text-[#2f4a18] rounded-full px-3 py-2 text-sm font-semibold">
                  <CheckCircle className="w-6 h-6" /> Sem dietas radicais
                </span>
                <span className="inline-flex items-center gap-2 bg-[#eef6e8] text-[#2f4a18] rounded-full px-3 py-2 text-sm font-semibold">
                  <CheckCircle className="w-6 h-6" /> Sem horas na academia
                </span>
              </div>
              <div className="border-l-4 border-[#4f6e2c] bg-[#f7fbf3] p-4 rounded-lg flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-[#4f6e2c] flex-shrink-0 mt-0.5" />
                <span>
                  Um plano alimentar prático, realista e totalmente <strong>personalizado</strong> para você.
                </span>
              </div>
            </QuizStep>
          )}

          {/* Steps 7-11 - Meal Times (was Steps 6-10) */}
          {currentStep === 6 && (
            <QuizStep
              title="Em qual horário você costuma fazer o café da manhã?"
              image={CafeManha}
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "6-8", label: "Entre 6h e 8h", icon: Sunrise },
                  { value: "8-10", label: "Entre 8h e 10h", icon: Sun },
                  { value: "10-12", label: "Entre 10h e 12h", icon: CloudSun },
                  { value: "nao faco", label: "Não faço e não quero fazer", icon: X },
                  { value: "nao faco e gostaria de fazer", label: "Não faço e gostaria de fazer", icon: Check },
                ].map((option) => {
                  const IconComponent = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("cafe_da_manha", option.value)}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                    >
                      <IconComponent className="w-6 h-6 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {currentStep === 7 && (
            <QuizStep
              title="Qual é o horário em que você costuma almoçar?"
              image={Almoco}
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "11-12", label: "11h–12h", icon: Clock },
                  { value: "12-13", label: "12h–13h", icon: Clock },
                  { value: "13-14", label: "13h–14h", icon: Clock },
                  { value: "nao faco", label: "Não faço e não quero fazer", icon: X },
                  { value: "nao faco e gostaria de fazer", label: "Não faço e gostaria de fazer", icon: Check },
                ].map((option) => {
                  const IconComponent = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("almoco", option.value)}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                    >
                      <IconComponent className="w-6 h-6 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {currentStep === 8 && (
            <QuizStep
              title="Em qual horário você costuma fazer o lanche da tarde?"
              image={CafeTarde}
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "14-15", label: "14h–15h", icon: Clock },
                  { value: "15-16", label: "15h–16h", icon: Clock },
                  { value: "16-17", label: "16h–17h", icon: Clock },
                  { value: "nao faco", label: "Não faço e não quero fazer", icon: X },
                  { value: "nao faco e gostaria de fazer", label: "Não faço e gostaria de fazer", icon: Check },
                ].map((option) => {
                  const IconComponent = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("lanche_tarde", option.value)}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                    >
                      <IconComponent className="w-6 h-6 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {currentStep === 9 && (
            <QuizStep
              title="Qual é o horário em que você costuma jantar?"
              image={Almoco}
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "16-18", label: "16h–18h", icon: Clock },
                  { value: "18-20", label: "18h–20h", icon: Clock },
                  { value: "20-22", label: "20h–22h", icon: Clock },
                  { value: "nao faco", label: "Não faço e não quero fazer", icon: X },
                  { value: "nao faco e gostaria de fazer", label: "Não faço e gostaria de fazer", icon: Check },
                ].map((option) => {
                  const IconComponent = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("jantar", option.value)}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                    >
                      <IconComponent className="w-6 h-6 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {currentStep === 10 && (
            <QuizStep
              title="Você quer ter uma opção de sobremesa no seu plano alimentar?"
              image={Sobremesa}
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "sim", label: "Sim, com certeza!", icon: IceCream },
                  { value: "nao", label: "Não, prefiro evitar.", icon: Apple },
                ].map((option) => {
                  const IconComponent = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("sobremesa", option.value)}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                    >
                      <IconComponent className="w-6 h-6 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {/* Step 11 - Foods Info (was Step 10) */}
          {currentStep === 11 && (
            <QuizStep
              title="Equilíbrio sem culpa"
              image={PessoaComendo}
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <p className="mb-4">
                Olha só o que você vai poder incluir no seu plano alimentar — com estratégia e moderação:
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Pão francês", icon: Croissant },
                  { label: "Sobremesas na medida", icon: Cookie },
                  { label: "Hambúrguer caseiro", icon: Pizza },
                  { label: "Refrigerante", icon: CupSoda },
                  { label: "Arroz", icon: CookingPot },
                  { label: "Feijão", icon: Bean },
                ].map((food) => {
                  const IconComponent = food.icon
                  return (
                    <span
                      key={food.label}
                      className="inline-flex items-center gap-2 bg-[#eef6e8] text-[#2f4a18] rounded-full px-3 py-2 text-sm font-semibold"
                    >
                      <IconComponent className="w-6 h-6" />
                      {food.label}
                    </span>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {/* Step 12 - Daily Routine (was Step 11) */}
          {currentStep === 12 && (
            <QuizStep
              title="Como você descreveria sua rotina durante o dia?"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "sedentario", label: "Passo a maior parte do tempo sentado(a)", icon: Armchair },
                  { value: "moderado", label: "Pausas ativas ou movimento ocasional", icon: Activity },
                  { value: "ativo", label: "Em pé ou em movimento quase todo o dia", icon: Footprints },
                ].map((option) => {
                  const IconComponent = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("rotina_dia", option.value)}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                    >
                      <IconComponent className="w-10 h-10 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {/* Step 13 - Sleep (was Step 12) */}
          {currentStep === 13 && (
            <QuizStep
              title="Quantas horas de sono você costuma ter por noite?"
              image={Noite}
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "<5", label: "Menos de 5 horas", icon: Clock },
                  { value: "5-6", label: "5–6 horas", icon: Clock },
                  { value: "7-8", label: "7–8 horas", icon: Clock },
                  { value: ">8", label: "Mais de 8 horas", icon: Clock },
                ].map((option) => {
                  const IconComponent = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("sono", option.value)}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                    >
                      <IconComponent className="w-6 h-6 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {/* Step 14 - Water (was Step 13) */}
          {currentStep === 14 && (
            <QuizStep
              title="Qual é a sua média de consumo de água por dia?"
              image={CopoAgua}
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "quase nao", label: "Quase não bebo água", icon: X },
                  { value: "~500ml", label: "Aproximadamente 2 copos (500 ml)", icon: GlassWater },
                  { value: "0.5-1.5L", label: "2–6 copos (0,5–1,5 L)", icon: Droplet },
                  { value: ">6 copos", label: "Mais de 6 copos", icon: GlassWater },
                ].map((option) => {
                  const IconComponent = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("agua", option.value)}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                    >
                      <IconComponent className="w-6 h-6 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {/* Step 15 - Habits (was Step 14) */}
          {currentStep === 15 && (
            <QuizStep
              title="Você se identifica com algum desses hábitos alimentares?"
              subtitle="(selecione os que se aplicam)"
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
                      <IconComponent className="w-10 h-10 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </label>
                  )
                })}
              </div>
              <div className="mt-4 bg-[#fff8e6] border border-[#f1dfa9] text-[#6a5414] p-3 rounded-lg text-sm flex items-start gap-2">
                <CheckCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                <span>Dica: se marcar "Nenhum desses", deixe os demais desmarcados.</span>
              </div>
            </QuizStep>
          )}

          {/* Step 16 - Motivation (was Step 15) */}
          {currentStep === 16 && (
            <QuizStep
              title="Qual é o principal motivo que te faz querer entrar em forma?"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-3">
                {[
                  { value: "autoestima", label: "Aumentar autoconfiança e autoestima", icon: Sparkles },
                  { value: "saude", label: "Melhorar saúde e disposição", icon: Heart },
                  { value: "roupas", label: "Voltar a usar as roupas que gosto", icon: Shirt },
                  { value: "pos-gestacao", label: "Recuperar o corpo pós-gestação", icon: Baby },
                  { value: "outro", label: "Outro motivo pessoal", icon: Pencil },
                ].map((option) => {
                  const IconComponent = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleOptionClick("motivo", option.value)}
                      className="w-full border-2 border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3 hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all text-left"
                    >
                      <IconComponent className="w-10 h-10 text-[#4f6e2c] flex-shrink-0" />
                      <span className="text-base">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </QuizStep>
          )}

          {/* Step 17 - Nutritionist Introduction */}
          {currentStep === 17 && (
            <QuizStep
              title="Conheça sua nutricionista"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <div className="space-y-6">
                {/* Nutritionist Photo */}
                <div className="flex justify-center">
                  <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-[#4f6e2c] shadow-lg">
                    <img
                      src="/placeholder.svg?height=128&width=128"
                      alt="Nutricionista"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* Nutritionist Info */}
                <div className="space-y-4 text-center">
                  <h3 className="text-xl font-semibold text-[#4f6e2c]">Dra. Maria Silva</h3>
                  <p className="text-sm text-gray-600">CRN 12345</p>
                </div>

                {/* About Sections */}
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-[#f5f9f1] to-white rounded-xl p-5 border border-[#e5e5e5]">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#4f6e2c] flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-800 mb-1">Formação</h4>
                        <p className="text-sm text-gray-600">
                          Nutricionista formada pela Universidade Federal, com especialização em nutrição clínica e
                          emagrecimento saudável.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-[#f5f9f1] to-white rounded-xl p-5 border border-[#e5e5e5]">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#4f6e2c] flex items-center justify-center flex-shrink-0">
                        <Award className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-800 mb-1">Experiência</h4>
                        <p className="text-sm text-gray-600">
                          Mais de 10 anos de experiência atendendo pacientes e criando planos alimentares personalizados
                          com foco em resultados sustentáveis.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-[#f5f9f1] to-white rounded-xl p-5 border border-[#e5e5e5]">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#4f6e2c] flex items-center justify-center flex-shrink-0">
                        <Heart className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-800 mb-1">Abordagem</h4>
                        <p className="text-sm text-gray-600">
                          Acredita em uma nutrição equilibrada, sem restrições extremas, priorizando sua saúde e
                          bem-estar a longo prazo.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#4f6e2c]/10 rounded-xl p-4 text-center">
                  <p className="text-sm text-gray-700">
                    Seu plano alimentar será desenvolvido especialmente para você, considerando suas necessidades e
                    objetivos únicos.
                  </p>
                </div>
              </div>
            </QuizStep>
          )}

          {/* Step 18 - Height (was Step 17) */}
          {currentStep === 18 && (
            <QuizStep
              title="Qual é a sua altura (em centímetros)?"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <HeightPicker value={answers.altura_cm || 170} onChange={(value) => updateAnswer("altura_cm", value)} />
              <div className="mt-4 bg-[#fff8e6] border border-[#f1dfa9] text-[#6a5414] p-3 rounded-lg text-sm flex items-start gap-2">
                <Ruler className="w-6 h-6 flex-shrink-0 mt-0.5" />
                <span>Essa informação é fundamental para calcular seu plano.</span>
              </div>
            </QuizStep>
          )}

          {/* Step 19 - Weight (was Step 18) */}
          {currentStep === 19 && (
            <QuizStep
              title="Informe seu peso atual (em kg):"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <WeightPicker value={answers.peso_kg || 70} onChange={(value) => updateAnswer("peso_kg", value)} />
            </QuizStep>
          )}

          {/* Step 20 - Goal Weight (was Step 19) */}
          {currentStep === 20 && (
            <QuizStep
              title="Qual é a sua meta de peso?"
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
                Seja realista — ajustaremos o plano alimentar com base nessa meta.
              </div>
            </QuizStep>
          )}

          {/* Step 21 - BMI Display (was Step 20) */}
          {currentStep === 21 && (
            <QuizStep
              title="Aqui está o seu perfil de bem-estar"
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
                <li className="flex items-start gap-2">
                  <Check className="w-6 h-6 text-[#4f6e2c] flex-shrink-0 mt-0.5" />
                  <span>Menor risco de doenças crônicas (diabetes, hipertensão e cardíacas).</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-6 h-6 text-[#4f6e2c] flex-shrink-0 mt-0.5" />
                  <span>Melhor controle de colesterol e pressão arterial.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-6 h-6 text-[#4f6e2c] flex-shrink-0 mt-0.5" />
                  <span>Mais qualidade de vida e disposição.</span>
                </li>
              </ul>
            </QuizStep>
          )}

          {/* Step 22 - Prediction (was Step 21) */}
          {currentStep === 22 && (
            <QuizStep
              title="A última dieta que você precisará para ficar em forma!"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <WeightLossChart
                currentWeight={Number.parseFloat(answers.peso_kg) || 70}
                goalWeight={Number.parseFloat(answers.meta_peso_30d) || 65}
              />

              <p className="mt-6 mb-4">
                Plano alimentar de Emagrecimento quase pronto! De acordo com as suas respostas, você está pronto(a) para
                alcançar resultados consistentes.
              </p>
              <div className="border-l-4 border-[#4f6e2c] bg-[#f7fbf3] p-4 rounded-lg">
                Previsão de peso em 30 dias: <strong>{answers.meta_peso_30d || "--"} kg</strong>
              </div>
            </QuizStep>
          )}

          {/* Step 23 - Email (was Step 22) */}
          {currentStep === 23 && (
            <QuizStep
              title="Digite seu e-mail para receber seu plano alimentar personalizado:"
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

          {/* Step 24 - Phone (was Step 23) */}
          {currentStep === 24 && (
            <QuizStep
              title="Informe seu número de WhatsApp:"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <PhoneInput value={answers.whatsapp || ""} onChange={(value) => updateAnswer("whatsapp", value)} />
              <div className="mt-4 bg-[#fff8e6] border border-[#f1dfa9] text-[#6a5414] p-3 rounded-lg text-sm flex items-start gap-2">
                <Smartphone className="w-6 h-6 flex-shrink-0 mt-0.5" />
                <span>Inclua o DDD antes do número.</span>
              </div>
            </QuizStep>
          )}

          {/* Step 25 - Name (was Step 24) */}
          {currentStep === 25 && (
            <QuizStep
              title="Qual seu nome?"
              subtitle="(nome completo)"
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

          {/* Step 26 - CPF (was Step 25) */}
          {currentStep === 26 && (
            <QuizStep
              title="Informe seu CPF:"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
              showNextButton
            >
              <CpfInput value={answers.cpf || ""} onChange={(value) => updateAnswer("cpf", value)} />
              <div className="mt-4 bg-[#fff8e6] border border-[#f1dfa9] text-[#6a5414] p-3 rounded-lg text-sm flex items-start gap-2">
                <Lock className="w-6 h-6 flex-shrink-0 mt-0.5" />
                <span>Seus dados estão seguros e protegidos.</span>
              </div>
            </QuizStep>
          )}

          {/* Step 27 - Loading (was Step 26) */}
          {currentStep === 27 && <LoadingScreen onComplete={nextStep} />}

          {/* Step 28 - Summary (was Step 27) */}
          {currentStep === 28 && (
            <QuizStep
              title="Confirme suas informações"
              subtitle="Revise seu perfil antes de prosseguir"
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onNext={handleNext}
              onPrev={prevStep}
              canGoBack={currentStep > 0}
            >
              <SummaryStep answers={answers} />
            </QuizStep>
          )}

          {/* Step 29 - Final Payment (was Step 28) */}
          {currentStep >= 29 && (
            <QuizStep
              title={`${answers.nome_completo?.split(" ")[0] || ""} a nutri vai preparar seu plano alimentar exclusivo!`}
              counter={`Etapa ${currentStep + 1} de ${totalSteps}`}
              onPrev={prevStep}
              canGoBack={currentStep > 0 && !isSubmitting}
            >
              <p className="mb-4 text-base md:text-lg leading-relaxed">
                {answers.nome_completo?.split(" ")[0] || "Você"}, a nutri vai preparar seu plano alimentar para alcançar{" "}
                <strong className="text-[#4f6e2c]">{answers.meta_peso_30d || "sua melhor versão"} kg.</strong>
                Ele é flexível, leve e sem restrições extremas — ajustado à sua rotina.
              </p>

              <div className="space-y-3 mb-6">
                <div className="bg-gradient-to-br from-[#eef6e8] to-[#f7fbf3] border-2 border-[#4f6e2c] p-5 md:p-6 rounded-xl shadow-sm">
                  <p className="font-bold text-[#2f4a18] mb-4 flex items-center gap-2 text-lg">
                    <Sparkles className="w-6 h-6" />O que você receberá:
                  </p>
                  <ul className="text-base text-[#2f4a18] space-y-3">
                    <li className="flex items-start gap-3">
                      <Check className="w-6 h-6 flex-shrink-0 mt-0.5 text-[#4f6e2c]" />
                      <span>Plano alimentar completo para 30 dias</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="w-6 h-6 flex-shrink-0 mt-0.5 text-[#4f6e2c]" />
                      <span>Cardápio personalizado baseado no seu perfil</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="w-6 h-6 flex-shrink-0 mt-0.5 text-[#4f6e2c]" />
                      <span>Acesso ao aplicativo</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="w-6 h-6 flex-shrink-0 mt-0.5 text-[#4f6e2c]" />
                      <span>Orientações nutricionais detalhadas</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-gradient-to-r from-[#fff8e6] to-[#fffbf0] border-2 border-[#bb951c] p-5 rounded-xl text-center shadow-sm">
                  <p className="text-sm text-[#6a5414] mb-1 uppercase tracking-wide font-semibold">
                    Investimento único
                  </p>
                  <p className="text-4xl md:text-5xl font-bold text-[#4f6e2c] mb-2">R$ 49,90</p>
                  <p className="text-sm text-[#6a5414] flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" />
                    Acesso imediato ao seu plano
                  </p>
                </div>
              </div>

              {submitError && (
                <div className="mb-4 bg-red-50 border-2 border-red-200 text-red-700 p-4 rounded-lg text-sm md:text-base flex items-start gap-3 animate-fade-in">
                  <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              <button
                onClick={handleSubmitQuiz}
                disabled={isSubmitting}
                className="w-full bg-[#4f6e2c] text-white font-bold py-5 px-6 rounded-xl hover:brightness-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg md:text-xl flex items-center justify-center gap-3 shadow-lg hover:shadow-xl active:scale-95 min-h-[60px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader className="w-6 h-6 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Lock className="w-6 h-6" />
                    Garantir Meu Plano Alimentar Agora
                  </>
                )}
              </button>

              <p className="text-xs md:text-sm text-center text-[#888] mt-4 leading-relaxed">
                🔒 Você será redirecionado para a página de pagamento seguro
              </p>
            </QuizStep>
          )}
        </div>
      </div>
    </div>
  )
}
