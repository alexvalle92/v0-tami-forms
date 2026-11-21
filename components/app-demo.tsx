"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ChefHat,
  Clock,
  Download,
  Home,
  Search,
  Users,
  Utensils,
} from "lucide-react"
import PlanaLogo from "@/src/img/plana-logo.png"

/*
 * Demonstração animada do app PlanA (etapa "O que você pode esperar").
 * Reproduz as telas reais do app do paciente (dieta-app: Meu Plano e Receitas) com dados de exemplo.
 * Roda em loop como um GIF, mas é HTML: fica nítida em qualquer tela e pesa poucos KB.
 * Pausa fora da tela e respeita "reduzir movimento" do sistema.
 */

// Cores do tema do PlanA (dieta-app/app/globals.css)
const C = {
  primary: "#557432",
  gold: "#9c7d17",
  bg: "#fcfaf6",
  muted: "#f4f1ea",
  fg: "#2c3324",
  mutedFg: "#6d7366",
  border: "#ebe6dc",
}

// ---------- hooks ----------

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [query])
  return matches
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, inView] as const
}

/** Avança pelos passos do roteiro em loop. `onLoopEnd` dispara ao terminar o último passo. */
function useScript(durations: number[], running: boolean, active: boolean, onLoopEnd?: () => void) {
  const [index, setIndex] = useState(0)
  const onLoopEndRef = useRef(onLoopEnd)
  onLoopEndRef.current = onLoopEnd

  // ao sair de cena (aba trocada no celular), volta ao início
  useEffect(() => {
    if (!active) setIndex(0)
  }, [active])

  useEffect(() => {
    if (!running) return
    const t = setTimeout(() => {
      if (index === durations.length - 1) onLoopEndRef.current?.()
      setIndex((i) => (i + 1) % durations.length)
    }, durations[index])
    return () => clearTimeout(t)
  }, [index, running, durations])

  return index
}

