const TEAM_SIZE = 4;
const RELIC_SLOT_TYPES = ['HEAD', 'HAND', 'BODY', 'FOOT', 'OBJECT', 'NECK'];
const RELIC_SLOT_NAMES = ['Head', 'Hands', 'Body', 'Feet', 'Link Rope', 'Planar Sphere'];
const RELICS_PER_CHARACTER = RELIC_SLOT_TYPES.length;
let allCharacters = [];
let allRelics = [];
let currentTeam = Array(TEAM_SIZE).fill(null);
let currentRelics = Array.from({ length: TEAM_SIZE }, () => Array(RELICS_PER_CHARACTER).fill(null));
let targetSlot = 0;
let targetRelicSlot = 0;
let dragSource = null;
let lastDragEndedAt = 0;
let isSaving = false;
let isReady = false;
let lastFocusedElement = null;

function showError(message) {
  const box = document.getElementById('error');
  box.textContent = message;
  box.style.display = message ? 'block' : 'none';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'เซิร์ฟเวอร์ตอบข้อมูลไม่สำเร็จ');
  return result;
}

async function loadTeamPage() {
  isReady = false;
  document.getElementById('openPicker').disabled = true;
  document.getElementById('retryLoad').hidden = true;
  document.getElementById('teamStatus').textContent = 'กำลังโหลดข้อมูลทีมและ Relic...';
  document.getElementById('teamStatus').dataset.state = 'loading';
  document.getElementById('teamSlots').innerHTML =
    '<div class="empty-results">กำลังโหลดข้อมูลทีม...</div>';
  document.getElementById('characters').innerHTML =
    '<div class="loading">กำลังโหลดตัวละคร...</div>';
  document.getElementById('relics').innerHTML =
    '<div class="loading">กำลังโหลด Relic...</div>';
  showError('');
  try {
    const [characters, relicCatalog, result] = await Promise.all([
      fetchJson('/characters'),
      fetchJson('/relics'),
      fetchJson('/team'),
    ]);
    allCharacters = characters.data;
    allRelics = relicCatalog.data;
    currentTeam = result.team;
    currentRelics = Array.from({ length: TEAM_SIZE }, (_, teamIndex) =>
      Array.from({ length: RELICS_PER_CHARACTER }, (_, relicIndex) =>
        result.relics?.[teamIndex]?.[relicIndex] || null
      )
    );
    isReady = true;
    document.getElementById('retryLoad').hidden = true;
    renderTeam();
    renderCharacters();
    renderRelics();
    showError('');
  } catch (error) {
    showError('โหลดข้อมูลไม่สำเร็จ: ' + error.message);
    document.getElementById('teamStatus').textContent = 'โหลดข้อมูลทีมไม่สำเร็จ';
    document.getElementById('teamStatus').dataset.state = 'error';
    document.getElementById('teamSlots').innerHTML =
      '<div class="empty-results">ไม่สามารถโหลดข้อมูลทีมได้</div>';
    document.getElementById('characters').innerHTML =
      '<div class="empty-results">ไม่สามารถโหลดข้อมูลตัวละครได้</div>';
    document.getElementById('relics').innerHTML =
      '<div class="empty-results">ไม่สามารถโหลดข้อมูล Relic ได้</div>';
    document.getElementById('retryLoad').hidden = false;
  }
}

