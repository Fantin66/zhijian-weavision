'use strict';
/* ============================================================
   Word 97-2003 (.doc) 文本抽取器
   第一层：OLE2(CFB) 容器 → FIB → piece table → 纯文本

   为什么需要它：.docx 是 ZIP+XML，docx-preview 直接能读；
   .doc 是 OLE2 复合文档，正文躺在 WordDocument 流里，
   必须按 FIB 指向的 piece table 逐片解码（且分 8bit/UTF-16 两种存法）。
============================================================ */

/* CP1252 的 0x80–0x9F 区间不是 Latin-1，Word 压缩存放时按 CP1252 解释 */
const CP1252 = {
  0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026',
  0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6', 0x89: '\u2030',
  0x8A: '\u0160', 0x8B: '\u2039', 0x8C: '\u0152', 0x8E: '\u017D',
  0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D',
  0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02DC',
  0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A', 0x9C: '\u0153',
  0x9E: '\u017E', 0x9F: '\u0178',
};
const cp1252Char = (b) => (b >= 0x80 && b <= 0x9F) ? (CP1252[b] || '\uFFFD') : String.fromCharCode(b);

/* ── 一、OLE2 / CFB 容器 ───────────────────────────────── */
function parseCFB(buf) {
  if (buf.length < 512 || buf.readUInt32LE(0) !== 0xE011CFD0) throw new Error('不是 OLE2 复合文档');
  const sectorShift = buf.readUInt16LE(30);
  const miniSectorShift = buf.readUInt16LE(32);
  if (sectorShift < 7 || sectorShift > 20) throw new Error('扇区尺寸异常');
  const sectorSize = 1 << sectorShift;
  const miniSize = 1 << miniSectorShift;
  const firstDir = buf.readUInt32LE(48);
  const miniCutoff = buf.readUInt32LE(56) || 4096;
  const firstMiniFat = buf.readUInt32LE(60);
  const numMiniFat = buf.readUInt32LE(64);
  const firstDifat = buf.readUInt32LE(68);
  const sectorOff = (n) => (n + 1) * sectorSize;

  /* DIFAT：头里 109 项，不够再顺链取 */
  const difat = [];
  for (let i = 0; i < 109; i++) {
    const v = buf.readUInt32LE(76 + i * 4);
    if (v >= 0xFFFFFFFA) break;
    difat.push(v);
  }
  let ds = firstDifat, g1 = 0;
  const perSector = sectorSize / 4 - 1;
  while (ds < 0xFFFFFFFA && g1++ < 100000) {
    const off = sectorOff(ds);
    if (off + sectorSize > buf.length) break;
    for (let i = 0; i < perSector; i++) {
      const v = buf.readUInt32LE(off + i * 4);
      if (v >= 0xFFFFFFFA) break;
      difat.push(v);
    }
    ds = buf.readUInt32LE(off + perSector * 4);
  }

  /* FAT */
  const fat = [];
  for (const s of difat) {
    const off = sectorOff(s);
    if (off + sectorSize > buf.length) continue;
    for (let i = 0; i < sectorSize / 4; i++) fat.push(buf.readUInt32LE(off + i * 4));
  }

  const readChain = (start) => {
    const parts = []; let s = start, g = 0;
    const seen = new Set();
    while (s < 0xFFFFFFFA && g++ < 2000000) {
      if (seen.has(s)) break; seen.add(s);
      const off = sectorOff(s);
      if (off + sectorSize > buf.length) break;
      parts.push(buf.subarray(off, off + sectorSize));
      s = fat[s];
      if (s === undefined) break;
    }
    return Buffer.concat(parts);
  };

  /* 目录 */
  const dir = readChain(firstDir);
  const entries = [];
  for (let i = 0; i + 128 <= dir.length; i += 128) {
    const nameLen = dir.readUInt16LE(i + 64);
    const objType = dir[i + 66];
    if (objType === 0 || nameLen < 2 || nameLen > 64) { entries.push(null); continue; }
    entries.push({
      name: dir.toString('utf16le', i, i + nameLen - 2),
      objType,
      startSector: dir.readUInt32LE(i + 116),
      size: dir.readUInt32LE(i + 120) + dir.readUInt32LE(i + 124) * 4294967296,
    });
  }
  const real = entries.filter(Boolean);

  /* 迷你流（root entry 的流承载 <4096B 的小流） */
  const miniFatBuf = numMiniFat && firstMiniFat < 0xFFFFFFFA ? readChain(firstMiniFat) : Buffer.alloc(0);
  const miniFat = [];
  for (let i = 0; i + 4 <= miniFatBuf.length; i += 4) miniFat.push(miniFatBuf.readUInt32LE(i));
  const root = real.find((e) => e.objType === 5);
  const miniStream = root ? readChain(root.startSector) : Buffer.alloc(0);

  const readMiniChain = (start, size) => {
    const parts = []; let s = start, g = 0;
    const seen = new Set();
    while (s < 0xFFFFFFFA && g++ < 2000000) {
      if (seen.has(s)) break; seen.add(s);
      const off = s * miniSize;
      if (off + miniSize > miniStream.length) break;
      parts.push(miniStream.subarray(off, off + miniSize));
      s = miniFat[s];
      if (s === undefined) break;
    }
    return Buffer.concat(parts).subarray(0, size);
  };

  const stream = (name) => {
    const e = real.find((x) => x.name === name);
    if (!e) return null;
    if (e.size < miniCutoff) return readMiniChain(e.startSector, e.size);
    return readChain(e.startSector).subarray(0, e.size);
  };

  return { entries: real, stream };
}

