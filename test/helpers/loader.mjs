import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceModule from '../../hayase/src/index.js'
import * as sourceExports from '../../hayase/src/index.js'
import bundleModule from '../../hayase/nyaasi.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const BUNDLE_PATH = path.resolve(ROOT, 'hayase', 'nyaasi.js')

function moduleWithDefault(moduleExports, defaultExport) {
  return { ...moduleExports, NyaaSi: defaultExport }
}

const SOURCE = moduleWithDefault(sourceExports, sourceModule)
const BUNDLE = moduleWithDefault(sourceExports, bundleModule)
const DEFAULT = process.env.HAYASE_TEST_BUNDLE === 'true' ? BUNDLE : SOURCE

export function loadExtension(file) {
  return file ? (path.resolve(file) === BUNDLE_PATH ? BUNDLE : SOURCE) : DEFAULT
}

export function getExtension(file) {
  return loadExtension(file).NyaaSi
}

export function getInternals(file) {
  const { NyaaSi, ...internals } = loadExtension(file)
  return internals
}
