import type { Buffer } from 'node:buffer'
import type { Ora } from 'ora'
import type { Options, Shell } from 'zx'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)

export interface ConfigArgs {
  /** 操作 ID */
  actionId: string
  /** 环境 */
  env: string
  /** 情景模式 */
  mode: string
  /** 工具 */
  tools: {
    /** 命令行工具 */
    $: Shell & Options
    /** 命令行加载器 */
    spinner: Ora
  }
}

export interface Config {
  /** 小程序APP ID */
  appId: string
  /** 小程序项目路径 */
  projectPath: string
  /** 小程序上传密钥路径 */
  privateKeyPath?: string
  /** 通知地址 */
  webhook?: {
    /** 企业微信 */
    workWeixin?: string
  }
  /**
   * - 准备上传或预览
   * - 在上传或预览前执行
   */
  prepare?: () => void | Promise<void>
  /**
   * 上传二维码
   * @param buffer 二维码 buffer
   */
  qrCodeUpload?: (buffer: Buffer) => string | Promise<string>
}

export function defineConfig(config: Config | ((args: ConfigArgs) => Config | Promise<Config>)) {
  if (typeof config === 'function') {
    return config
  }
  return () => config
}

export async function getConfig(path: string, defaultPath: string, options: ConfigArgs) {
  const configFilePath = path ? path.startsWith('/') ? path : resolve(cwd(), path) : defaultPath

  const configModule = (await jiti.import(configFilePath)) as any
  const config = (await configModule.default(options)) as Config

  return { path: configFilePath, config }
}
