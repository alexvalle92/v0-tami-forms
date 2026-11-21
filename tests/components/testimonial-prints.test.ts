import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { TestimonialPrints, type TestimonialPrint } from "@/components/testimonial-prints"

const whats: TestimonialPrint = { src: "/whats.png", source: "whatsapp" }
const insta: TestimonialPrint = { src: "/insta.png", source: "instagram" }

function render(prints: TestimonialPrint[]): string {
  return renderToStaticMarkup(createElement(TestimonialPrints, { prints }))
}

describe("TestimonialPrints", () => {
  it("mostra a etiqueta da origem de cada print", () => {
    const html = render([whats, insta])

    expect(html).toContain("WhatsApp")
    expect(html).toContain("Instagram")
    expect(html).toContain("whats.png")
    expect(html).toContain("insta.png")
  })

  it("cada print tem um botão para ampliar", () => {
    const html = render([whats, insta, whats])

    expect(html.match(/aria-label="Ampliar print \d+"/g)).toHaveLength(3)
  })

  it("com vários prints, mostra uma bolinha por print", () => {
    const html = render([whats, insta, whats])

    expect(html.match(/aria-label="Ver print \d+"/g)).toHaveLength(3)
  })

  it("usa o resumo do print como texto alternativo, quando informado", () => {
    const html = render([{ ...whats, alt: "Paciente perdeu 3 kg" }, insta])

    expect(html).toContain('alt="Paciente perdeu 3 kg"')
    expect(html).toContain('alt="Depoimento por Instagram 2"')
  })

  it("avisa que resultados individuais podem variar", () => {
    expect(render([whats])).toContain("Resultados individuais podem variar")
  })

  it("com um print, não mostra bolinhas", () => {
    expect(render([whats])).not.toContain('aria-label="Ver print')
  })

  it("sem prints, não renderiza nada", () => {
    expect(render([])).toBe("")
  })
})