function renderTeam() {
  document.getElementById('openPicker').disabled = !isReady || isSaving;
  document.getElementById('teamCount').textContent =
    currentTeam.filter(Boolean).length;
  document.getElementById('openPicker').textContent =
    currentTeam.includes(null) ? 'เลือกตัวละคร' : 'เปลี่ยนตัวละคร';

  document.getElementById('teamSlots').innerHTML = currentTeam.map((character, index) => {
    const slotLabel = `ช่องที่ ${index + 1}`;
    if (!character) {
      return `
        <div class="team-slot" role="button" data-slot-index="${index}" tabindex="0"
          aria-label="${slotLabel} ว่าง กดเพื่อเลือกตัวละคร">
          <span class="slot-index">${index + 1}</span>
          <div class="slot-placeholder">
            <span class="slot-plus" aria-hidden="true">+</span>
            <span>เลือกตัวละคร</span>
          </div>
        </div>
      `;
    }

    const relicSlots = currentRelics[index].map((relic, relicIndex) => relic
      ? `
        <div class="relic-entry">
          <button class="relic-slot filled" type="button" data-slot-index="${index}"
            data-relic-slot-index="${relicIndex}" draggable="true"
            aria-label="${RELIC_SLOT_NAMES[relicIndex]}: ${escapeHtml(relic.name)}">
            ${relic.icon ? `<img src="${escapeHtml(relic.icon)}" alt="" loading="lazy">` : ''}
            <span>${escapeHtml(relic.name)}</span>
          </button>
          <button class="relic-remove" type="button" data-slot-index="${index}"
            data-relic-slot-index="${relicIndex}" aria-label="นำ ${escapeHtml(relic.name)} ออก">×</button>
        </div>
      `
      : `
        <button class="relic-slot" type="button" data-slot-index="${index}"
          data-relic-slot-index="${relicIndex}"
          aria-label="เพิ่ม ${RELIC_SLOT_NAMES[relicIndex]}">
          <span aria-hidden="true">+</span>
          <span>${RELIC_SLOT_NAMES[relicIndex]}</span>
        </button>
      `
    ).join('');

    return `
      <div class="team-member">
        <div class="team-slot filled" role="group" data-slot-index="${index}" tabindex="0" draggable="true"
          aria-label="${slotLabel}: ${escapeHtml(character.name)} กดเพื่อเปลี่ยนหรือจับลากเพื่อสลับตำแหน่ง">
          <div class="character-portrait">
            <img src="${escapeHtml(character.image)}" alt="">
            <div class="slot-shade"></div>
            <span class="slot-index">${index + 1}</span>
            <span class="slot-name">${escapeHtml(character.name)}</span>
            <button class="slot-remove" type="button" data-slot-index="${index}"
              aria-label="นำ ${escapeHtml(character.name)} ออกจากทีม">×</button>
          </div>
        </div>
        <div class="relic-slots" aria-label="Relic ของ ${escapeHtml(character.name)}">${relicSlots}</div>
      </div>
    `;
  }).join('');

  const selectedCount = currentTeam.filter(Boolean).length;
  const teamStatus = document.getElementById('teamStatus');
  teamStatus.textContent = selectedCount === 0
    ? 'ทีมว่าง — เลือกตัวละครเพื่อเริ่มจัดทีม'
    : selectedCount === TEAM_SIZE
      ? 'ทีมครบ 4 ตัวละครแล้ว — ลากตัวละครหรือ Relic เพื่อจัดตำแหน่ง'
      : 'เลือกตัวละครแล้วลาก Relic จากแผงไปยังช่องใต้ตัวละคร';
  teamStatus.dataset.state = selectedCount === 0 ? 'empty' : 'success';
}

function renderCharacters() {
  const query = document.getElementById('search').value.trim().toLowerCase();
  const rarity = document.getElementById('rarityFilter').value;
  const filtered = allCharacters.filter(character => {
    const matchesQuery = character.name.toLowerCase().includes(query);
    const matchesRarity = rarity === 'all' || String(character.rarity) === rarity;
    return matchesQuery && matchesRarity;
  });

  document.getElementById('characters').innerHTML = filtered.length === 0
    ? '<div class="empty-results">ไม่พบตัวละครที่ตรงกับการค้นหา</div>'
    : filtered.map(character => {
      const selectedAt = currentTeam.findIndex(member =>
        member && String(member.id) === String(character.id)
      );
      const selected = selectedAt !== -1;
      const disabled = isSaving || selected;
      const label = selectedAt === targetSlot ? 'เลือกอยู่' : selected ? 'อยู่ในทีมแล้ว' : 'ลากหรือคลิก';
      return `
        <button class="character-card${selected ? ' selected' : ''}" type="button"
          data-character-id="${escapeHtml(character.id)}" draggable="${!disabled}"
          aria-label="${escapeHtml(character.name)}${selected ? ' อยู่ในทีมแล้ว' : ', เลือกตัวละคร'}"
          ${disabled ? 'disabled' : ''}>
          <img src="${escapeHtml(character.image)}" alt="" loading="lazy">
          <span class="character-info">
            <strong>${escapeHtml(character.name)}</strong>
            <span>${escapeHtml(character.path)} · ${escapeHtml(character.element)}</span>
            <span class="rarity">${'★'.repeat(Math.max(0, Number(character.rarity) || 0))} · ${escapeHtml(character.rarity)} ดาว</span>
          </span>
          <span aria-hidden="true">${label}</span>
        </button>
      `;
    }).join('');
}

