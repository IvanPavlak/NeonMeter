// Compares two PNG screenshots pixel by pixel and prints, as JSON, the largest channel
// difference (of 255), how many pixels differ by at least 4, 9 and 17, and the pixel
// count. headless.ps1 runs it on the frames; it reads the 8-bit, non-interlaced RGB and
// RGBA PNGs a Chromium screenshot writes, with Node's own zlib.
//
//     node scripts/benchmarking/compare.mjs a.png b.png

import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

/** The pixels of a PNG, as RGBA bytes row by row. */
function decode(file) {
  const png = readFileSync(file)
  let at = 8
  let width = 0
  let height = 0
  let channels = 0
  const data = []
  while (at < png.length) {
    const length = png.readUInt32BE(at)
    const type = png.toString('ascii', at + 4, at + 8)
    const body = png.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const depth = body[8]
      const color = body[9]
      if (depth !== 8 || body[12] !== 0 || (color !== 2 && color !== 6)) throw new Error(`${file}: only 8-bit, non-interlaced RGB or RGBA`)
      channels = color === 6 ? 4 : 3
    } else if (type === 'IDAT') data.push(body)
    else if (type === 'IEND') break
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * channels
  const out = Buffer.alloc(width * height * 4)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      let add = 0
      if (filter === 1) add = a
      else if (filter === 2) add = b
      else if (filter === 3) add = (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      line[x] = (line[x] + add) & 255
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) out[(y * width + x) * 4 + k] = line[x * channels + k]
      out[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255
    }
    prev = line
  }
  return { width, height, pixels: out }
}

const [fileA, fileB] = process.argv.slice(2)
if (!fileA || !fileB) throw new Error('usage: node compare.mjs a.png b.png')
const A = decode(fileA)
const B = decode(fileB)
const width = Math.min(A.width, B.width)
const height = Math.min(A.height, B.height)
let max = 0
let over4 = 0
let over9 = 0
let over17 = 0
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * A.width + x) * 4
    const j = (y * B.width + x) * 4
    const d = Math.max(Math.abs(A.pixels[i] - B.pixels[j]), Math.abs(A.pixels[i + 1] - B.pixels[j + 1]), Math.abs(A.pixels[i + 2] - B.pixels[j + 2]))
    if (d > max) max = d
    if (d >= 4) over4++
    if (d >= 9) over9++
    if (d >= 17) over17++
  }
}
console.log(JSON.stringify({ max, over4, over9, over17, pixels: width * height }))
