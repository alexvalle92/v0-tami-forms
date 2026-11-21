import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { TestimonialRotator, shuffled, type Testimonial } from "@/components/testimonial-rotator"

const t = (initials: string, text: string): Testimonial => ({ initials, text })

function render(testimonials: Testimonial[], shuffle = false): string {
  return renderToStaticMarkup(createElement(TestimonialRotator, { testimonials, shuffle }))
}

describe("shuffled", () => {
  it("devolve os mesmos itens em outra ordem, sem mexer na lista original", () => {
    const list = [1, 2, 3, 4]
    // random sempre 0: cada posição troca com a primeira (Fisher-Yates)
    const out = shuffled(list, () => 0)

    expect(out).toEqual([2, 3, 4, 1])
    expect(list).toEqual([1, 2, 3, 4])
  })

  it("mantém todos os itens", () => {
    const list = ["a", "b", "c", "d", "e"]
    expect([...shuffled(list)].sort()).toEqual(list)
  })
})

describe("TestimonialRotator", () => {
  it("embaralhado, continua mostrando todos os depoimentos", () => {
    const html = render([t("M.S.", "primeiro"), t("J.P.", "segundo"), t("C.R.", "terceiro")], true)

    expect(html).toContain("primeiro")
    expect(html).toContain("segundo")
    expect(html).toContain("terceiro")
    expect(html.match(/aria-hidden="false" data-testimonial/g)).toHaveLength(1)
  })

  it("sem iniciais, mostra um ícone no lugar e não deixa o círculo vazio", () => {
    const html = render([{ text: "Amei o plano" }])

    expect(html).toContain("Amei o plano")
    expect(html).toContain("lucide-heart")
  })

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
