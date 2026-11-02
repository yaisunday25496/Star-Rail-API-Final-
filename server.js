// =====================================================================
// 801201 Week 8 — Stack + External REST API
// Express เป็นตัวกลาง (proxy) ระหว่าง browser กับ Honkai: Star Rail API
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

let relicCatalogPromise;

function getRelicCatalog() {
  if (!relicCatalogPromise) {
    relicCatalogPromise = Promise.resolve().then(() => {
      const { StarRail } = require('starrail.js');
      const client = new StarRail();
      return client.getAllRelics().map(relic => ({
        id: relic.id,
        name: relic.name.getNullable(),
        description: relic.description.getNullable(),
        type: relic.type.id,
        stars: relic.stars,
        maxLevel: relic.maxLevel,
        icon: relic.icon.url,
        figureIcon: relic.figureIcon.url,
        set: {
          id: relic.set.id,
          name: relic.set.name.getNullable(),
          bonuses: relic.set.setBonus.map(bonus => ({
            needCount: bonus.needCount,
            description: bonus.description.getNullable(),
          })),
        },
      }));
    });
  }
  return relicCatalogPromise;
}

app.get('/relics', async (req, res) => {
  try {
    const data = await getRelicCatalog();
    res.json({ count: data.length, data });
  } catch (error) {
    relicCatalogPromise = null;
    console.error('ไม่สามารถโหลดข้อมูล Relic ได้:', error);
    res.status(503).json({ error: 'ไม่สามารถโหลดข้อมูล Relic ได้ในขณะนี้' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', characters: characters.length });
});

// ---------------------------------------------------------------------
// TODO 1 — ดึงข้อมูลจาก Honkai: Star Rail API แล้ว cache ไว้
// ---------------------------------------------------------------------
const API_URL = 'https://honkai-starrail-api.vercel.app/api/v1/characters';
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
      image: c.icon || c.image || '',
    }));
    console.log(`✅ โหลดจาก Honkai: Star Rail API สำเร็จ: ${characters.length} ตัวละคร`);
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
  constructor() {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  enqueue(item) {
    const node = { item, previous: this.tail, next: null };
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this.length++;
  }

  enqueueFront(item) {
    const node = { item, previous: null, next: this.head };
    if (this.head) this.head.previous = node;
    else this.tail = node;
    this.head = node;
    this.length++;
  }

  dequeue() {
    if (!this.head) return undefined;
    const item = this.head.item;
    this.head = this.head.next;
    if (this.head) this.head.previous = null;
    else this.tail = null;
    this.length--;
    return item;
  }

  removeLast() {
    if (!this.tail) return undefined;
    const item = this.tail.item;
    this.tail = this.tail.previous;
    if (this.tail) this.tail.next = null;
    else this.head = null;
    this.length--;
    return item;
  }

  peek() { return this.head ? this.head.item : undefined; }
  size() { return this.length; }

  toArray() {
    const items = [];
    for (let node = this.head; node; node = node.next) items.push(node.item);
    return items;
  }
}

const watchlist = new Queue();