/* ── 二、FIB + piece table ─────────────────────────────── */
function parsePieceTable(wd, tbl) {
  if (wd.readUInt16LE(0) !== 0xA5EC) throw new Error('WordDocument 流 magic 不对');
  const nFib = wd.readUInt16LE(2);
  if (nFib < 101) throw new Error('Word 95 及更早版本暂不支持（nFib=' + nFib + '）');
  const flags = wd.readUInt16LE(10);
  const fcMin = wd.readUInt32LE(24);
  /* Word 97 起 FibRgFcLcb97 从 154 开始，fcClx 是其中第 33 对 → 154+33*8=418 */
  const fcClx = wd.readUInt32LE(418), lcbClx = wd.readUInt32LE(422);
  if (!lcbClx || fcClx + lcbClx > tbl.length) throw new Error('Clx 越界');

  let p = fcClx;
  const end = fcClx + lcbClx;
  let guard = 0;
  while (p < end && tbl[p] === 0x01 && guard++ < 100000) {         /* 跳过 Prc */
    const cb = tbl.readInt16LE(p + 1);
    p += 3 + cb;
  }
  if (tbl[p] !== 0x02) throw new Error('Clx 里没有 Pcdt');
  const lcb = tbl.readUInt32LE(p + 1);
  const plc = tbl.subarray(p + 5, p + 5 + lcb);
  const n = Math.floor((lcb - 4) / 12);
  if (n <= 0) throw new Error('piece 数为 0');

  const cps = new Array(n + 1);
  for (let i = 0; i <= n; i++) cps[i] = plc.readUInt32LE(i * 4);
  const base = (n + 1) * 4;
  const pieces = [];
  for (let i = 0; i < n; i++) {
    const off = base + i * 8;
    const fcRaw = plc.readUInt32LE(off + 2);
    const compressed = (fcRaw & 0x40000000) !== 0;
    pieces.push({
      cpStart: cps[i], cpEnd: cps[i + 1],
      fcRaw,                                              /* 原始 fc：格式层做 CP→FC 映射要用它 */
      fc: compressed ? ((fcRaw & 0x3FFFFFFF) >>> 1) : (fcRaw & 0x3FFFFFFF),
      compressed,
    });
  }
  return { nFib, fWhichTblStm: (flags & 0x0200) !== 0, fcMin, pieces };
}

/* ── 三、逐片解码成纯文本 ──────────────────────────────── */
function decodePieces(wd, pieces) {
  const out = [];
  for (const pc of pieces) {
    const count = pc.cpEnd - pc.cpStart;
    if (count <= 0) continue;
    if (pc.compressed) {
      const bytes = wd.subarray(pc.fc, pc.fc + count);
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += cp1252Char(bytes[i]);
      out.push(s);
    } else {
      out.push(wd.toString('utf16le', pc.fc, pc.fc + count * 2));
    }
  }
  return out.join('');
}

/* ── 四、Word 控制字符 → 可读文本 / 分段 ───────────────── */
/* Word 用 0x0D 分段、0x07 结束单元格、0x13/0x14/0x15 包住域、0x01 是图片占位。
   域里真正要保留的是「分隔符之后、结束符之前」的结果文本。 */
