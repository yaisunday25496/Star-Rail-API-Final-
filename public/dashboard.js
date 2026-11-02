// =====================================================================
// dashboard.js — frontend   [ANSWER KEY]
// =====================================================================

let charactersById = new Map();
let allCharacters = [];

// ---------- TODO 5: โหลดข้อมูลตัวละคร ----------
async function loadDashboard() {
  const algo = document.getElementById('algo').value;
  try {
    const cRes = await fetch(`/characters?sort=${algo}`);
    if (!cRes.ok) throw new Error('เซิร์ฟเวอร์ตอบข้อมูลไม่สำเร็จ');
    const characters = await cRes.json();
    renderCharacters(characters);
    showError('');
  } catch (err) {
    showError('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
  }
}

function showError(msg) {
  const box = document.getElementById('error');
  box.textContent = msg;
  box.style.display = msg ? 'block' : 'none';
}

// ---------- render ----------
function renderCharacters(res) {
  allCharacters = res.data;
  charactersById = new Map(allCharacters.map(character => [String(character.id), character]));
  document.getElementById('sortInfo').textContent =
    `${res.algorithm} · ${res.count} ตัวละคร · ${res.ms} ms`;
  filterCharacters();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function filterCharacters() {
  const query = document.getElementById('search').value.trim().toLowerCase();
  const rarity = document.getElementById('rarityFilter').value;
  const filtered = allCharacters.filter(character => {
    const matchesQuery = character.name.toLowerCase().includes(query);
    const matchesRarity = rarity === 'all' || String(character.rarity) === rarity;
    return matchesQuery && matchesRarity;
  });

  document.getElementById('visibleCount').textContent = filtered.length;
  document.getElementById('totalCount').textContent = allCharacters.length;
  document.getElementById('characters').innerHTML = filtered.length === 0
    ? '<div class="empty-results">ไม่พบตัวละครที่ตรงกับการค้นหา</div>'
    : filtered.map(c => `
    <div class="card" data-character-id="${escapeHtml(c.id)}" role="button" tabindex="0">
      <img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}" loading="lazy">
      <div class="info">
        <strong>${escapeHtml(c.name)}</strong>
        <span class="meta">${escapeHtml(c.path)} · ${escapeHtml(c.element)}</span>
        <span class="eps">${escapeHtml(c.rarity)} ดาว</span>
      </div>
      <button class="queue-button" data-character-id="${escapeHtml(c.id)}">+ คิว</button>
    </div>
  `).join('');

  document.querySelectorAll('.card').forEach(card => {
    const id = card.dataset.characterId;
    card.addEventListener('click', () => showCharacter(id));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showCharacter(id);
      }
    });
  });
  document.querySelectorAll('.queue-button').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      addToWatchlist(button.dataset.characterId);
    });
  });
}

function showCharacter(id) {
  const character = charactersById.get(String(id));
  if (!character) return;

  document.getElementById('modalImage').src = character.image;
  document.getElementById('modalImage').alt = character.name;
  document.getElementById('modalName').textContent = character.name;
  document.getElementById('modalRarity').textContent = `${character.rarity} ดาว`;
  document.getElementById('modalPath').textContent = character.path;
  document.getElementById('modalElement').textContent = character.element;
  document.getElementById('characterModal').classList.add('open');
  document.getElementById('modalClose').focus();
}

function closeCharacterModal() {
  document.getElementById('characterModal').classList.remove('open');
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeCharacterModal();
});

document.getElementById('search').addEventListener('input', filterCharacters);
document.getElementById('rarityFilter').addEventListener('change', filterCharacters);

// ---------- actions ----------
async function addToWatchlist(id) {
  try {
    const res = await fetch('/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const { message } = await res.json();
    const notice = document.getElementById('notice');
    notice.innerHTML = `${escapeHtml(message)} · <a href="/teams.html">ดูทีมใน Teams</a>`;
    notice.style.display = 'block';
    showError('');
  } catch (err) {
    showError(err.message);
  }
}

window.addEventListener('load', loadDashboard);
window.addEventListener('load', () => {
  if (!window.location.hash) {
    window.history.replaceState(null, '', '#character-section');
    document.getElementById('character-section').scrollIntoView();
  }
});