app.get('/watchlist', (req, res) => {
  res.json({ items: watchlist.toArray(), size: watchlist.size(), next: watchlist.peek() || null });
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
const selectedTeam = Array(4).fill(null);
const RELIC_SLOT_TYPES = ['HEAD', 'HAND', 'BODY', 'FOOT', 'OBJECT', 'NECK'];
const RELICS_PER_CHARACTER = RELIC_SLOT_TYPES.length;
const teamRelics = Array.from({ length: 4 }, () => Array(RELICS_PER_CHARACTER).fill(null));

app.get('/team', (req, res) => {
  res.json({
    team: selectedTeam,
    relics: teamRelics,
    size: selectedTeam.filter(Boolean).length,
  });
});

app.put('/team', async (req, res) => {
  const ids = req.body && req.body.ids;
  if (!Array.isArray(ids) || ids.length !== 4) {
    return res.status(400).json({ error: 'ทีมต้องมีช่องตัวละคร 4 ช่อง' });
  }

  const selectedIds = ids.filter(id => id !== null).map(String);
  if (new Set(selectedIds).size !== selectedIds.length) {
    return res.status(400).json({ error: 'เลือกตัวละครซ้ำในทีมไม่ได้' });
  }

  const nextTeam = ids.map(id => {
    if (id === null) return null;
    return characters.find(character => String(character.id) === String(id));
  });
  if (nextTeam.some((character, index) => ids[index] !== null && !character)) {
    return res.status(404).json({ error: 'ไม่พบตัวละคร id นี้' });
  }

  let nextRelics = teamRelics.map((row, index) =>
    String(nextTeam[index]?.id ?? '') === String(selectedTeam[index]?.id ?? '')
      ? [...row]
      : Array(RELICS_PER_CHARACTER).fill(null)
  );
  if (req.body.relics !== undefined) {
    if (!Array.isArray(req.body.relics) || req.body.relics.length !== 4 ||
        req.body.relics.some(row => !Array.isArray(row) ||
          (row.length !== 4 && row.length !== RELICS_PER_CHARACTER))) {
      return res.status(400).json({ error: 'ตัวละครแต่ละช่องต้องมีช่อง Relic 6 ช่อง' });
    }

    try {
      const catalog = await getRelicCatalog();
      const relicById = new Map(catalog.map(relic => [String(relic.id), relic]));
      const relicIds = req.body.relics.map(row =>
        [...row, ...Array(RELICS_PER_CHARACTER - row.length).fill(null)]
      );
      nextRelics = relicIds.map((row, teamIndex) =>
        row.map((id, relicIndex) => {
        if (id === null) return null;
        if (!nextTeam[teamIndex]) return undefined;
        const relic = relicById.get(String(id));
        if (relic && relic.type !== RELIC_SLOT_TYPES[relicIndex]) return undefined;
        return relic;
      }));
      if (nextRelics.some((row, teamIndex) =>
        row.some((relic, relicIndex) =>
          relicIds[teamIndex][relicIndex] !== null && !relic
        )
      )) {
        return res.status(400).json({ error: 'Relic ไม่ตรงกับประเภทช่อง หรือช่องตัวละครยังว่าง' });
      }
      const hasDuplicateRelic = nextRelics.some(row => {
        const selectedRelicIds = row.filter(Boolean).map(relic => String(relic.id));
        return new Set(selectedRelicIds).size !== selectedRelicIds.length;
      });
      if (hasDuplicateRelic) {
        return res.status(400).json({ error: 'ตัวละครเดียวกันใส่ Relic ชิ้นเดิมซ้ำไม่ได้' });
      }
    } catch (error) {
      relicCatalogPromise = null;
      console.error('ไม่สามารถตรวจสอบ Relic ที่เลือกได้:', error);
      return res.status(503).json({ error: 'ไม่สามารถโหลดข้อมูล Relic ได้ในขณะนี้' });
    }
  }

  const teamUnchanged = nextTeam.every((character, index) =>
    String(character?.id ?? '') === String(selectedTeam[index]?.id ?? '')
  );
  const relicsUnchanged = nextRelics.every((row, teamIndex) =>
    row.every((relic, relicIndex) =>
      String(relic?.id ?? '') === String(teamRelics[teamIndex][relicIndex]?.id ?? '')
    )
  );
  if (teamUnchanged && relicsUnchanged) {
    return res.json({
      team: selectedTeam,
      relics: teamRelics,
      size: selectedTeam.filter(Boolean).length,
    });
  }

  history.push({
    action: 'TEAM',
    team: [...selectedTeam],
    relics: teamRelics.map(row => [...row]),
    character: { name: 'ทีม' },
    time: new Date().toLocaleTimeString('th-TH'),
  });
  selectedTeam.splice(0, selectedTeam.length, ...nextTeam);
  teamRelics.splice(0, teamRelics.length, ...nextRelics);
  res.json({
    team: selectedTeam,
    relics: teamRelics,
    size: selectedTeam.filter(Boolean).length,
  });
});

app.get('/history', (req, res) => {
  res.json({ history: history.display(), size: history.items.length });
});

app.post('/undo', (req, res) => {
  if (history.isEmpty()) return res.status(400).json({ error: 'ไม่มีอะไรให้ย้อนกลับ' });

  const last = history.pop();

  if (last.action === 'ADD') {
    watchlist.removeLast();
  } else if (last.action === 'SELECT') {
    watchlist.enqueueFront(last.character);
  } else if (last.action === 'TEAM') {
    selectedTeam.splice(0, selectedTeam.length, ...last.team);
    if (last.relics) teamRelics.splice(0, teamRelics.length, ...last.relics);
  }

  const message = last.action === 'TEAM'
    ? 'ย้อนการจัดทีมแล้ว'
    : `ย้อน ${last.action} ของ ${last.character.name} แล้ว`;
  const size = last.action === 'TEAM'
    ? selectedTeam.filter(Boolean).length
    : watchlist.size();
  res.json({ message, size, teamSize: selectedTeam.filter(Boolean).length });
});

// ---------------------------------------------------------------------
charactersReady = loadCharacters();

if (require.main === module) {
  charactersReady.then(() => {
    app.listen(PORT, HOST, () => console.log(`🚀 http://localhost:${PORT}`));
  });
}

module.exports = app;