function renderRelics() {
  const query = document.getElementById('relicSearch').value.trim().toLowerCase();
  const type = RELIC_SLOT_TYPES[targetRelicSlot];
  const rarity = document.getElementById('relicRarityFilter').value;
  const filtered = allRelics.filter(relic => {
    const matchesQuery = `${relic.name || ''} ${relic.set.name || ''}`.toLowerCase().includes(query);
    const matchesType = relic.type === type;
    const matchesRarity = rarity === 'all' || String(relic.stars) === rarity;
    return matchesQuery && matchesType && matchesRarity;
  });

  document.getElementById('relics').innerHTML = filtered.length === 0
    ? '<div class="empty-results">ไม่พบ Relic ที่ตรงกับการค้นหา</div>'
    : filtered.map(relic => {
      const selectedAt = currentRelics[targetSlot].findIndex((item, relicIndex) =>
        item && String(item.id) === String(relic.id) && relicIndex !== targetRelicSlot
      );
      const selected = selectedAt !== -1;
      return `
      <button class="relic-card${selected ? ' selected' : ''}" type="button" data-relic-id="${escapeHtml(relic.id)}"
        draggable="${!selected && !isSaving}" aria-label="${escapeHtml(relic.name)}, ${escapeHtml(relic.set.name)}${selected ? ', ใส่อยู่แล้ว' : ''}"
        ${selected || isSaving ? 'disabled' : ''}>
        ${relic.icon ? `<img src="${escapeHtml(relic.icon)}" alt="" loading="lazy">` : ''}
        <span class="relic-info">
          <strong>${escapeHtml(relic.name)}</strong>
          <span>${escapeHtml(relic.set.name)} · ${escapeHtml(relic.type)}</span>
          <span class="rarity">${'★'.repeat(Math.max(0, Number(relic.stars) || 0))}${selected ? ' · ใส่อยู่แล้ว' : ''}</span>
        </span>
      </button>
    `;
    }).join('');
}

function openPicker(index) {
  if (!isReady || isSaving) return;
  const emptyIndex = currentTeam.findIndex(character => !character);
  targetSlot = Number.isInteger(index) ? index : (emptyIndex === -1 ? 0 : emptyIndex);
  lastFocusedElement = document.activeElement;
  document.getElementById('pickerHint').textContent =
    currentTeam[targetSlot]
      ? `เลือกตัวละครเพื่อแทนที่ช่องที่ ${targetSlot + 1} หรือจับลากไปยังช่องอื่น`
      : `เลือกตัวละครสำหรับช่องที่ ${targetSlot + 1} หรือจับลากไปยังช่องทีม`;
  document.getElementById('characterPicker').hidden = false;
  renderCharacters();
  document.getElementById('search').focus();
}

function openRelicPicker(teamIndex, relicIndex) {
  if (!isReady || isSaving) return;
  targetSlot = teamIndex;
  targetRelicSlot = relicIndex;
  lastFocusedElement = document.activeElement;
  const character = currentTeam[teamIndex];
  document.getElementById('relicPickerHint').textContent =
    `เลือก ${RELIC_SLOT_NAMES[relicIndex]} สำหรับ ${character.name} หรือจับลากไปวาง`;
  document.getElementById('relicPicker').hidden = false;
  renderRelics();
  document.getElementById('relicSearch').focus();
}

