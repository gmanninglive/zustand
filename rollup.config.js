const path = require('path')
const alias = require('@rollup/plugin-alias')
const babelPlugin = require('@rollup/plugin-babel')
const resolve = require('@rollup/plugin-node-resolve')
const replace = require('@rollup/plugin-replace')
const typescript = require('@rollup/plugin-typescript')
const { default: esbuild } = require('rollup-plugin-esbuild')
const { terser } = require('rollup-plugin-terser')
const createBabelConfig = require('./babel.config')

const extensions = ['.js', '.ts', '.tsx']
const { root } = path.parse(process.cwd())

function external(id) {
  return !id.startsWith('.') && !id.startsWith(root)
}

function getBabelOptions(targets) {
  return {
    ...createBabelConfig({ env: (env) => env === 'build' }, targets),
    extensions,
    comments: false,
    babelHelpers: 'bundled',
  }
}

function getEsbuild(target, env = 'development') {
  return esbuild({
    minify: env === 'production',
    target,
    tsconfig: path.resolve('./tsconfig.json'),
  })
}

function createDeclarationConfig(input, output) {
  return {
    input,
    output: {
      dir: output,
    },
    external,
    plugins: [
      typescript({
        declaration: true,
        emitDeclarationOnly: true,
        outDir: output,
      }),
    ],
  }
}

function createESMConfig(input, output) {
  return {
    input,
    output: { file: output, format: 'esm' },
    external,
    plugins: [
      alias({
        entries: {
          './vanilla': 'zustand/vanilla',
        },
      }),
      resolve({ extensions }),
      replace({
        __DEV__: output.endsWith('.mjs')
          ? '((import.meta.env&&import.meta.env.MODE)!=="production")'
          : '(process.env.NODE_ENV!=="production")',
        // a workround for #829
        'use-sync-external-store/shim/with-selector':
          'use-sync-external-store/shim/with-selector.js',
        preventAssignment: true,
      }),
      getEsbuild('node12'),
    ],
  }
}

function createCommonJSConfig(input, output, options) {
  return {
    input,
    output: {
      file: `${output}.js`,
      format: 'cjs',
      esModule: false,
      outro: options.addModuleExport
        ? ';(module.exports = (exports && exports.default) || {}),\n  Object.assign(module.exports, exports)'
        : '',
    },
    external,
    plugins: [
      alias({
        entries: {
          './vanilla': 'zustand/vanilla',
        },
      }),
      resolve({ extensions }),
      replace({
        __DEV__: '(process.env.NODE_ENV!=="production")',
        preventAssignment: true,
      }),
      babelPlugin(getBabelOptions({ ie: 11 })),
    ],
  }
}

function createUMDConfig(input, output, env) {
  const c = output.split('/').pop()
  return {
    input,
    output: {
      file: `${output}.${env}.js`,
      format: 'umd',
      name:
        c === 'index'
          ? 'zustand'
          : `zustand${c.slice(0, 1).toUpperCase()}${c.slice(1)}`,
      globals: {
        react: 'React',
        // FIXME not yet supported
        'use-sync-external-store/shim/with-selector':
          'useSyncExternalStoreShimWithSelector',
        'zustand/vanilla': 'zustandVanilla',
      },
    },
    external,
    plugins: [
      alias({
        entries: {
          './vanilla': 'zustand/vanilla',
        },
      }),
      resolve({ extensions }),
      replace({
        __DEV__: env !== 'production' ? 'true' : 'false',
        preventAssignment: true,
      }),
      babelPlugin(getBabelOptions({ ie: 11 })),
      ...(env === 'production' ? [terser()] : []),
    ],
  }
}

function createSystemConfig(input, output, env) {
  return {
    input,
    output: {
      file: `${output}.${env}.js`,
      format: 'system',
    },
    external,
    plugins: [
      alias({
        entries: {
          './vanilla': 'zustand/vanilla',
        },
      }),
      resolve({ extensions }),
      replace({
        __DEV__: env !== 'production' ? 'true' : 'false',
        preventAssignment: true,
      }),
      getEsbuild('node12', env),
    ],
  }
}

module.exports = function (args) {
  let c = Object.keys(args).find((key) => key.startsWith('config-'))
  if (c) {
    c = c.slice('config-'.length).replace(/_/g, '/')
  } else {
    c = 'index'
  }
  return [
    ...(c === 'index' ? [createDeclarationConfig(`src/${c}.ts`, 'dist')] : []),
    createCommonJSConfig(`src/${c}.ts`, `dist/${c}`, {
      addModuleExport: c === 'index',
    }),
    createESMConfig(`src/${c}.ts`, `dist/esm/${c}.js`),
    createESMConfig(`src/${c}.ts`, `dist/esm/${c}.mjs`),
    createUMDConfig(`src/${c}.ts`, `dist/umd/${c}`, 'development'),
    createUMDConfig(`src/${c}.ts`, `dist/umd/${c}`, 'production'),
    createSystemConfig(`src/${c}.ts`, `dist/system/${c}`, 'development'),
    createSystemConfig(`src/${c}.ts`, `dist/system/${c}`, 'production'),
  ]
}
