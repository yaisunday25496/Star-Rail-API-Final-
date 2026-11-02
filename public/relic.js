const typeNames = {
  HEAD: 'Head',
  HAND: 'Hands',
  BODY: 'Body',
  FOOT: 'Feet',
  NECK: 'Planar Sphere',
  OBJECT: 'Link Rope',
};

const relicContainer = document.getElementById('relics');
const errorElement = document.getElementById('error');
const statusElement = document.getElementById('status');
const countElement = document.getElementById('resultCount');
const searchInput = document.getElementById('search');
const typeFilter = document.getElementById('typeFilter');
const rarityFilter = document.getElementById('rarityFilter');
let relics = [];

function addText(parent, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderRelics() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const selectedType = typeFilter.value;
  const selectedRarity = rarityFilter.value;
  const filtered = relics
    .filter(relic => selectedType === 'all' || relic.type === selectedType)
    .filter(relic => selectedRarity === 'all' || relic.stars === Number(selectedRarity))
    .filter(relic => `${relic.name || ''} ${relic.set.name || ''}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => b.stars - a.stars || (a.name || '').localeCompare(b.name || ''));

  relicContainer.replaceChildren();
  countElement.textContent = `แสดง ${filtered.length} จาก ${relics.length} รายการ`;

  if (filtered.length === 0) {
    addText(relicContainer, 'p', 'empty', 'ไม่พบ Relic ที่ตรงกับการค้นหา');
    statusElement.textContent = relics.length === 0
      ? 'ไม่พบข้อมูล Relic'
      : 'ไม่พบ Relic ที่ตรงกับตัวกรอง';
    statusElement.dataset.state = 'empty';
    return;
  }
  statusElement.textContent = `โหลดสำเร็จ — แสดง ${filtered.length} รายการ`;
  statusElement.dataset.state = 'success';

  for (const relic of filtered) {
    const card = document.createElement('article');
    card.className = 'relic-card';
    const imageUrl = relic.figureIcon || relic.icon;
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = relic.name || 'Relic';
      image.loading = 'lazy';
      card.append(image);
    }

    const content = document.createElement('div');
    content.className = 'relic-content';
    addText(content, 'h2', '', relic.name || 'ไม่ทราบชื่อ');

    const meta = document.createElement('div');
    meta.className = 'relic-meta';
    addText(meta, 'span', 'badge rarity', `${'★'.repeat(relic.stars)} (${relic.stars})`);
    addText(meta, 'span', 'badge', typeNames[relic.type] || relic.type);
    addText(meta, 'span', 'badge', `สูงสุด Lv.${relic.maxLevel}`);
    content.append(meta);

    addText(content, 'p', '', `เซ็ต: ${relic.set.name || 'ไม่ทราบชื่อ'}`);
    if (relic.description) addText(content, 'p', '', relic.description);

    if (relic.set.bonuses.length > 0) {
      const details = document.createElement('details');
      addText(details, 'summary', '', 'โบนัสเซ็ต');
      const list = document.createElement('ul');
      for (const bonus of relic.set.bonuses) {
        addText(list, 'li', '', `${bonus.needCount} ชิ้น: ${bonus.description}`);
      }
      details.append(list);
      content.append(details);
    }

    card.append(content);
    relicContainer.append(card);
  }
}

async function loadRelics() {
  statusElement.textContent = 'กำลังโหลดข้อมูล Relic...';
  statusElement.dataset.state = 'loading';
  relics = [];
  relicContainer.replaceChildren();
  countElement.textContent = '';
  errorElement.textContent = '';
  errorElement.style.display = 'none';
  document.getElementById('retryLoad').hidden = true;
  try {
    const response = await fetch('/relics');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `โหลด Relic ไม่สำเร็จ (${response.status})`);
    if (!Array.isArray(result.data)) throw new Error('ข้อมูล Relic จากเซิร์ฟเวอร์ไม่ถูกต้อง');

    relics = result.data;
    renderRelics();
  } catch (error) {
    relicContainer.replaceChildren();
    countElement.textContent = '';
    addText(relicContainer, 'p', 'empty', 'โหลดรายการ Relic ไม่สำเร็จ');
    statusElement.textContent = 'โหลดข้อมูล Relic ไม่สำเร็จ';
    statusElement.dataset.state = 'error';
    errorElement.textContent = error.message || 'เกิดข้อผิดพลาดในการโหลด Relic';
    errorElement.style.display = 'block';
    document.getElementById('retryLoad').hidden = false;
  }
}

searchInput.addEventListener('input', renderRelics);
typeFilter.addEventListener('change', renderRelics);
rarityFilter.addEventListener('change', renderRelics);
document.getElementById('retryLoad').addEventListener('click', loadRelics);
loadRelics();