function closePicker() {
  document.getElementById('characterPicker').hidden = true;
  if (lastFocusedElement && lastFocusedElement.isConnected) {
    lastFocusedElement.focus();
  } else {
    const slot = document.querySelector(`.team-slot[data-slot-index="${targetSlot}"]`);
    if (slot) slot.focus();
  }
}

function closeRelicPicker() {
  document.getElementById('relicPicker').hidden = true;
  if (lastFocusedElement && lastFocusedElement.isConnected) lastFocusedElement.focus();
}

async function saveTeam(nextTeam, nextRelics, closeAfterSave) {
  if (isSaving) return false;
  isSaving = true;
  document.getElementById('teamStatus').textContent = 'กำลังบันทึกทีม...';
  document.getElementById('teamStatus').dataset.state = 'loading';
  document.getElementById('openPicker').disabled = true;
  renderCharacters();

  try {
    const result = await fetchJson('/team', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: nextTeam.map(character => character ? character.id : null),
        relics: nextRelics.map(row => row.map(relic => relic ? relic.id : null)),
      }),
    });
    currentTeam = result.team;
    currentRelics = result.relics;
    renderTeam();
    renderCharacters();
    showError('');
    document.getElementById('teamStatus').textContent = 'บันทึกทีมสำเร็จ';
    document.getElementById('teamStatus').dataset.state = 'success';
    if (closeAfterSave) closePicker();
    return true;
  } catch (error) {
    showError(error.message);
    renderTeam();
    document.getElementById('teamStatus').textContent = 'บันทึกทีมไม่สำเร็จ';
    document.getElementById('teamStatus').dataset.state = 'error';
    return false;
  } finally {
    isSaving = false;
    document.getElementById('openPicker').disabled = !isReady;
    renderCharacters();
  }
}

async function chooseCharacter(id, index) {
  const character = allCharacters.find(item => String(item.id) === String(id));
  if (!character) {
    showError('ไม่พบตัวละครที่เลือก');
    return;
  }

  const duplicateIndex = currentTeam.findIndex((member, slotIndex) =>
    slotIndex !== index && member && String(member.id) === String(character.id)
  );
  if (duplicateIndex !== -1) {
    showError('เลือกตัวละครซ้ำในทีมไม่ได้');
    return;
  }

  const nextTeam = [...currentTeam];
  nextTeam[index] = character;
  const nextRelics = currentRelics.map(row => [...row]);
  if (String(currentTeam[index]?.id ?? '') !== String(character.id)) {
    nextRelics[index] = Array(RELICS_PER_CHARACTER).fill(null);
  }
  await saveTeam(nextTeam, nextRelics, true);
}

async function removeCharacter(index) {
  const nextTeam = [...currentTeam];
  const nextRelics = currentRelics.map(row => [...row]);
  nextTeam[index] = null;
  nextRelics[index] = Array(RELICS_PER_CHARACTER).fill(null);
  await saveTeam(nextTeam, nextRelics, false);
}

async function moveCharacter(fromIndex, toIndex) {
  if (fromIndex === toIndex || !currentTeam[fromIndex]) return;
  const nextTeam = [...currentTeam];
  const nextRelics = currentRelics.map(row => [...row]);
  [nextTeam[fromIndex], nextTeam[toIndex]] = [nextTeam[toIndex], nextTeam[fromIndex]];
  [nextRelics[fromIndex], nextRelics[toIndex]] = [nextRelics[toIndex], nextRelics[fromIndex]];
  await saveTeam(nextTeam, nextRelics, false);
}

