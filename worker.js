/*
Worker scans incoming ArrayBuffer chunks for embedded image files inside arbitrary binary files (like .blend).
Detected types: PNG, JPEG, GIF, BMP.
It receives messages:
 - {cmd:'reset'}
 - {cmd:'chunk', chunk:ArrayBuffer, offset:Number}
 - {cmd:'finish'}
 - {cmd:'progressRequest', percent}
It posts messages:
 - {type:'found', range:{start,end,type}}
 - {type:'progress', percent,text}
 - {type:'done'}
 - {type:'status', text}
*/

let tail = new Uint8Array(0);
let currentOpen = []; // open captures e.g. for JPEG/PNG waiting for end {type,start}
const SIGN = {
  PNG: Uint8Array.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
  PNG_IEND: Uint8Array.from([0x49,0x45,0x4E,0x44,0xAE,0x42,0x60,0x82]),
  JPEG_SOI: Uint8Array.from([0xFF,0xD8]),
  JPEG_EOI: Uint8Array.from([0xFF,0xD9]),
  GIF87: new TextEncoder().encode('GIF87a'),
  GIF89: new TextEncoder().encode('GIF89a'),
  GIF_TERMINATOR: Uint8Array.from([0x3B]),
  BMP_HEADER: Uint8Array.from([0x42,0x4D]) // 'BM'
};

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.cmd === 'reset') {
    tail = new Uint8Array(0);
    currentOpen = [];
  } else if (msg.cmd === 'chunk') {
    processChunk(new Uint8Array(msg.chunk), msg.offset);
  } else if (msg.cmd === 'finish') {
    // close any that we can (JPEG/GIF if EOI found already else ignore)
    postMessage({type:'done'});
  } else if (msg.cmd === 'progressRequest') {
    postMessage({type:'progress', percent: msg.percent, text: `Scanning ${msg.percent}%`});
  }
};

function concat(a,b){
  const c = new Uint8Array(a.length + b.length);
  c.set(a,0);
  c.set(b,a.length);
  return c;
}

