/**
 * Dependency-free QR Code Version 10-L byte encoder.
 * Each certificate URL is rendered locally into the PDF. No token is sent to
 * third-party QR services. Supports UTF-8 payloads up to 271 bytes.
 */
const VERSION = 10
const SIZE = 4 * VERSION + 17
const DATA_CODEWORDS = 274
const ECC_CODEWORDS = 18
const BLOCK_COUNT = 4
export type QrMatrix = boolean[][]

function fieldMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}
function generator(degree: number): number[] {
  const result = Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = fieldMultiply(result[j], root)
      if (j + 1 < degree) result[j] ^= result[j + 1]
    }
    root = fieldMultiply(root, 2)
  }
  return result
}
function remainder(data: number[], divisor: number[]): number[] {
  const result = Array<number>(divisor.length).fill(0)
  for (const byte of data) {
    const factor = byte ^ result[0]
    result.shift()
    result.push(0)
    for (let j = 0; j < divisor.length; j++) result[j] ^= fieldMultiply(divisor[j], factor)
  }
  return result
}
function encodeCodewords(text: string): number[] {
  const data = Array.from(new TextEncoder().encode(text))
  if (data.length > 271) throw new Error('Alamat verifikasi terlalu panjang untuk QR sertifikat.')
  const bits: number[] = []
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  append(4, 4)
  append(data.length, 16)
  for (const byte of data) append(byte, 8)
  append(0, Math.min(4, DATA_CODEWORDS * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  const bytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0
    for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j]
    bytes.push(value)
  }
  while (bytes.length < DATA_CODEWORDS) bytes.push(bytes.length % 2 === 0 ? 0xec : 0x11)
  const blocks: Array<{data:number[];ecc:number[]}> = []
  const div = generator(ECC_CODEWORDS)
  let offset = 0
  for (let i = 0; i < BLOCK_COUNT; i++) {
    const length = Math.floor(346 / BLOCK_COUNT) - ECC_CODEWORDS + (i >= BLOCK_COUNT - (346 % BLOCK_COUNT) ? 1 : 0)
    const block = bytes.slice(offset, offset + length)
    offset += length
    blocks.push({ data: block, ecc: remainder(block, div) })
  }
  const result: number[] = []
  for (let i = 0; i < 69; i++) for (const block of blocks) if (i < block.data.length) result.push(block.data[i])
  for (let i = 0; i < ECC_CODEWORDS; i++) for (const block of blocks) result.push(block.ecc[i])
  if (offset !== DATA_CODEWORDS || result.length !== 346) throw new Error('Panjang QR tidak valid.')
  return result
}
export function qrMatrix(text: string): QrMatrix {
  const codewords = encodeCodewords(text)
  const matrix: QrMatrix = Array.from({length:SIZE},()=>Array<boolean>(SIZE).fill(false))
  const used: QrMatrix = Array.from({length:SIZE},()=>Array<boolean>(SIZE).fill(false))
  const put = (x:number,y:number,black:boolean) => {
    if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) {
      matrix[y][x] = black
      used[y][x] = true
    }
  }
  const finder = (cx:number,cy:number) => {
    for (let dy=-4;dy<=4;dy++) for (let dx=-4;dx<=4;dx++) {
      const d=Math.max(Math.abs(dx),Math.abs(dy))
      put(cx+dx,cy+dy,d!==2&&d!==4)
    }
  }
  finder(3,3);finder(SIZE-4,3);finder(3,SIZE-4)
  for(let i=8;i<SIZE-8;i++){put(6,i,i%2===0);put(i,6,i%2===0)}
  for(const x of [6,28,50]) for(const y of [6,28,50]) {
    if ((x===6&&y===6)||(x===6&&y===50)||(x===50&&y===6)) continue
    for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++)
      put(x+dx,y+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)
  }
  let rem=VERSION
  for(let i=0;i<12;i++) rem=(rem<<1)^((rem>>>11)*0x1f25)
  const versionBits=(VERSION<<12)|rem
  for(let i=0;i<18;i++){
    const bit=((versionBits>>>i)&1)!==0
    const a=SIZE-11+i%3,b=Math.floor(i/3)
    put(a,b,bit);put(b,a,bit)
  }
  // Error correction level L, mask pattern 0.
  const data5=1<<3
  rem=data5
  for(let i=0;i<10;i++) rem=(rem<<1)^((rem>>>9)*0x537)
  const format=((data5<<10)|rem)^0x5412
  for(let i=0;i<6;i++) put(8,i,((format>>>i)&1)!==0)
  put(8,7,((format>>>6)&1)!==0)
  put(8,8,((format>>>7)&1)!==0)
  put(7,8,((format>>>8)&1)!==0)
  for(let i=9;i<15;i++) put(14-i,8,((format>>>i)&1)!==0)
  for(let i=0;i<8;i++) put(SIZE-1-i,8,((format>>>i)&1)!==0)
  for(let i=8;i<15;i++) put(8,SIZE-15+i,((format>>>i)&1)!==0)
  put(8,SIZE-8,true)
  let index=0
  for(let right=SIZE-1;right>=1;right-=2) {
    if(right===6)right=5
    for(let vertical=0;vertical<SIZE;vertical++){
      const y=((right+1)&2)===0?SIZE-1-vertical:vertical
      for(let offset=0;offset<2;offset++){
        const x=right-offset
        if(used[y][x])continue
        const dark=index<codewords.length*8?((codewords[Math.floor(index/8)]>>>(7-index%8))&1)!==0:false
        matrix[y][x]=dark!==((x+y)%2===0)
        index++
      }
    }
  }
  if(index!==codewords.length*8) throw new Error('Matriks QR gagal dibuat.')
  return matrix
}
/** PDF operators place a black QR with a 4-module white quiet zone; x/y are bottom-left points. */
export function qrPdfCommands(url:string,x:number,y:number,size:number):string[]{
  const matrix=qrMatrix(url)
  const moduleSize=size/(SIZE+8)
  const result=['0 0 0 rg']
  for(let row=0;row<SIZE;row++){
    let col=0
    while(col<SIZE){
      if(!matrix[row][col]){col++;continue}
      const start=col
      while(col<SIZE&&matrix[row][col])col++
      const px=x+(start+4)*moduleSize
      const py=y+(SIZE+3-row)*moduleSize
      result.push(px.toFixed(3)+' '+py.toFixed(3)+' '+((col-start)*moduleSize).toFixed(3)+' '+moduleSize.toFixed(3)+' re f')
    }
  }
  return result
}
export function certificateVerificationUrl(code:string,basePath:string):string {
  if(typeof window==='undefined')throw new Error('Alamat verifikasi hanya dibentuk di browser.')
  const path=basePath.startsWith('/')?basePath:'/'+basePath
  return window.location.origin+path.replace(/\/$/,'')+'/#cert/'+encodeURIComponent(code)
}