/** Mede o deslocamento vertical para mostrar a âncora pedida dentro da área rolável. */
function useScrollTo(
  viewport: React.RefObject<HTMLDivElement | null>,
  content: React.RefObject<HTMLDivElement | null>,
  anchors: React.MutableRefObject<Record<string, HTMLElement | null>>,
  target: string,
  deps: unknown[],
) {
  const [y, setY] = useState(0)
  useLayoutEffect(() => {
    const vp = viewport.current
    const ct = content.current
    if (!vp || !ct) return
    const max = Math.max(0, ct.offsetHeight - vp.clientHeight)
    let next = 0
    if (target === "bottom") next = max
    else if (target !== "top") next = Math.min(max, Math.max(0, (anchors.current[target]?.offsetTop ?? 0) - 10))
    setY(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ...deps])
  return y
}

// ---------- peças visuais ----------

function TapPulse({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span
        className="h-9 w-9 rounded-full border-2 border-white/80 shadow-[0_0_0_6px_rgba(85,116,50,0.18)]"
        style={{ background: "rgba(85,116,50,0.35)", animation: "demo-tap 0.65s ease-out forwards" }}
      />
    </span>
  )
}

function PhoneFrame({ tab, children }: { tab: "plano" | "receitas"; children: ReactNode }) {
  const navItem = (key: "inicio" | "receitas", label: string, Icon: typeof Home) => {
    const isActive = tab === key
    return (
      <div className="flex flex-col items-center justify-center gap-0.5" style={{ color: isActive ? C.primary : C.mutedFg }}>
        <Icon className="h-[18px] w-[18px]" />
        <span className="text-[9px] font-medium">{label}</span>
      </div>
    )
  }

  return (
    <div className="relative mx-auto w-[248px]">
      {/* botões laterais */}
      <span aria-hidden className="absolute -left-[3px] top-[96px] h-8 w-[3px] rounded-l bg-[#2a2c27]" />
      <span aria-hidden className="absolute -left-[3px] top-[140px] h-12 w-[3px] rounded-l bg-[#2a2c27]" />
      <span aria-hidden className="absolute -right-[3px] top-[120px] h-16 w-[3px] rounded-r bg-[#2a2c27]" />

      <div className="rounded-[40px] bg-[#1c1e1a] p-[8px] shadow-[0_30px_60px_-18px_rgba(47,74,24,0.55),0_12px_24px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/10">
        <div className="relative flex h-[450px] flex-col overflow-hidden rounded-[32px] md:h-[500px]" style={{ background: C.bg, color: C.fg }}>
          {/* status bar */}
          <div className="relative flex h-8 flex-shrink-0 items-center justify-between bg-white px-6 text-[10px] font-semibold">
            <span>9:41</span>
            <span aria-hidden className="absolute left-1/2 top-[6px] h-[18px] w-[70px] -translate-x-1/2 rounded-full bg-[#1c1e1a]" />
            <span className="flex items-center gap-1">
              <span className="flex items-end gap-[1.5px]">
                {[4, 6, 8, 10].map((h) => (
                  <span key={h} className="w-[2.5px] rounded-sm bg-current" style={{ height: h }} />
                ))}
              </span>
              <span className="ml-1 flex h-[9px] w-[18px] items-center rounded-[3px] border border-current p-[1px]">
                <span className="h-full w-[70%] rounded-[1px] bg-current" />
              </span>
            </span>
          </div>

          {/* topo do app */}
          <div className="flex h-11 flex-shrink-0 items-center justify-between border-b bg-white px-4" style={{ borderColor: C.border }}>
            <Image src={PlanaLogo} alt="" className="h-7 w-auto" priority={false} />
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: C.gold }}
            >
              MS
            </span>
          </div>

          {/* conteúdo */}
          <div className="relative flex-1 overflow-hidden">{children}</div>

          {/* menu inferior */}
          <div className="relative grid h-[66px] flex-shrink-0 grid-cols-3 border-t bg-white pb-3" style={{ borderColor: C.border }}>
            {navItem("inicio", "Início", Home)}
            <div className="flex flex-col items-center justify-end gap-0.5 pb-1">
              <span
                className="-mt-5 flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg ring-4 ring-white"
                style={{ background: C.primary, opacity: tab === "plano" ? 1 : 0.9 }}
              >
                <Utensils className="h-5 w-5" />
              </span>
              <span className="text-[9px] font-medium" style={{ color: tab === "plano" ? C.primary : C.mutedFg }}>
                Meu Plano
              </span>
            </div>
            {navItem("receitas", "Receitas", BookOpen)}
          </div>

          {/* barra de gesto */}
          <span aria-hidden className="absolute bottom-[5px] left-1/2 h-[4px] w-[90px] -translate-x-1/2 rounded-full bg-[#1c1e1a]/80" />
        </div>
      </div>
    </div>
  )
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`} style={{ borderColor: C.border }}>
      {children}
    </div>
  )
}

function Dot({ color = C.primary }: { color?: string }) {
  return <span className="mt-[5px] h-[5px] w-[5px] flex-shrink-0 rounded-full" style={{ background: color }} />
}

function Badge({ children, outline = false }: { children: ReactNode; outline?: boolean }) {
  return (
    <span
      className="rounded-md px-1.5 py-[2px] text-[9px] font-semibold"
      style={outline ? { border: `1px solid ${C.border}`, color: C.fg } : { background: C.gold, color: "white" }}
    >
      {children}
    </span>
  )
}

// ---------- demo 1: plano alimentar ----------

type MealKey = "cafe" | "almoco" | "lanche" | "jantar"

const MEALS: { key: MealKey; name: string; time: string; options: { foods: string[]; kcal: number }[] }[] = [
  {
    key: "cafe",
    name: "Café da manhã",
    time: "07:00",
    options: [
      { foods: ["2 fatias de pão integral", "1 ovo mexido", "Café com leite (200 ml)", "1 fatia de mamão"], kcal: 320 },
      { foods: ["Tapioca (2 col. de goma) com queijo branco", "Café sem açúcar", "1 banana prata"], kcal: 300 },
    ],
  },
  {
    key: "almoco",
    name: "Almoço",
    time: "12:30",
    options: [
      {
        foods: ["4 col. de arroz integral", "1 concha de feijão", "120 g de frango grelhado", "Salada de folhas à vontade", "Legumes refogados"],
        kcal: 520,
      },
    ],
  },
  {
    key: "lanche",
    name: "Lanche da tarde",
    time: "16:00",
    options: [
      { foods: ["1 iogurte natural", "1 col. de aveia", "5 morangos"], kcal: 180 },
      { foods: ["1 maçã", "10 castanhas de caju"], kcal: 170 },
    ],
  },
  {
    key: "jantar",
    name: "Jantar",
    time: "19:30",
    options: [
      { foods: ["Omelete de 2 ovos com espinafre", "Salada de tomate e pepino", "1 col. de azeite"], kcal: 350 },
      { foods: ["Sopa de legumes com frango desfiado", "1 torrada integral"], kcal: 320 },
    ],
  },
]

type PlanStep = { d: number; scroll: string; opt: Partial<Record<MealKey, number>>; tap?: string }

const PLAN_STEPS: PlanStep[] = [
  { d: 1700, scroll: "top", opt: {} },
  { d: 650, scroll: "top", opt: {}, tap: "cafe-1" },
  { d: 1700, scroll: "top", opt: { cafe: 1 } },
  { d: 1700, scroll: "almoco", opt: { cafe: 1 } },
  { d: 1100, scroll: "lanche", opt: { cafe: 1 } },
  { d: 650, scroll: "lanche", opt: { cafe: 1 }, tap: "lanche-1" },
  { d: 1500, scroll: "lanche", opt: { cafe: 1, lanche: 1 } },
  { d: 1100, scroll: "jantar", opt: { cafe: 1, lanche: 1 } },
  { d: 650, scroll: "jantar", opt: { cafe: 1, lanche: 1 }, tap: "jantar-1" },
  { d: 1500, scroll: "jantar", opt: { cafe: 1, lanche: 1, jantar: 1 } },
  { d: 1000, scroll: "bottom", opt: { cafe: 1, lanche: 1, jantar: 1 } },
  { d: 650, scroll: "bottom", opt: { cafe: 1, lanche: 1, jantar: 1 }, tap: "pdf" },
  { d: 1100, scroll: "bottom", opt: { cafe: 1, lanche: 1, jantar: 1 } },
  { d: 900, scroll: "top", opt: {} },
]
const PLAN_DURATIONS = PLAN_STEPS.map((s) => s.d)

function PlanDemo({ running, active, onLoopEnd }: { running: boolean; active: boolean; onLoopEnd?: () => void }) {
  const index = useScript(PLAN_DURATIONS, running, active, onLoopEnd)
  const step = PLAN_STEPS[index]
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const anchors = useRef<Record<string, HTMLElement | null>>({})
  const y = useScrollTo(viewport, content, anchors, step.scroll, [index])

  return (
    <PhoneFrame tab="plano">
      <div ref={viewport} className="absolute inset-0 overflow-hidden">
        <div
          ref={content}
          className="relative space-y-2.5 px-3 pb-4 pt-3"
          style={{ transform: `translateY(${-y}px)`, transition: "transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)" }}
        >
          <Card>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-bold leading-tight">Plano Alimentar Personalizado</p>
              <span className="rounded-md px-1.5 py-[2px] text-[9px] font-semibold text-white" style={{ background: C.primary }}>
                Ativo
              </span>
            </div>
            <div className="mt-1.5 flex gap-3 text-[9px]" style={{ color: C.mutedFg }}>
              <span className="flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" /> Início: 01/12
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" /> Fim: 30/12
              </span>
            </div>
          </Card>

          <p className="pt-0.5 text-[14px] font-bold">Refeições Diárias</p>

          {MEALS.map((meal) => {
            const selected = step.opt[meal.key] ?? 0
            const option = meal.options[selected]
            return (
              <div key={meal.key} ref={(el) => void (anchors.current[meal.key] = el)}>
                <Card>
                  <p className="text-[12px] font-bold">
                    {meal.name}
                    <span className="font-normal" style={{ color: C.mutedFg }}>
                      {" "}
                      · {meal.time}
                    </span>
                  </p>
                  {meal.options.length > 1 && (
                    <div className="mt-2 inline-flex rounded-lg p-[3px]" style={{ background: C.muted }}>
                      {meal.options.map((_, i) => (
                        <span
                          key={i}
                          className="relative rounded-md px-3 py-1 text-[10px] font-medium transition-all duration-300"
                          style={
                            selected === i
                              ? { background: "white", color: C.fg, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }
                              : { color: C.mutedFg }
                          }
                        >
                          Opção {i + 1}
                          <TapPulse show={step.tap === `${meal.key}-${i}`} />
                        </span>
                      ))}
                    </div>
                  )}
                  <ul key={selected} className="mt-2 space-y-1" style={{ animation: "demo-fade 0.35s ease" }}>
                    {option.foods.map((food) => (
                      <li key={food} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
                        <Dot />
                        <span>{food}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-right text-[9px]" style={{ color: C.mutedFg }}>
                    ~{option.kcal} kcal
                  </p>
                </Card>
              </div>
            )
          })}

          <Card>
            <p className="text-[12px] font-bold">Observações Importantes</p>
            <ul className="mt-1.5 space-y-1">
              {["Beba de 2 a 2,5 litros de água por dia", "Prefira temperos naturais"].map((obs) => (
                <li key={obs} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
                  <Dot color={C.gold} />
                  <span>{obs}</span>
                </li>
              ))}
            </ul>
          </Card>

          <div
            className="relative flex items-center justify-center gap-1.5 rounded-lg border bg-white py-2 text-[11px] font-medium"
            style={{ borderColor: C.border }}
          >
            <Download className="h-3 w-3" /> Baixar PDF
            <TapPulse show={step.tap === "pdf"} />
          </div>
        </div>
      </div>
    </PhoneFrame>
  )
}

// ---------- demo 2: receitas ----------

const RECIPES = [
  {
    id: "panqueca",
    title: "Panqueca de banana e aveia",
    desc: "Fofinha, sem farinha branca e pronta em minutos.",
    category: "Café da Manhã",
    kcal: 210,
    time: 10,
    servings: 1,
  },
  {
    id: "frango",
    title: "Frango grelhado com legumes",
    desc: "Almoço completo numa frigideira só.",
    category: "Almoço",
    kcal: 380,
    time: 25,
    servings: 2,
  },
  {
    id: "crepioca",
    title: "Crepioca de queijo branco",
    desc: "Lanche rápido que segura a fome.",
    category: "Lanche",
    kcal: 190,
    time: 8,
    servings: 1,
  },
  {
    id: "sopa",
    title: "Sopa cremosa de abóbora",
    desc: "Leve e quentinha para o jantar.",
    category: "Jantar",
    kcal: 240,
    time: 30,
    servings: 4,
  },
]

const PANQUECA = {
  ingredients: ["1 banana madura", "2 col. de aveia em flocos", "1 ovo", "Canela a gosto", "1 fio de mel (opcional)"],
  steps: [
    "Amasse a banana com um garfo.",
    "Misture o ovo e a aveia até ficar homogêneo.",
    "Aqueça uma frigideira antiaderente untada.",
    "Doure a massa dos dois lados, 2 min cada.",
    "Finalize com canela e mel.",
  ],
}

type RecipeStep = { d: number; screen: "list" | "detail"; query: string; focus?: boolean; scroll?: string; tap?: string }

const QUERY = "panq"
const RECIPE_STEPS: RecipeStep[] = [
  { d: 1700, screen: "list", query: "" },
  { d: 600, screen: "list", query: "", tap: "search" },
  { d: 350, screen: "list", query: "", focus: true },
  ...QUERY.split("").map((_, k) => ({ d: 160, screen: "list" as const, query: QUERY.slice(0, k + 1), focus: true })),
  { d: 1100, screen: "list", query: QUERY, focus: true },
  { d: 650, screen: "list", query: QUERY, tap: "ver-panqueca" },
  { d: 1500, screen: "detail", query: QUERY, scroll: "top" },
  { d: 1700, screen: "detail", query: QUERY, scroll: "ingredientes" },
  { d: 2000, screen: "detail", query: QUERY, scroll: "preparo" },
  { d: 1400, screen: "detail", query: QUERY, scroll: "bottom" },
  { d: 800, screen: "detail", query: QUERY, scroll: "top" },
  { d: 650, screen: "detail", query: QUERY, scroll: "top", tap: "voltar" },
  { d: 900, screen: "list", query: QUERY },
  { d: 500, screen: "list", query: "" },
]
const RECIPE_DURATIONS = RECIPE_STEPS.map((s) => s.d)

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")

function RecipesDemo({ running, active, onLoopEnd }: { running: boolean; active: boolean; onLoopEnd?: () => void }) {
  const index = useScript(RECIPE_DURATIONS, running, active, onLoopEnd)
  const step = RECIPE_STEPS[index]
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const anchors = useRef<Record<string, HTMLElement | null>>({})
  const y = useScrollTo(viewport, content, anchors, step.screen === "detail" ? step.scroll ?? "top" : "top", [index])
  const visible = RECIPES.filter((r) => normalize(r.title).includes(normalize(step.query)))
  const inDetail = step.screen === "detail"
  const slide = "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease"

  return (
    <PhoneFrame tab="receitas">
      {/* lista */}
      <div
        className="absolute inset-0 overflow-hidden px-3 pt-3"
        style={{ transform: inDetail ? "translateX(-30%)" : "translateX(0)", opacity: inDetail ? 0 : 1, transition: slide }}
      >
        <p className="text-[16px] font-bold leading-tight">Receitas Saudáveis</p>
        <p className="mt-0.5 text-[10px]" style={{ color: C.mutedFg }}>
          Receitas nutritivas para complementar seu plano
        </p>

        <div
          className="relative mt-2.5 flex h-8 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[10.5px] transition-shadow"
          style={{
            borderColor: step.focus ? C.primary : C.border,
            boxShadow: step.focus ? "0 0 0 3px rgba(85,116,50,0.15)" : "none",
          }}
        >
          <Search className="h-3 w-3" style={{ color: C.mutedFg }} />
          {step.query ? <span>{step.query}</span> : <span style={{ color: C.mutedFg }}>Buscar receitas...</span>}
          {step.focus && <span className="-ml-1 h-3 w-px" style={{ background: C.fg, animation: "demo-caret 1s steps(1) infinite" }} />}
          <TapPulse show={step.tap === "search"} />
        </div>

        <div className="mt-2.5 space-y-2">
          {visible.map((r) => (
            <Card key={r.id} className="!p-2.5">
              <div className="flex items-center justify-between">
                <Badge>{r.category}</Badge>
                <Badge outline>{r.kcal} kcal</Badge>
              </div>
              <p className="mt-1.5 text-[12px] font-bold leading-tight">{r.title}</p>
              <p className="mt-0.5 text-[9.5px]" style={{ color: C.mutedFg }}>
                {r.desc}
              </p>
              <div className="mt-1.5 flex gap-3 text-[9px]" style={{ color: C.mutedFg }}>
                <span className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> {r.time} min
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-2.5 w-2.5" /> {r.servings} {r.servings === 1 ? "porção" : "porções"}
                </span>
              </div>
              <div
                className="relative mt-2 flex items-center justify-center gap-1 rounded-md py-1.5 text-[10px] font-semibold text-white"
                style={{ background: C.primary }}
              >
                <ChefHat className="h-3 w-3" /> Ver Receita
                <TapPulse show={step.tap === `ver-${r.id}`} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* detalhe */}
      <div
        ref={viewport}
        className="absolute inset-0 overflow-hidden"
        style={{ transform: inDetail ? "translateX(0)" : "translateX(100%)", transition: slide, background: C.bg }}
      >
        <div
          ref={content}
          className="relative space-y-2.5 px-3 pb-4 pt-2"
          style={{ transform: `translateY(${-y}px)`, transition: "transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)" }}
        >
          <span className="relative inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-medium">
            <ArrowLeft className="h-3 w-3" /> Voltar para Receitas
            <TapPulse show={step.tap === "voltar"} />
          </span>

          <Card>
            <div className="flex gap-1.5">
              <Badge>Café da Manhã</Badge>
              <Badge outline>210 kcal</Badge>
            </div>
            <p className="mt-1.5 text-[15px] font-bold leading-tight">Panqueca de banana e aveia</p>
            <p className="mt-0.5 text-[10px]" style={{ color: C.mutedFg }}>
              Fofinha, sem farinha branca e pronta em minutos.
            </p>
            <div className="mt-2 flex gap-4 text-[9.5px]" style={{ color: C.mutedFg }}>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> 10 min
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> 1 porção
              </span>
            </div>
          </Card>

          <div ref={(el) => void (anchors.current.ingredientes = el)}>
            <Card>
              <p className="text-[12px] font-bold">Ingredientes</p>
              <ul className="mt-1.5 space-y-1">
                {PANQUECA.ingredients.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
                    <Dot />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div ref={(el) => void (anchors.current.preparo = el)}>
            <Card>
              <p className="text-[12px] font-bold">Modo de Preparo</p>
              <ol className="mt-1.5 space-y-1.5">
                {PANQUECA.steps.map((s, i) => (
                  <li key={s} className="flex items-start gap-2 text-[10.5px] leading-snug">
                    <span
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[8.5px] font-bold text-white"
                      style={{ background: C.primary }}
                    >
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <Card>
            <p className="text-[12px] font-bold">Informações Nutricionais</p>
            <p className="text-[9px]" style={{ color: C.mutedFg }}>
              Por porção
            </p>
            <div className="mt-1.5 flex justify-between text-[10.5px]">
              <span style={{ color: C.mutedFg }}>Calorias</span>
              <span className="font-semibold">210 kcal</span>
            </div>
          </Card>
        </div>
      </div>
    </PhoneFrame>
  )
}

// ---------- vitrine ----------

type DemoKey = "plano" | "receitas"

const DEMOS: { key: DemoKey; label: string; caption: string; Icon: typeof Home }[] = [
  { key: "plano", label: "Plano alimentar", caption: "Seu cardápio com horários e opção de troca", Icon: Utensils },
  { key: "receitas", label: "Receitas", caption: "Receitas práticas com passo a passo", Icon: BookOpen },
]

export function AppDemoShowcase() {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const [ref, inView] = useInView<HTMLDivElement>()
  const [selected, setSelected] = useState<DemoKey>("plano")

  const isActive = (key: DemoKey) => isDesktop || selected === key
  const running = (key: DemoKey) => inView && !reducedMotion && isActive(key)
  // no celular aparece uma demo por vez; ao terminar uma, passa para a outra
  const next = (key: DemoKey) => () => {
    if (!isDesktop) setSelected(key === "plano" ? "receitas" : "plano")
  }

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Demonstração do app PlanA: o plano alimentar com as refeições do dia e as opções de troca, e as receitas com ingredientes e modo de preparo."
      className="relative overflow-hidden rounded-2xl border border-[#e8efe0] bg-gradient-to-b from-[#f2f8ec] via-[#f8faf3] to-[#fbf7ea] px-4 pb-5 pt-4 md:px-6 md:pb-6 md:pt-6"
    >
      {/* brilho de fundo */}
      <span aria-hidden className="pointer-events-none absolute -left-16 top-10 h-56 w-56 rounded-full bg-[#557432]/10 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -right-16 bottom-10 h-56 w-56 rounded-full bg-[#bb951c]/10 blur-3xl" />

      {/* abas (só no celular) */}
      <div aria-hidden className="relative mx-auto mb-5 flex w-fit rounded-full bg-white p-1 shadow-sm ring-1 ring-[#e5ecdc] md:hidden">
        {DEMOS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            tabIndex={-1}
            onClick={() => setSelected(key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              selected === key ? "bg-[#4f6e2c] text-white shadow" : "text-[#4f6e2c]"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div aria-hidden className="relative grid gap-8 md:grid-cols-2 md:gap-4">
        {DEMOS.map(({ key, caption }) => (
          <figure key={key} className={isActive(key) ? "block" : "hidden md:block"}>
            {key === "plano" ? (
              <PlanDemo running={running(key)} active={isActive(key)} onLoopEnd={next(key)} />
            ) : (
              <RecipesDemo running={running(key)} active={isActive(key)} onLoopEnd={next(key)} />
            )}
            <figcaption className="mt-4 text-balance text-center text-sm font-semibold text-[#2f4a18] md:text-base">{caption}</figcaption>
          </figure>
        ))}
      </div>

      <p className="relative mt-4 text-center text-[11px] text-[#8a8f84]">Demonstração ilustrativa do app PlanA</p>
    </div>
  )
}