function indexOfPattern(buf, pat, from=0){
  // naive search
  outer: for (let i=from;i<=buf.length - pat.length;i++){
    for (let j=0;j<pat.length;j++){
      if (buf[i+j] !== pat[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function processChunk(chunk, offset) {
  // we keep a tail (last 64kb maybe) to handle patterns across boundaries
  const TAIL_MAX = 65536; // 64KB
  const window = concat(tail, chunk);
  const baseOffset = offset - tail.length;
  // Search for PNG starts
  let i = 0;
  while (true) {
    let pos;
    pos = indexOfPattern(window, SIGN.PNG, i);
    if (pos === -1) break;
    const absStart = baseOffset + pos;
    // find IEND from pos onwards
    const iendPos = indexOfPattern(window, SIGN.PNG_IEND, pos+8);
    if (iendPos !== -1) {
      const absEnd = baseOffset + iendPos + SIGN.PNG_IEND.length;
      postMessage({type:'found', range:{start:absStart, end:absEnd, type:'PNG'}});
      i = iendPos + SIGN.PNG_IEND.length;
      continue;
    } else {
      // IEND not in current window: open capture and wait
      currentOpen.push({type:'PNG', start:absStart});
      i = pos + SIGN.PNG.length;
      continue;
    }
  }

  // JPEG: find SOI and EOI
  i = 0;
  while (true) {
    let pos = indexOfPattern(window, SIGN.JPEG_SOI, i);
    if (pos === -1) break;
    const absStart = baseOffset + pos;
    // search for EOI
    const eoiPos = indexOfPattern(window, SIGN.JPEG_EOI, pos+2);
    if (eoiPos !== -1) {
      const absEnd = baseOffset + eoiPos + SIGN.JPEG_EOI.length;
      postMessage({type:'found', range:{start:absStart, end:absEnd, type:'JPEG'}});
      i = eoiPos + SIGN.JPEG_EOI.length;
      continue;
    } else {
      currentOpen.push({type:'JPEG', start:absStart});
      i = pos + 2;
      continue;
    }
  }

  // GIF
  i = 0;
  while (true) {
    const pos87 = indexOfPattern(window, SIGN.GIF87, i);
    const pos89 = indexOfPattern(window, SIGN.GIF89, i);
    let pos = -1;
    if (pos87 !== -1 && (pos89 === -1 || pos87 < pos89)) pos = pos87;
    else if (pos89 !== -1) pos = pos89;
    if (pos === -1) break;
    const absStart = baseOffset + pos;
    // search for terminator 0x3B from pos onward
    const termPos = indexOfPattern(window, SIGN.GIF_TERMINATOR, pos+6);
    if (termPos !== -1) {
      const absEnd = baseOffset + termPos + 1;
      postMessage({type:'found', range:{start:absStart, end:absEnd, type:'GIF'}});
      i = termPos + 1;
      continue;
    } else {
      currentOpen.push({type:'GIF', start:absStart});
      i = pos + 6;
      continue;
    }
  }

  // BMP - header 'BM' then 4-byte little-endian file size at offset+2
  i = 0;
  while (true) {
    let pos = indexOfPattern(window, SIGN.BMP_HEADER, i);
    if (pos === -1) break;
    // ensure we have 6 bytes at least to read size (pos+6)
    if (pos + 6 <= window.length) {
      const sizeOff = pos + 2;
      // little endian 4 bytes
      const b0 = window[sizeOff];
      const b1 = window[sizeOff+1];
      const b2 = window[sizeOff+2];
      const b3 = window[sizeOff+3];
      const declaredSize = (b3<<24) | (b2<<16) | (b1<<8) | b0;
      if (declaredSize > 0 && declaredSize < 2**32) {
        const absStart = baseOffset + pos;
        const absEnd = absStart + declaredSize;
        postMessage({type:'found', range:{start:absStart, end:absEnd, type:'BMP'}});
        i = pos + 2;
        continue;
      } else {
        i = pos + 2;
        continue;
      }
    } else {
      // header spans beyond current window - defer by keeping tail
      break;
    }
  }

  // Check if any open captures can be closed within this window (search for end markers)
  if (currentOpen.length > 0) {
    // For each open, attempt to find its end marker in window after (start - baseOffset)
    for (let j = currentOpen.length - 1; j >= 0; j--) {
      const open = currentOpen[j];
      const relStart = open.start - baseOffset;
      if (relStart < 0) {
        // start was before this window; set search from 0
      }
      if (open.type === 'PNG') {
        const searchFrom = Math.max(0, relStart + 8);
        const iendPos = indexOfPattern(window, SIGN.PNG_IEND, searchFrom);
        if (iendPos !== -1) {
          const absEnd = baseOffset + iendPos + SIGN.PNG_IEND.length;
          postMessage({type:'found', range:{start:open.start, end:absEnd, type:'PNG'}});
          currentOpen.splice(j,1);
        }
      } else if (open.type === 'JPEG') {
        const searchFrom = Math.max(0, relStart + 2);
        const eoiPos = indexOfPattern(window, SIGN.JPEG_EOI, searchFrom);
        if (eoiPos !== -1) {
          const absEnd = baseOffset + eoiPos + SIGN.JPEG_EOI.length;
          postMessage({type:'found', range:{start:open.start, end:absEnd, type:'JPEG'}});
          currentOpen.splice(j,1);
        }
      } else if (open.type === 'GIF') {
        const searchFrom = Math.max(0, relStart + 6);
        const termPos = indexOfPattern(window, SIGN.GIF_TERMINATOR, searchFrom);
        if (termPos !== -1) {
          const absEnd = baseOffset + termPos + 1;
          postMessage({type:'found', range:{start:open.start, end:absEnd, type:'GIF'}});
          currentOpen.splice(j,1);
        }
      }
    }
  }

  // maintain tail as last TAIL_MAX bytes of window
  if (window.length > TAIL_MAX) {
    tail = window.slice(window.length - TAIL_MAX);
  } else {
    tail = window;
  }
}