import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { TestimonialRotator, type Testimonial } from "@/components/testimonial-rotator"

const t = (initials: string, text: string): Testimonial => ({ initials, text })

function render(testimonials: Testimonial[]): string {
  return renderToStaticMarkup(createElement(TestimonialRotator, { testimonials }))
}

describe("TestimonialRotator", () => {
  it("renderiza o texto e as iniciais de cada depoimento", () => {
    const html = render([t("M.S.", "Perdi 6 kg"), t("J.P.", "Amei o cardápio")])

    expect(html).toContain("Perdi 6 kg")
    expect(html).toContain("Amei o cardápio")
    expect(html).toContain("M.S.")
    expect(html).toContain("J.P.")
  })

  it("começa no primeiro depoimento e esconde os demais dos leitores de tela", () => {
    const html = render([t("M.S.", "primeiro"), t("J.P.", "segundo"), t("C.R.", "terceiro")])

    expect(html.match(/aria-hidden="true" data-testimonial/g)).toHaveLength(2)
    expect(html.match(/aria-hidden="false" data-testimonial/g)).toHaveLength(1)
  })

  it("com vários depoimentos, mostra uma bolinha por depoimento", () => {
    const html = render([t("M.S.", "a"), t("J.P.", "b"), t("C.R.", "c")])

    expect(html.match(/aria-label="Ver depoimento \d+"/g)).toHaveLength(3)
  })

  it("com um depoimento, não mostra bolinhas", () => {
    expect(render([t("M.S.", "a")])).not.toContain('aria-label="Ver depoimento')
  })

  it("sem depoimentos, não renderiza nada", () => {
    expect(render([])).toBe("")
  })
})
