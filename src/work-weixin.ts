export async function callWorkWeixinWebHook(options: {
  type: 'upload' | 'preview'
  url: string
  info: Record<string, string>
  image?: { base64: string, md5: string }
}) {
  await fetch(options.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: {
        content:
          `**小程序版本${options.type === 'upload' ? '上传' : '预览'}**`
          + `\n${
            Object.entries(options.info).map(([key, value]) => `${key}: ${value}`).join('\n')}`,
      },
    }),
  })

  if (options.type === 'preview' && options.image) {
    await fetch(options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msgtype: 'image',
        image: {
          base64: options.image.base64,
          md5: options.image.md5,
        },
      }),
    })
  }
}