function normalizeWordText(raw) {
  let s = '';
  let inField = false;      /* 在域起始与分隔符之间（域指令，丢弃） */
  let inResult = false;     /* 分隔符之后（域结果，保留） */
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 0x13) { inField = true; inResult = false; continue; }
    if (c === 0x14) { inField = false; inResult = true; continue; }
    if (c === 0x15) { inField = false; inResult = false; continue; }
    if (inField) continue;
    switch (c) {
      case 0x0D: s += '\n'; break;            /* 段落结束 */
      case 0x07: s += '\t'; break;            /* 单元格/行结束 */
      case 0x0B: s += '\n'; break;            /* 手动换行 */
      case 0x0C: s += '\n\n'; break;          /* 分页 */
      case 0x0A: s += '\n'; break;
      case 0x01: case 0x02: case 0x03: case 0x04: case 0x05:
      case 0x08: case 0x1E: case 0x1F: break; /* 图片/脚注/对象等占位，丢弃 */
      case 0x09: s += '\t'; break;
      default:
        if (c < 0x20 && c !== 0x09) break;
        s += raw[i];
    }
  }
  return s;
}

/* ── 对外入口 ─────────────────────────────────────────── */
function extractDocText(buf, opt) {
  const o = opt || {};
  const cfb = parseCFB(buf);
  const wd = cfb.stream('WordDocument');
  if (!wd) throw new Error('缺少 WordDocument 流（不是 Word 文档？）');
  /* 表流由 FIB 的 fWhichTblStm 决定，个别文件该位不可信，两个都试 */
  const tbl = cfb.stream(o.tblStm || (wd.readUInt16LE(10) & 0x0200 ? '1Table' : '0Table'))
    || cfb.stream('0Table') || cfb.stream('1Table');
  if (!tbl) throw new Error('缺少 0Table/1Table 流');
  const pt = parsePieceTable(wd, tbl);
  const raw = decodePieces(wd, pt.pieces);
  const text = normalizeWordText(raw);
  return {
    text,
    chars: text.length,
    nFib: pt.nFib,
    pieces: pt.pieces.length,
    streams: cfb.entries.map((e) => e.name + '(' + e.size + ')'),
  };
}

module.exports = { extractDocText, parseCFB };

/* ============================================================
   第二层：格式。CHPX（字符：粗体/斜体/字号）+ PAPX（段落：样式/对齐）
   FIB 里 fcPlcfBteChpx 在第 13 对 → 154+12*8=250；Papx → 258；
   fcStshf 在第 2 对 → 162。
============================================================ */

/* FKP（Formatted disk page）页：512 字节，含 crun 个 run
   rgfc[0..crun]（FC 边界）、rgb[crun]（指向 grpprl 的偏移/2）、末字节 crun */
function readFkp(wd, pn, kind) {
  const base = pn * 512;
  if (pn < 0 || base + 512 > wd.length) return [];
  const crun = wd[base + 511];
  if (!crun) return [];
  const rgbaOff = base + (crun + 1) * 4;
  const runs = [];
  for (let i = 0; i < crun; i++) {
    const fcStart = wd.readUInt32LE(base + i * 4);
    const fcEnd = wd.readUInt32LE(base + (i + 1) * 4);
    const off = wd[rgbaOff + i];
    let grpprl = null;
    if (off !== 0) {
      const p = base + off * 2;
      if (p + 2 < wd.length) {
        const cb = wd[p];
        /* CHPX：cb 含自身，grpprl 长 cb-1；PAPX：cb 以「字」计，grpprl 长 cb*2-1 */
        const len = kind === 'chpx' ? cb - 1 : cb * 2 - 1;
        if (len > 0) grpprl = wd.subarray(p + 1, Math.min(p + 1 + len, wd.length));
      }
    }
    runs.push({ fcStart, fcEnd, grpprl });
  }
  return runs;
}

function parsePlcfBte(wd, tbl, fcIdx) {
  const fc = wd.readUInt32LE(fcIdx), lcb = wd.readUInt32LE(fcIdx + 4);
  if (!lcb || fc + lcb > tbl.length) return [];
  const n = Math.floor((lcb - 4) / 8);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      fcStart: tbl.readUInt32LE(fc + i * 4),
      pn: tbl.readUInt32LE(fc + (n + 1) * 4 + i * 4),
    });
  }
  return out;
}

