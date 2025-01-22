/* eslint-disable no-console */

export const logger = {
  log: console.log,
  error: console.error,
}

console.log = () => {}
console.info = () => {}
console.warn = () => {}
console.error = () => {}