async function chooseRelic(id, teamIndex, relicIndex) {
  const relic = allRelics.find(item => String(item.id) === String(id));
  if (!relic || !currentTeam[teamIndex]) {
    showError('ไม่พบ Relic หรือตัวละครที่เลือก');
    return;
  }
  if (relic.type !== RELIC_SLOT_TYPES[relicIndex]) {
    showError('Relic ไม่ตรงกับประเภทช่องที่เลือก');
    return;
  }
  const alreadyEquipped = currentRelics[teamIndex].some((item, currentRelicIndex) =>
    item && String(item.id) === String(relic.id) && currentRelicIndex !== relicIndex
  );
  if (alreadyEquipped) {
    showError('ตัวละครเดียวกันใส่ Relic ชิ้นเดิมซ้ำไม่ได้');
    renderRelics();
    return;
  }
  const nextRelics = currentRelics.map(row => [...row]);
  nextRelics[teamIndex][relicIndex] = relic;
  if (await saveTeam([...currentTeam], nextRelics, false)) closeRelicPicker();
}

async function removeRelic(teamIndex, relicIndex) {
  const nextRelics = currentRelics.map(row => [...row]);
  nextRelics[teamIndex][relicIndex] = null;
  await saveTeam([...currentTeam], nextRelics, false);
}

async function moveRelic(fromTeamIndex, fromRelicIndex, toTeamIndex, toRelicIndex) {
  if (fromTeamIndex === toTeamIndex && fromRelicIndex === toRelicIndex) return;
  if (fromRelicIndex !== toRelicIndex) {
    showError('ย้าย Relic ได้เฉพาะช่องประเภทเดียวกัน');
    return;
  }
  const nextRelics = currentRelics.map(row => [...row]);
  [nextRelics[fromTeamIndex][fromRelicIndex], nextRelics[toTeamIndex][toRelicIndex]] =
    [nextRelics[toTeamIndex][toRelicIndex], nextRelics[fromTeamIndex][fromRelicIndex]];
  await saveTeam([...currentTeam], nextRelics, false);
}

document.getElementById('openPicker').addEventListener('click', () => openPicker());
document.getElementById('retryLoad').addEventListener('click', loadTeamPage);
document.getElementById('closePicker').addEventListener('click', closePicker);
document.getElementById('search').addEventListener('input', renderCharacters);
document.getElementById('rarityFilter').addEventListener('change', renderCharacters);
document.getElementById('closeRelicPicker').addEventListener('click', closeRelicPicker);
document.getElementById('relicSearch').addEventListener('input', renderRelics);
document.getElementById('relicRarityFilter').addEventListener('change', renderRelics);

document.getElementById('characters').addEventListener('click', event => {
  if (Date.now() - lastDragEndedAt < 400) return;
  const button = event.target.closest('button[data-character-id]');
  if (button && !button.disabled) chooseCharacter(button.dataset.characterId, targetSlot);
});

document.getElementById('characters').addEventListener('dragstart', event => {
  const button = event.target.closest('button[data-character-id]');
  if (!button || button.disabled) return;
  dragSource = { type: 'picker', id: button.dataset.characterId };
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', button.dataset.characterId);
});

document.getElementById('relics').addEventListener('click', event => {
  if (Date.now() - lastDragEndedAt < 400) return;
  const button = event.target.closest('button[data-relic-id]');
  if (button) chooseRelic(button.dataset.relicId, targetSlot, targetRelicSlot);
});

document.getElementById('relics').addEventListener('dragstart', event => {
  const button = event.target.closest('button[data-relic-id]');
  if (!button) return;
  dragSource = { type: 'relic-picker', id: button.dataset.relicId };
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', button.dataset.relicId);
});

document.getElementById('teamSlots').addEventListener('click', event => {
  if (Date.now() - lastDragEndedAt < 400) return;
  const relicRemove = event.target.closest('.relic-remove');
  if (relicRemove) {
    event.stopPropagation();
    removeRelic(Number(relicRemove.dataset.slotIndex), Number(relicRemove.dataset.relicSlotIndex));
    return;
  }

  const removeButton = event.target.closest('.slot-remove');
  if (removeButton) {
    removeCharacter(Number(removeButton.dataset.slotIndex));
    return;
  }

  const relicSlot = event.target.closest('.relic-slot');
  if (relicSlot) {
    openRelicPicker(Number(relicSlot.dataset.slotIndex), Number(relicSlot.dataset.relicSlotIndex));
    return;
  }

  const slot = event.target.closest('.team-slot');
  if (slot) openPicker(Number(slot.dataset.slotIndex));
});