/* 遍历 grpprl。spra 决定操作数长度；6/7 是变长（前置 1/2 字节长度） */
const SPRM_SIZE = [1, 1, 2, 4, 4, 2, 1, 3];
function walkSprms(grpprl, cb) {
  let p = 0;
  const out = [];
  let guard = 0;
  while (p + 2 <= grpprl.length && guard++ < 2000) {
    const sprm = grpprl.readUInt16LE(p);
    const spra = (sprm >> 13) & 7;
    const opStart = p + 2;
    let size;
    if (spra === 6) { if (opStart >= grpprl.length) break; size = grpprl[opStart] + 1; }
    else if (spra === 7) { if (opStart + 2 > grpprl.length) break; size = grpprl.readUInt16LE(opStart) + 2; }
    else size = SPRM_SIZE[spra];
    if (opStart + size > grpprl.length) break;
    out.push({ sprm, opStart, size });
    p = opStart + size;
  }
  return out;
}
/* 常用属性值：0/1 = 关/开，128 = 继承，129 = 取反 */
const onOff = (v) => v === 1 || v === 129;

const SPRM_CF_BOLD = 0x0835, SPRM_CF_ITALIC = 0x0836, SPRM_CF_STRIKE = 0x0837,
  SPRM_CF_DSTRIKE = 0x0838, SPRM_C_HPS = 0x4A43, SPRM_P_ISTD = 0x4600,
  SPRM_P_JC = 0x2403, SPRM_P_DXALEFT = 0x840F, SPRM_P_ILVL = 0x260A,
  /* 表格：fInTable=段落在表格内；fTtp=表格终止段（一行的收尾） */
  SPRM_P_FINTABLE = 0x2416, SPRM_P_FTTP = 0x2417;

/* 样式表 STSH：取每个 istd 的 sti（内置样式号，1..9 即 Heading 1..9） */
function parseStsh(tbl, fc, lcb) {
  const map = {};
  if (!lcb || fc + lcb > tbl.length) return map;
  const cstd = tbl.readUInt16LE(fc);
  let p = fc + 18;                       /* STSHI 固定 18 字节 */
  let guard = 0;
  while (p + 4 < fc + lcb && guard++ < 5000) {
    const cbStd = tbl.readUInt16LE(p);
    if (cbStd <= 0) break;
    const start = p + 2;
    if (start + 2 > tbl.length) break;
    map[guard] = tbl.readUInt16LE(start) & 0x0FFF;   /* sti */
    p = start + cbStd;
  }
  return map;
}

function propFor(runs, fc, dflt) {
  /* runs 按 fcStart 升序；二分找覆盖 fc 的那段 */
  let lo = 0, hi = runs.length - 1, hit = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fc < runs[mid].fcStart) hi = mid - 1;
    else if (fc >= runs[mid].fcEnd) lo = mid + 1;
    else { hit = runs[mid]; break; }
  }
  return hit ? hit.props : dflt;
}

/* 把 FKP run 列表编译成带属性的区间 */
function compileRuns(fkpRuns, kind, stsh) {
  const out = [];
  for (const r of fkpRuns) {
    const props = kind === 'chpx'
      ? { bold: false, italic: false, strike: false, size: 0 }
      : { istd: 0, jc: 0, indent: 0, ilvl: -1, inTable: false, ttp: false };
    if (r.grpprl) {
      /* PAPX 的 grpprl **前两字节是 istd**（段落样式号），不是 sprm。
         把它当 sprm 走会让整个 sprm 流错位——表现是读到 0x5400/0x9407 之类
         不存在的 sprm，而真正的 sprmPFInTable(0x2416) 永远不出现。
         CHPX 没有这个前缀，所以两边的起点不同。 */
      const body = (kind === 'papx' && r.grpprl.length >= 2) ? r.grpprl.subarray(2) : r.grpprl;
      if (kind === 'papx' && r.grpprl.length >= 2) props.istd = r.grpprl.readUInt16LE(0);
      for (const s of walkSprms(body)) {
        const g = body;
        if (kind === 'chpx') {
          if (s.sprm === SPRM_CF_BOLD) props.bold = onOff(g[op(s)]);
          else if (s.sprm === SPRM_CF_ITALIC) props.italic = onOff(g[op(s)]);
          else if (s.sprm === SPRM_CF_STRIKE || s.sprm === SPRM_CF_DSTRIKE) props.strike = onOff(g[op(s)]);
          else if (s.sprm === SPRM_C_HPS && s.size >= 2) props.size = g.readUInt16LE(op(s)) / 2;
        } else {
          if (s.sprm === SPRM_P_ISTD && s.size >= 2) props.istd = g.readUInt16LE(op(s));
          else if (s.sprm === SPRM_P_JC) props.jc = g[op(s)];
          else if (s.sprm === SPRM_P_DXALEFT && s.size >= 2) props.indent = g.readUInt16LE(op(s));
          else if (s.sprm === SPRM_P_ILVL) props.ilvl = g[op(s)];
          else if (s.sprm === SPRM_P_FINTABLE) props.inTable = onOff(g[op(s)]);
          else if (s.sprm === SPRM_P_FTTP) props.ttp = onOff(g[op(s)]);
        }
      }
    }
    out.push({ fcStart: r.fcStart, fcEnd: r.fcEnd, props });
  }
  return out;
  function op(s) { return s.opStart; }
}

