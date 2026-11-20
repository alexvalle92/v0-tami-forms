import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { BeforeAfterCarousel, type BeforeAfterResult } from "@/components/before-after-carousel"

const result = (name: string): BeforeAfterResult => ({
  name,
  detail: "12 semanas de acompanhamento",
  before: "/antes.png",
  after: "/depois.png",
})

function render(results: BeforeAfterResult[]): string {
  return renderToStaticMarkup(createElement(BeforeAfterCarousel, { results }))
}

describe("BeforeAfterCarousel", () => {
  it("com um resultado, mostra um card fixo, sem bolinhas de navegação", () => {
    const html = render([result("Mariana")])

    expect(html).toContain("Mariana")
    expect(html).toContain("Antes")
    expect(html).toContain("Depois")
    expect(html).not.toContain('aria-label="Ver resultado')
  })

  it("com vários resultados, mostra uma bolinha por resultado", () => {
    const html = render([result("Mariana"), result("Juliana"), result("Carla")])

    expect(html.match(/aria-label="Ver resultado \d+"/g)).toHaveLength(3)
    expect(html).toContain("Carla")
  })

  it("sem resultados, não renderiza nada", () => {
    expect(render([])).toBe("")
  })
})
