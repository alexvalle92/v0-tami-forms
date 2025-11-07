import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm'

interface AppConfig {
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ASAAS_API_KEY: string
  ASAAS_SANDBOX: string
}

let configCache: AppConfig | null = null

async function loadFromAWSParameterStore(): Promise<AppConfig> {
  const region = process.env.AWS_REGION || 'us-east-1'
  const parameterPath = process.env.AWS_PARAMETER_PATH || '/nutritamilivalle/production'

  const ssmClient = new SSMClient({ region })

  try {
    let allParameters: any[] = []
    let nextToken: string | undefined

    do {
      const command = new GetParametersByPathCommand({
        Path: parameterPath,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken
      })

      const response = await ssmClient.send(command)
      if (response.Parameters) {
        allParameters.push(...response.Parameters)
      }
      nextToken = response.NextToken
    } while (nextToken)

    const config: any = {}
    allParameters.forEach(param => {
      const key = param.Name?.replace(parameterPath, '').replace(/^\//, '') || ''
      config[key] = param.Value
    })

    return {
      NEXT_PUBLIC_SUPABASE_URL: config.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: config.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY || '',
      ASAAS_API_KEY: config.ASAAS_API_KEY || '',
      ASAAS_SANDBOX: config.ASAAS_SANDBOX || 'false'
    }
  } catch (error) {
    console.error('Erro ao carregar parâmetros do AWS Parameter Store:', error)
    throw new Error('Falha ao carregar configurações do AWS Parameter Store')
  }
}

function loadFromEnvironment(): AppConfig {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    ASAAS_API_KEY: process.env.ASAAS_API_KEY || '',
    ASAAS_SANDBOX: process.env.ASAAS_SANDBOX || 'false'
  }
}

export async function getConfig(): Promise<AppConfig> {
  if (configCache) {
    return configCache
  }

  const useAWS = process.env.USE_AWS_PARAMETER_STORE === 'true'

  if (useAWS) {
    console.log('Carregando configuração do AWS Parameter Store...')
    configCache = await loadFromAWSParameterStore()
  } else {
    console.log('Carregando configuração de variáveis de ambiente locais...')
    configCache = loadFromEnvironment()
  }

  const missingVars: string[] = []
  Object.entries(configCache).forEach(([key, value]) => {
    if (!value || value === '') {
      missingVars.push(key)
    }
  })

  if (missingVars.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias não encontradas: ${missingVars.join(', ')}`
    )
  }

  return configCache
}

export function clearConfigCache() {
  configCache = null
}