document.getElementById('teamSlots').addEventListener('keydown', event => {
  const slot = event.target.closest('.team-slot');
  if (slot && event.target === slot && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openPicker(Number(slot.dataset.slotIndex));
  }
});

document.getElementById('teamSlots').addEventListener('dragstart', event => {
  const relicSlot = event.target.closest('.relic-slot.filled');
  if (relicSlot) {
    dragSource = {
      type: 'team-relic',
      teamIndex: Number(relicSlot.dataset.slotIndex),
      relicIndex: Number(relicSlot.dataset.relicSlotIndex),
    };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(dragSource.relicIndex));
    return;
  }

  const slot = event.target.closest('.team-slot.filled');
  if (!slot || event.target.closest('.slot-remove')) {
    event.preventDefault();
    return;
  }
  dragSource = { type: 'team', index: Number(slot.dataset.slotIndex) };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(dragSource.index));
});

document.getElementById('teamSlots').addEventListener('dragover', event => {
  const relicSlot = event.target.closest('.relic-slot');
  if (relicSlot && dragSource &&
      (dragSource.type === 'relic-picker' || dragSource.type === 'team-relic')) {
    if (dragSource.type === 'team-relic' &&
        Number(relicSlot.dataset.relicSlotIndex) !== dragSource.relicIndex) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = dragSource.type === 'team-relic' ? 'move' : 'copy';
    relicSlot.classList.add('drag-over');
    return;
  }

  const slot = event.target.closest('.team-slot');
  if (!slot || !dragSource) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = dragSource.type === 'team' ? 'move' : 'copy';
  slot.classList.add('drag-over');
});

document.getElementById('teamSlots').addEventListener('dragleave', event => {
  const relicSlot = event.target.closest('.relic-slot');
  if (relicSlot && !relicSlot.contains(event.relatedTarget)) relicSlot.classList.remove('drag-over');
  const slot = event.target.closest('.team-slot');
  if (slot && !slot.contains(event.relatedTarget)) slot.classList.remove('drag-over');
});

document.getElementById('teamSlots').addEventListener('drop', event => {
  const relicSlot = event.target.closest('.relic-slot');
  if (relicSlot && dragSource &&
      (dragSource.type === 'relic-picker' || dragSource.type === 'team-relic')) {
    event.preventDefault();
    const teamIndex = Number(relicSlot.dataset.slotIndex);
    const relicIndex = Number(relicSlot.dataset.relicSlotIndex);
    relicSlot.classList.remove('drag-over');
    if (dragSource.type === 'relic-picker') {
      chooseRelic(dragSource.id, teamIndex, relicIndex);
    } else {
      moveRelic(dragSource.teamIndex, dragSource.relicIndex, teamIndex, relicIndex);
    }
    return;
  }

  const slot = event.target.closest('.team-slot');
  if (!slot || !dragSource) return;
  event.preventDefault();
  const targetIndex = Number(slot.dataset.slotIndex);
  slot.classList.remove('drag-over');

  if (dragSource.type === 'picker') {
    chooseCharacter(dragSource.id, targetIndex);
  } else {
    moveCharacter(dragSource.index, targetIndex);
  }
});

document.addEventListener('dragend', () => {
  lastDragEndedAt = Date.now();
  dragSource = null;
  document.querySelectorAll('.team-slot.drag-over').forEach(slot =>
    slot.classList.remove('drag-over')
  );
  document.querySelectorAll('.relic-slot.drag-over').forEach(slot =>
    slot.classList.remove('drag-over')
  );
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.getElementById('characterPicker').hidden) {
    closePicker();
  }
  if (event.key === 'Escape' && !document.getElementById('relicPicker').hidden) {
    closeRelicPicker();
  }
});

window.addEventListener('load', loadTeamPage);
