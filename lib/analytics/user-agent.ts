// Leitura do User-Agent com expressões simples, sem dependência. O UA bruto não é gravado:
// só o tipo de aparelho, o sistema e o navegador.

export type DeviceInfo = {
  deviceType: "mobile" | "tablet" | "desktop"
  os: string
  browser: string
  isBot: boolean
}

const BOT = /bot|crawler|spider|headless|lighthouse/i

function deviceType(ua: string): DeviceInfo["deviceType"] {
  if (/iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return "tablet"
  if (/Mobi|iPhone|Android/.test(ua)) return "mobile"
  return "desktop"
}

// O Android traz "Linux" e o iOS traz "Mac OS X" no UA: os mais específicos vêm antes.
function osName(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS"
  if (/Android/.test(ua)) return "Android"
  if (/Windows/.test(ua)) return "Windows"
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS"
  if (/Linux|X11/.test(ua)) return "Linux"
  return "outro"
}

// Instagram e Facebook primeiro: é por eles que chega o tráfego de anúncio, e o UA deles
// também contém Chrome ou Safari.
function browserName(ua: string): string {
  if (/Instagram/.test(ua)) return "Instagram"
  if (/FBAN|FBAV/.test(ua)) return "Facebook"
  if (/Edg(e|A|iOS)?\//.test(ua)) return "Edge"
  if (/SamsungBrowser/.test(ua)) return "Samsung"
  if (/Chrome|CriOS/.test(ua)) return "Chrome"
  if (/Firefox|FxiOS/.test(ua)) return "Firefox"
  if (/Safari/.test(ua)) return "Safari"
  return "outro"
}

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  const value = ua ?? ""
  return {
    deviceType: deviceType(value),
    os: osName(value),
    browser: browserName(value),
    isBot: value === "" || BOT.test(value),
  }
}
