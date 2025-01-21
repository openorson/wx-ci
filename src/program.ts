import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { cwd, exit } from 'node:process'
import chalk from 'chalk'
import { program } from 'commander'
import { Jimp } from 'jimp'
import jsQR from 'jsqr'
import CI from 'miniprogram-ci'
import ora from 'ora'
import { renderANSI } from 'uqr'
import { $ } from 'zx'
import { getConfig } from './config'
import { logger } from './logger'
import { callWorkWeixinWebHook } from './work-weixin'

export function Program() {
  const DEFAULT_CONFIG_NAME = 'ci.config.ts'
  const DEFAULT_CONFIG_PATH = `${cwd()}/${DEFAULT_CONFIG_NAME}`

  const { version, description } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))

  program
    .name('wx-ci')
    .description(description)
    .version(version)

  program.command('upload')
    .description('upload')
    .option('-c, --config <string>', '配置文件路径', `./${DEFAULT_CONFIG_NAME}`)
    .option('-e, --env <string>', '环境', 'production')
    .option('-m, --mode <string>', '模式', 'default')
    .requiredOption('-v, --version <string>', '版本号')
    .option('-d, --description <string>', '版本描述')
    .action(async (options) => {
      const spinner = ora('正在上传...').start()

      const actionId = randomUUID().toUpperCase()

      try {
        const env = options.env
        const mode = options.mode

        const { path, config } = await getConfig(
          options.config,
          DEFAULT_CONFIG_PATH,
          { env, mode },
        )

        if (config.prepare) {
          spinner.start('正在执行上传前置操作...')
          await config.prepare($, spinner)
          spinner.start('正在上传...')
        }

        const username = (await $`git config user.name`).stdout.trim()

        const appId = config.appId
        const version = options.version
        const description = options.description ?? `upload by ci, ${username}, ${new Date().toLocaleString()}`
        const projectPath = resolve(dirname(path), config.projectPath)
        const privateKeyPath = resolve(dirname(path), config.privateKeyPath)

        const project = new CI.Project({
          appid: appId,
          type: 'miniProgram',
          projectPath,
          privateKeyPath,
          ignores: ['node_modules/**/*'],
        })

        await CI.upload({
          project,
          version,
          desc: description,
          setting: {
            useProjectConfig: true,
          },
        })

        spinner.stop()

        logger.log(`${chalk.green('上传成功')}
${chalk.green('操作ID(actionId):')} ${actionId}
${chalk.green('应用ID(appId):')} ${appId}
${chalk.green('版本号(version):')} ${version}
${chalk.green('版本描述(description):')} ${description}
${chalk.green('环境(env):')} ${env}
${chalk.green('模式(mode):')} ${mode}
${chalk.green('配置路径(configPath):')} ${path}
${chalk.green('项目路径(projectPath):')} ${projectPath}`)

        if (config.webhook?.workWeixin) {
          await callWorkWeixinWebHook({
            type: 'upload',
            url: config.webhook.workWeixin,
            info: {
              操作ID: actionId,
              应用ID: appId,
              版本号: version,
              版本描述: description,
              环境: env,
              模式: mode,
            },
          })
        }
      }

      catch (error) {
        spinner.stop()
        console.error(new Error('上传失败', { cause: error }))
      }

      finally {
        exit()
      }
    })

  program.command('preview')
    .description('preview')
    .option('-c, --config <string>', '配置文件路径', `./${DEFAULT_CONFIG_NAME}`)
    .option('-e, --env <string>', '环境', 'production')
    .option('-m, --mode <string>', '模式', 'default')
    .requiredOption('-v, --version <string>', '版本号')
    .option('-d, --description <string>', '版本描述')
    .option('-u, --url <string>', '预览页面')
    .option('-s, --scene <string>', '场景值')
    .action(async (options) => {
      const spinner = ora('正在生成预览二维码...').start()

      const actionId = randomUUID().toUpperCase()

      try {
        const env = options.env
        const mode = options.mode

        const { path, config } = await getConfig(
          options.config,
          DEFAULT_CONFIG_PATH,
          { env, mode },
        )

        if (config.prepare) {
          spinner.start('正在执行预览前置操作...')
          await config.prepare($, spinner)
          spinner.start('正在生成预览二维码...')
        }

        const username = (await $`git config user.name`).stdout.trim()

        const appId = config.appId
        const version = options.version
        const description = options.description ?? `preview by ci, ${username}, ${new Date().toLocaleString()}`
        const projectPath = resolve(dirname(path), config.projectPath)
        const privateKeyPath = resolve(dirname(path), config.privateKeyPath)
        const outputPath = resolve(tmpdir(), `${actionId}.jpg`)
        const [pagePath, searchQuery] = options.url ? (options.url as string).split('?') : [void 0, void 0]
        const scene = options.scene

        const project = new CI.Project({
          appid: appId,
          type: 'miniProgram',
          projectPath,
          privateKeyPath,
          ignores: ['node_modules/**/*'],
        })

        await CI.preview({
          project,
          version,
          desc: description,
          setting: {
            useProjectConfig: true,
          },
          qrcodeFormat: 'image',
          qrcodeOutputDest: outputPath,
          ...(pagePath ? { pagePath } : {}),
          ...(searchQuery ? { searchQuery } : {}),
          ...(scene ? { scene } : {}),
        })

        const image = await Jimp.read(outputPath)
        const grayscaleImage = image.greyscale()
        const qrCodeData = jsQR(
          new Uint8ClampedArray(grayscaleImage.bitmap.data),
          grayscaleImage.bitmap.width,
          grayscaleImage.bitmap.height,
        )

        if (!qrCodeData) {
          throw new Error('无法解析二维码')
        }

        spinner.stop()

        logger.log(renderANSI(qrCodeData.data))

        logger.log(`\n${chalk.green('预览成功')}
${chalk.green('应用ID(appId):')} ${appId}
${chalk.green('操作ID(actionId):')} ${actionId}
${chalk.green('版本号(version):')} ${version}
${chalk.green('版本描述(description):')} ${description}
${chalk.green('环境(env):')} ${env}
${chalk.green('模式(mode):')} ${mode}
${chalk.green('预览页面(url):')} ${options.url ?? 'default'}
${chalk.green('预览场景(scene):')} ${scene ?? '1011'}
${chalk.green('配置路径(configPath):')} ${path}
${chalk.green('项目路径(projectPath):')} ${projectPath}
${chalk.green('二维码临时保存路径(outputPath):')} ${outputPath}`)

        if (config.webhook?.workWeixin) {
          await callWorkWeixinWebHook({
            type: 'preview',
            url: config.webhook.workWeixin,
            info: {
              操作ID: actionId,
              应用ID: appId,
              版本号: version,
              版本描述: description,
              环境: env,
              模式: mode,
              预览页面: options.url ?? 'default',
              预览场景: scene ?? '1011',
            },
            image: {
              base64: readFileSync(outputPath).toString('base64'),
              md5: createHash('md5').update(readFileSync(outputPath)).digest('hex'),
            },
          })
        }
      }

      catch (error) {
        spinner.stop()
        console.error(new Error('预览失败', { cause: error }))
      }

      finally {
        exit()
      }
    })

  return program
}
