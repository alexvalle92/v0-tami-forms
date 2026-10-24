import { describe, expect, it } from "vitest"
import { parseUserAgent } from "@/lib/analytics/user-agent"

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 330.0.0.20.113 (iPhone14,5; iOS 17_5; pt_BR; pt; scale=3.00; 1170x2532; 600000000)"
const ANDROID_FACEBOOK =
  "Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.40.108;]"
const IPHONE_FBAN =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 [FBAN/FBIOS;FBAV/470.0.0.40.108;FBBV/600000;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBLC/pt_BR]"
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
const SAMSUNG =
  "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36"
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"
const GOOGLEBOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
const HEADLESS =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36"
const LIGHTHOUSE =
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse"

describe("parseUserAgent", () => {
  it("iPhone Safari", () => {
    expect(parseUserAgent(IPHONE_SAFARI)).toEqual({
      deviceType: "mobile",
      os: "iOS",
      browser: "Safari",
      isBot: false,
    })
  })

  it("Android Chrome", () => {
    expect(parseUserAgent(ANDROID_CHROME)).toEqual({
      deviceType: "mobile",
      os: "Android",
      browser: "Chrome",
      isBot: false,
    })
  })

  it("navegadores internos do Instagram e do Facebook vêm primeiro", () => {
    expect(parseUserAgent(IPHONE_INSTAGRAM)).toMatchObject({ deviceType: "mobile", os: "iOS", browser: "Instagram" })
    expect(parseUserAgent(IPHONE_FBAN)).toMatchObject({ os: "iOS", browser: "Facebook" })
    expect(parseUserAgent(ANDROID_FACEBOOK)).toMatchObject({ os: "Android", browser: "Facebook" })
  })

  it("tablets", () => {
    expect(parseUserAgent(IPAD)).toMatchObject({ deviceType: "tablet", os: "iOS" })
    expect(parseUserAgent(ANDROID_TABLET)).toMatchObject({ deviceType: "tablet", os: "Android" })
  })

  it("desktop", () => {
    expect(parseUserAgent(WINDOWS_EDGE)).toEqual({
      deviceType: "desktop",
      os: "Windows",
      browser: "Edge",
      isBot: false,
    })
    expect(parseUserAgent(MAC_SAFARI)).toEqual({
      deviceType: "desktop",
      os: "macOS",
      browser: "Safari",
      isBot: false,
    })
    expect(parseUserAgent(FIREFOX_LINUX)).toEqual({
      deviceType: "desktop",
      os: "Linux",
      browser: "Firefox",
      isBot: false,
    })
  })

  it("Samsung Internet", () => {
    expect(parseUserAgent(SAMSUNG)).toMatchObject({ deviceType: "mobile", os: "Android", browser: "Samsung" })
  })

  it("robôs e UA ausente", () => {
    for (const ua of [GOOGLEBOT, HEADLESS, LIGHTHOUSE, "", null, undefined]) {
      expect(parseUserAgent(ua).isBot).toBe(true)
    }
  })

  it("UA desconhecido vira outro", () => {
    expect(parseUserAgent("curioso/1.0")).toEqual({
      deviceType: "desktop",
      os: "outro",
      browser: "outro",
      isBot: false,
    })
  })
})
