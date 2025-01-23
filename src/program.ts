import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
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
import { $ as zx } from 'zx'
import { getConfig } from './config'
import { logger } from './logger'
import { callWorkWeixinWebHook } from './work-weixin'

export function Program() {
  const DEFAULT_CONFIG_NAME = 'ci.config.ts'
  const DEFAULT_CONFIG_PATH = `${cwd()}/${DEFAULT_CONFIG_NAME}`

  const { version, description } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))

  const $ = zx({ quiet: true })

  program
    .name('wx-ci')
    .description(description)
    .version(version)

  program.command('upload')
    .description('upload')
    .option('-c, --config <string>', '配置文件路径', `./${DEFAULT_CONFIG_NAME}`)
    .requiredOption('-e, --env <string>', '环境')
    .option('-m, --mode <string>', '情景模式', 'default')
    .requiredOption('-v, --version <string>', '版本号')
    .option('-d, --description <string>', '版本描述')
    .option('-k, --private-key <string>', '上传密钥路径')
    .action(async (options) => {
      const spinner = ora('正在上传...').start()

      const actionId = randomUUID().toUpperCase()

      try {
        const env = options.env
        const mode = options.mode

        const { path, config } = await getConfig(
          options.config,
          DEFAULT_CONFIG_PATH,
          {
            actionId,
            env,
            mode,
            tools: { $: zx, spinner },
          },
        )

        if (config.prepare) {
          spinner.start('正在执行上传前置操作...')
          await config.prepare()
          spinner.start('正在上传...')
        }

        let username = 'unknown'
        const gitlabUserNameProcess = (await $`echo $GITLAB_USER_NAME`.nothrow())
        if (gitlabUserNameProcess.exitCode === 0) {
          username = gitlabUserNameProcess.stdout.trim()
        }
        else {
          const gitUserNameProcess = (await $`git config user.name`.nothrow())
          gitUserNameProcess.exitCode === 0 && (username = gitUserNameProcess.stdout.trim())
        }

        let branch = 'unknown'
        const branchProcess = (await $`git branch --show-current`.nothrow())
        branchProcess.exitCode === 0 && (branch = branchProcess.stdout.trim())

        let commitId = 'unknown'
        const commitIdProcess = (await $`echo $(git log -1 --format="%H")`.nothrow())
        commitIdProcess.exitCode === 0 && (commitId = commitIdProcess.stdout.trim())

        let commitMessage = 'unknown'
        const commitMessageProcess = (await $`echo $(git log -1 --format="%B")`.nothrow())
        commitMessageProcess.exitCode === 0 && (commitMessage = commitMessageProcess.stdout.trim())

        const appId = config.appId
        const version = options.version
        const description = options.description ?? `upload by ci, ${username}, ${new Date().toLocaleString()}`
        const projectPath = config.projectPath.startsWith('/') ? config.projectPath : resolve(dirname(path), config.projectPath)

        let privateKeyPath = options.privateKey || config.privateKeyPath
        if (!privateKeyPath) {
          throw new Error('缺少上传密钥路径')
        }
        privateKeyPath = privateKeyPath.startsWith('/') ? privateKeyPath : resolve(dirname(path), privateKeyPath)

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
${chalk.green('操作人(username):')} ${username}
${chalk.green('代码分支(branch):')} ${branch}
${chalk.green('最新提交ID(commitId):')} ${commitId}
${chalk.green('最新提交信息(commitMessage):')} ${commitMessage}
${chalk.green('应用ID(appId):')} ${appId}
${chalk.green('版本号(version):')} ${version}
${chalk.green('版本描述(description):')} ${description}
${chalk.green('环境(env):')} ${env}
${chalk.green('情景模式(mode):')} ${mode}
${chalk.green('配置路径(configPath):')} ${path}
${chalk.green('项目路径(projectPath):')} ${projectPath}`)

        if (config.webhook?.workWeixin) {
          try {
            await callWorkWeixinWebHook({
              type: 'upload',
              url: config.webhook.workWeixin,
              info: {
                操作ID: actionId,
                操作人: username,
                代码分支: branch,
                最新提交ID: commitId,
                最新提交信息: commitMessage,
                应用ID: appId,
                版本号: version,
                版本描述: description,
                环境: env,
                情景模式: mode,
              },
            })
          }
          catch (error) {
            logger.error(new Error('企业微信通知发送失败', { cause: error }))
          }
          finally {
            exit(0)
          }
        }
        else {
          exit(0)
        }
      }

      catch (error) {
        spinner.stop()
        logger.error(new Error('上传失败', { cause: error }))
        exit(1)
      }
    })

  program.command('preview')
    .description('preview')
    .option('-c, --config <string>', '配置文件路径', `./${DEFAULT_CONFIG_NAME}`)
    .requiredOption('-e, --env <string>', '环境')
    .option('-m, --mode <string>', '情景模式', 'default')
    .requiredOption('-v, --version <string>', '版本号')
    .option('-d, --description <string>', '版本描述')
    .option('-u, --url <string>', '预览页面')
    .option('-s, --scene <string>', '场景值')
    .option('-k, --private-key <string>', '上传密钥路径')
    .action(async (options) => {
      const spinner = ora('正在生成预览二维码...').start()

      const actionId = randomUUID().toUpperCase()

      try {
        const env = options.env
        const mode = options.mode

        const { path, config } = await getConfig(
          options.config,
          DEFAULT_CONFIG_PATH,
          {
            actionId,
            env,
            mode,
            tools: { $: zx, spinner },
          },
        )

        if (config.prepare) {
          spinner.start('正在执行预览前置操作...')
          await config.prepare()
          spinner.start('正在生成预览二维码...')
        }

        let username = 'unknown'
        const gitlabUserNameProcess = (await $`echo $GITLAB_USER_NAME`.nothrow())
        if (gitlabUserNameProcess.exitCode === 0) {
          username = gitlabUserNameProcess.stdout.trim()
        }
        else {
          const gitUserNameProcess = (await $`git config user.name`.nothrow())
          gitUserNameProcess.exitCode === 0 && (username = gitUserNameProcess.stdout.trim())
        }

        let branch = 'unknown'
        const branchProcess = (await $`git branch --show-current`.nothrow())
        branchProcess.exitCode === 0 && (branch = branchProcess.stdout.trim())

        let commitId = 'unknown'
        const commitIdProcess = (await $`echo $(git log -1 --format="%H")`.nothrow())
        commitIdProcess.exitCode === 0 && (commitId = commitIdProcess.stdout.trim())

        let commitMessage = 'unknown'
        const commitMessageProcess = (await $`echo $(git log -1 --format="%B")`.nothrow())
        commitMessageProcess.exitCode === 0 && (commitMessage = commitMessageProcess.stdout.trim())

        const appId = config.appId
        const version = options.version
        const description = options.description ?? `preview by ci, ${username}, ${new Date().toLocaleString()}`
        const projectPath = config.projectPath.startsWith('/') ? config.projectPath : resolve(dirname(path), config.projectPath)

        let privateKeyPath = options.privateKey || config.privateKeyPath
        if (!privateKeyPath) {
          throw new Error('缺少上传密钥路径')
        }
        privateKeyPath = privateKeyPath.startsWith('/') ? privateKeyPath : resolve(dirname(path), privateKeyPath)

        const tmpDir = resolve(tmpdir(), 'wx-ci')
        existsSync(tmpDir) || mkdirSync(tmpDir)
        const outputPath = resolve(tmpDir, `${actionId}.jpg`)

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
${chalk.green('操作人(username):')} ${username}
${chalk.green('代码分支(branch):')} ${branch}
${chalk.green('最新提交ID(commitId):')} ${commitId}
${chalk.green('最新提交信息(commitMessage):')} ${commitMessage}
${chalk.green('版本号(version):')} ${version}
${chalk.green('版本描述(description):')} ${description}
${chalk.green('环境(env):')} ${env}
${chalk.green('情景模式(mode):')} ${mode}
${chalk.green('预览页面(url):')} ${options.url ?? 'default'}
${chalk.green('预览场景(scene):')} ${scene ?? '1011'}
${chalk.green('配置路径(configPath):')} ${path}
${chalk.green('项目路径(projectPath):')} ${projectPath}
${chalk.green('二维码临时保存路径(outputPath):')} ${outputPath}`)

        if (config.webhook?.workWeixin) {
          try {
            await callWorkWeixinWebHook({
              type: 'preview',
              url: config.webhook.workWeixin,
              info: {
                操作ID: actionId,
                操作人: username,
                代码分支: branch,
                最新提交ID: commitId,
                最新提交信息: commitMessage,
                应用ID: appId,
                版本号: version,
                版本描述: description,
                环境: env,
                情景模式: mode,
                预览页面: options.url ?? 'default',
                预览场景: scene ?? '1011',
              },
              image: config.qrCodeUpload
                ? await config.qrCodeUpload(readFileSync(outputPath))
                : {
                    base64: readFileSync(outputPath).toString('base64'),
                    md5: createHash('md5').update(readFileSync(outputPath)).digest('hex'),
                  },
            })
          }
          catch (error) {
            logger.error(new Error('企业微信通知发送失败', { cause: error }))
          }
          finally {
            exit(0)
          }
        }
        else {
          exit(0)
        }
      }

      catch (error) {
        spinner.stop()
        logger.error(new Error('预览失败', { cause: error }))
        exit(1)
      }
    })

  return program
}