/* 第三层：把「文本 + 格式」拼成块（标题/段落/列表） */
function extractDocRich(buf) {
  const cfb = parseCFB(buf);
  const wd = cfb.stream('WordDocument');
  if (!wd) throw new Error('缺少 WordDocument 流');
  const flags = wd.readUInt16LE(10);
  const tbl = cfb.stream((flags & 0x0200) ? '1Table' : '0Table') || cfb.stream('0Table') || cfb.stream('1Table');
  if (!tbl) throw new Error('缺少表流');
  const pt = parsePieceTable(wd, tbl);
  const raw = decodePieces(wd, pt.pieces);

  /* 格式区间 */
  const chpxRuns = [];
  for (const e of parsePlcfBte(wd, tbl, 250)) {
    chpxRuns.push(...compileRuns(readFkp(wd, e.pn, 'chpx'), 'chpx'));
  }
  const papxRuns = [];
  for (const e of parsePlcfBte(wd, tbl, 258)) {
    papxRuns.push(...compileRuns(readFkp(wd, e.pn, 'papx'), 'papx'));
  }
  chpxRuns.sort((a, b) => a.fcStart - b.fcStart);
  papxRuns.sort((a, b) => a.fcStart - b.fcStart);

  const stsh = parseStsh(tbl, wd.readUInt32LE(162), wd.readUInt32LE(166));

  /* CP → FC。压缩片：PCD 的 fc 是「字节偏移×2」；FKP 的 rgfc 用字节偏移空间。 */
  const cpToFc = (cp) => {
    for (const pc of pt.pieces) {
      if (cp >= pc.cpStart && cp < pc.cpEnd) {
        const i = cp - pc.cpStart;
        return pc.compressed ? (pc.fcRaw / 2) + i : pc.fcRaw + i * 2;
      }
    }
    return -1;
  };

  const DEFAULT_CH = { bold: false, italic: false, strike: false, size: 0 };
  const DEFAULT_PA = { istd: 0, jc: 0, indent: 0, ilvl: -1, inTable: false, ttp: false };

  const blocks = [];
  let cur = null;
  let bodySize = 0, sizeHist = {};
  const flush = () => {
    if (!cur) return;
    const text = cur.chars.join('').replace(/[\t \x07]+$/, '');
    if (text.trim() || cur.runs.length) blocks.push({ ...cur, text });
    cur = null;
  };
  const newBlock = (pa) => { cur = { chars: [], runs: [], istd: pa.istd, jc: pa.jc, indent: pa.indent, ilvl: pa.ilvl, inTable: !!pa.inTable, ttp: !!pa.ttp }; };

  for (let i = 0; i < raw.length; i++) {
    const cp = i;
    const fc = cpToFc(cp);
    const cc = raw.charCodeAt(i);
    /* 段落边界。
       表格里单元格的形态是「内容 ⏎ ␇」（段落标记 + 单元格标记），行尾是「␇ ⏎」。
       所以紧跟 0x07 之前的那个 0x0D 属于单元格终结符，不能当段落断开，
       否则一行的多个单元格会被拆到多个块里、列数全乱。 */
    if (cc === 0x0D && raw.charCodeAt(i + 1) === 0x07) { continue; }
    if (cc === 0x0D || cc === 0x0C || cc === 0x0B) {
      if (cur) { flush(); }
    }
    if (!cur) newBlock(fc >= 0 ? propFor(papxRuns, fc, DEFAULT_PA) : DEFAULT_PA);
    if (cc === 0x13) { cur.field = true; continue; }
    if (cc === 0x14) { cur.field = false; cur.inResult = true; continue; }
    if (cc === 0x15) { cur.field = false; cur.inResult = false; continue; }
    if (cur.field) continue;
    if (cc === 0x0D || cc === 0x0C || cc === 0x0B) continue;   /* 已被分段消费 */
    if (cc === 0x07) { cur.chars.push('\x07'); continue; }   /* 单元格/行结束标记：单独保留，用于还原表格结构 */
    if (cc === 0x09) { cur.chars.push('\t'); continue; }     /* 真正的制表符 */
    if (cc < 0x20 && cc !== 0x09) continue;

    const ch = propFor(chpxRuns, fc, DEFAULT_CH);
    if (ch.size) { sizeHist[ch.size] = (sizeHist[ch.size] || 0) + 1; }
    const last = cur.runs[cur.runs.length - 1];
    if (last && last.bold === ch.bold && last.italic === ch.italic && last.size === ch.size) last.text += raw[i];
    else cur.runs.push({ text: raw[i], bold: ch.bold, italic: ch.italic, size: ch.size });
    cur.chars.push(raw[i]);
  }
  flush();

  /* 正文字号 = 出现最多的字号 */
  let best = 0;
  for (const [k, v] of Object.entries(sizeHist)) if (v > (sizeHist[best] || 0)) best = +k;
  bodySize = best || 0;

  /* 每块的主导格式（字符数最多的 run） */
  for (const b of blocks) {
    let dom = null, max = -1;
    for (const r of b.runs) if (r.text.length > max) { max = r.text.length; dom = r; }
    b.dom = dom || { bold: false, italic: false, size: 0 };
    const total = b.runs.reduce((a, r) => a + r.text.length, 0) || 1;
    b.boldRatio = b.runs.reduce((a, r) => a + (r.bold ? r.text.length : 0), 0) / total;
    /* 表格判定：Word 文本流里 0x07 是单元格/行结束标记。
       含该标记的段落即一行表格；按它切分就是单元格。
       不依赖 PAPX 的表格 sprm（那些在部分文档里缺失或难解）。 */
    if (b.text.indexOf('\x07') >= 0) {
      b.cells = b.text.split('\x07').map((c) => c.replace(/\s+$/, ''));
      while (b.cells.length && !b.cells[b.cells.length - 1].trim()) b.cells.pop();
      b.isTableRow = b.cells.length >= 1;
    }
    b.sti = stsh[b.istd] !== undefined ? stsh[b.istd] : -1;
    b.heading = (b.sti >= 1 && b.sti <= 9) ? b.sti : 0;
    if (!b.heading) {
      const sz = b.dom.size || bodySize;
      const ratio = bodySize ? sz / bodySize : 1;
      if (ratio >= 1.9) b.heading = 1;
      else if (ratio >= 1.5) b.heading = 2;
      else if (ratio >= 1.25) b.heading = 3;
      else if (b.boldRatio > 0.85 && b.text.trim().length > 0 && b.text.trim().length <= 40) b.heading = 4;
    }
  }

  return {
    blocks, bodySize, nFib: pt.nFib, pieces: pt.pieces.length,
    chpxRuns: chpxRuns.length, papxRuns: papxRuns.length, styles: Object.keys(stsh).length,
    chars: raw.length,
  };
}

module.exports.extractDocRich = extractDocRich;

/* 调试用：统计 PAPX / CHPX 里出现的 sprm */
function debugSprms(buf){
  const cfb = parseCFB(buf);
  const wd = cfb.stream('WordDocument');
  const tbl = cfb.stream((wd.readUInt16LE(10) & 0x0200) ? '1Table' : '0Table') || cfb.stream('0Table') || cfb.stream('1Table');
  const out = {};
  for (const [k, idx] of [['papx', 258], ['chpx', 250]]) {
    const hist = {}; let runs = 0, withGrp = 0;
    for (const e of parsePlcfBte(wd, tbl, idx)) for (const r of readFkp(wd, e.pn, k === 'papx' ? 'papx' : 'chpx')) {
      runs++;
      if (!r.grpprl) continue;
      withGrp++;
      for (const s of walkSprms(r.grpprl)) { const key = s.sprm.toString(16); hist[key] = (hist[key] || 0) + 1; }
    }
    out[k] = { runs, withGrp, top: Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 14) };
  }
  return out;
}
module.exports.debugSprms = debugSprms;
