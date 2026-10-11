// =====================================================================
// 801201 Week 8 — Stack + External REST API
// Express เป็นตัวกลาง (proxy) ระหว่าง browser กับ HSR-API
// =====================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = Number(process.env.PORT) || 5104;
const HOST = process.env.HOST || '0.0.0.0';
const fallbackPath = path.join(__dirname, 'characters.json');
let charactersReady = Promise.resolve();

app.use(express.json());
app.use((req, res, next) => {
  charactersReady.then(() => next(), next);
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', characters: characters.length });
});

// ---------------------------------------------------------------------
// TODO 1 — ดึงข้อมูลจาก HSR-API แล้ว cache ไว้
// ---------------------------------------------------------------------
const API_URL = 'https://hsr-api.vercel.app/api/v1/characters';
let characters = [];              // <-- cache อยู่ใน memory

async function loadCharacters() {
  try {
    const res = await fetch(API_URL);                 // Node 18+ มี fetch ให้ใช้เลย
    if (!res.ok) throw new Error('API ตอบ status ' + res.status);

    const data = await res.json();
    characters = data.map(c => ({
      id: c.id || c.name.toLowerCase().replace(/\s+/g, '-'),
      name: c.name,
      rarity: Number(c.rarity) || 4,  // ระดับดาว (5 ดาว หรือ 4 ดาว)
      path: c.path || 'Unknown',      // สาย เช่น Destruction, Hunt, Harmony
      element: c.element || 'Unknown',// ธาตุ เช่น Fire, Ice, Quantum
      image: c.img || c.icon || c.image || '',
    }));
    console.log(`✅ โหลดจาก HSR-API สำเร็จ: ${characters.length} ตัวละคร`);
  } catch (err) {
    // ถ้าเน็ตล่ม ให้ใช้ไฟล์สำรอง
    if (fs.existsSync(fallbackPath)) {
      characters = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      console.log(`⚠️  ใช้ไฟล์สำรอง characters.json แทน (${err.message})`);
    } else {
      console.error(`❌ เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------
// TODO 2 — Sort เรียงตามความหายาก (Rarity / ดาว) มาก → น้อย
// ---------------------------------------------------------------------
function selectionSort(arr) {
  const a = [...arr];
  for (let i = 0; i < a.length - 1; i++) {
    let maxIdx = i;
    for (let j = i + 1; j < a.length; j++) {
      if (a[j].rarity > a[maxIdx].rarity) maxIdx = j;
    }
    [a[i], a[maxIdx]] = [a[maxIdx], a[i]];
  }
  return a;
}

function insertionSort(arr) {
  const a = [...arr];
  for (let i = 1; i < a.length; i++) {
    const key = a[i];
    let j = i - 1;
    while (j >= 0 && a[j].rarity < key.rarity) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = key;
  }
  return a;
}

function bubbleSort(arr) {
  const a = [...arr];
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < a.length - 1 - i; j++) {
      if (a[j].rarity < a[j + 1].rarity) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
      }
    }
  }
  return a;
}

app.get('/characters', (req, res) => {
  const algo = req.query.sort || 'selection';
  const t0 = performance.now();

  let sorted;
  if (algo === 'insertion')   sorted = insertionSort(characters);
  else if (algo === 'bubble') sorted = bubbleSort(characters);
  else                        sorted = selectionSort(characters);

  const ms = (performance.now() - t0).toFixed(3);
  res.json({ algorithm: algo, count: sorted.length, ms, data: sorted });
});

// ---------------------------------------------------------------------
// TODO 3 — Queue คิวตัวละครที่จัดลงทีม
// ---------------------------------------------------------------------
class Queue {
  constructor() { this.items = []; }
  enqueue(item) { this.items.push(item); }       // ต่อท้ายคิว
  dequeue()     { return this.items.shift(); }   // ออกจากหัวคิว = FIFO
  peek()        { return this.items[0]; }
  size()        { return this.items.length; }
}

const watchlist = new Queue();

app.get('/watchlist', (req, res) => {
  res.json({ items: watchlist.items, size: watchlist.size(), next: watchlist.peek() || null });
});

app.post('/watchlist', (req, res) => {
  const character = characters.find(c => String(c.id) === String(req.body.id));
  if (!character) return res.status(404).json({ error: 'ไม่พบตัวละคร id นี้' });

  watchlist.enqueue(character);
  history.push({ action: 'ADD', character, time: new Date().toLocaleTimeString('th-TH') });

  res.status(201).json({ message: `เพิ่ม ${character.name} เข้าคิวแล้ว`, size: watchlist.size() });
});

app.delete('/watchlist/process', (req, res) => {
  if (watchlist.size() === 0) return res.status(400).json({ error: 'คิวว่าง' });

  const character = watchlist.dequeue();
  history.push({ action: 'SELECT', character, time: new Date().toLocaleTimeString('th-TH') });

  res.json({ message: `เลือก ${character.name} เข้าสู่การต่อสู้เรียบร้อย`, size: watchlist.size() });
});

// ---------------------------------------------------------------------
// TODO 4 — Stack เก็บประวัติเพื่อทำ undo
// ---------------------------------------------------------------------
class Stack {
  constructor() { this.items = []; }
  push(item)    { this.items.push(item); }                        // วางทับด้านบน
  pop()         { return this.items.pop(); }                       // หยิบจากด้านบน = LIFO
  peek()        { return this.items[this.items.length - 1]; }
  isEmpty()     { return this.items.length === 0; }
  display()     { return [...this.items].reverse(); }              // ล่าสุดอยู่บนสุด
}

const history = new Stack();

app.get('/history', (req, res) => {
  res.json({ history: history.display(), size: history.items.length });
});

app.post('/undo', (req, res) => {
  if (history.isEmpty()) return res.status(400).json({ error: 'ไม่มีอะไรให้ย้อนกลับ' });

  const last = history.pop();

  if (last.action === 'ADD') {
    watchlist.items.pop();               // เอาตัวที่เพิ่งต่อท้ายออก
  } else if (last.action === 'SELECT') {
    watchlist.items.unshift(last.character);   // เอากลับไปไว้หัวคิว
  }

  res.json({ message: `ย้อน ${last.action} ของ ${last.character.name} แล้ว`, size: watchlist.size() });
});

// ---------------------------------------------------------------------
charactersReady = loadCharacters();

if (require.main === module) {
  charactersReady.then(() => {
    app.listen(PORT, HOST, () => console.log(`🚀 http://localhost:${PORT}`));
  });
}

module.exports = app;