import type { Ora } from 'ora'
import type { Options, Shell } from 'zx'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)

export interface ConfigArgs {
  env: string
  mode: string
}

export interface Config {
  appId: string
  projectPath: string
  privateKeyPath: string
  webhook?: {
    workWeixin?: string
  }
  prepare?: ($: Shell & Options, spinner: Ora) => void | Promise<void>
}

export function defineConfig(config: Config | ((args: ConfigArgs) => Config | Promise<Config>)) {
  if (typeof config === 'function') {
    return config
  }
  return () => config
}

export async function getConfig(path: string, defaultPath: string, options: ConfigArgs) {
  const configFilePath = path ? resolve(cwd(), path) : defaultPath

  const configModule = (await jiti.import(configFilePath)) as any
  const config = (await configModule.default(options)) as Config

  return { path: configFilePath, config }
}
