/* eslint-disable no-console */

export const logger = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

console.log = () => {}
console.info = () => {}
console.warn = () => {}
console.error = () => {}
