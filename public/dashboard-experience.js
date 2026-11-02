(() => {
  const characterStatus = document.getElementById('characterStatus');
  const retryCharacters = document.getElementById('retryCharacters');
  const characterList = document.getElementById('characters');
  const errorBox = document.getElementById('error');
  const queueStatus = document.getElementById('queueStatus');
  const queueCount = document.getElementById('queueCount');
  const queueList = document.getElementById('watchlistItems');
  const processButton = document.getElementById('processQueue');
  const retryQueue = document.getElementById('retryQueue');
  const notice = document.getElementById('notice');
  const graph = new Map();
  let queueBusy = false;
  let selectedCharacterId = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
  }

  function setCharacterState(message, state) {
    characterStatus.textContent = message;
    characterStatus.dataset.state = state;
    retryCharacters.hidden = state !== 'error';
  }

  function updateCharacterState() {
    if (errorBox.style.display !== 'none' && errorBox.textContent &&
        errorBox.textContent.startsWith('โหลดข้อมูลไม่สำเร็จ:')) {
      setCharacterState('เกิดข้อผิดพลาดในการโหลดตัวละคร', 'error');
      return;
    }

    const sortInfo = document.getElementById('sortInfo').textContent;
    if (!sortInfo) return;
    const count = Number(document.getElementById('totalCount').textContent);
    const visible = Number(document.getElementById('visibleCount').textContent);
    if (visible === 0) {
      setCharacterState(count === 0
        ? 'ยังไม่มีข้อมูลตัวละคร'
        : 'ไม่พบตัวละครที่ตรงกับการค้นหา/ตัวกรอง', 'empty');
    } else {
      setCharacterState(`โหลดสำเร็จ ${count} ตัวละคร`, 'success');
    }
  }

  function addEdge(from, to) {
    if (!graph.has(from)) graph.set(from, new Set());
    if (!graph.has(to)) graph.set(to, new Set());
    graph.get(from).add(to);
    graph.get(to).add(from);
  }

  function buildGraph(characters) {
    graph.clear();
    for (const character of characters) {
      const characterNode = `character:${String(character.id)}`;
      graph.set(characterNode, new Set());
      for (const [kind, value] of [['path', character.path], ['element', character.element]]) {
        const label = String(value || '').trim();
        if (!label || label.toLowerCase() === 'unknown') continue;
        addEdge(characterNode, `${kind}:${label.toLowerCase()}`);
      }
    }
  }

  function findRelated(id) {
    const start = `character:${String(id)}`;
    const queue = [{ node: start, distance: 0 }];
    const visited = new Set([start]);
    const matches = new Map();

    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      if (current.distance === 2) continue;
      for (const neighbor of graph.get(current.node) || []) {
        if (current.distance === 1 && neighbor.startsWith('character:') && neighbor !== start) {
          const otherId = neighbor.slice('character:'.length);
          if (!matches.has(otherId)) matches.set(otherId, new Set());
          matches.get(otherId).add(current.node.startsWith('path:') ? 'Path เดียวกัน' : 'ธาตุเดียวกัน');
        }
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push({ node: neighbor, distance: current.distance + 1 });
      }
    }

    return [...matches.entries()]
      .map(([otherId, reasons]) => ({
        character: charactersById.get(otherId),
        reasons: [...reasons],
      }))
      .filter(match => match.character)
      .sort((a, b) =>
        b.reasons.length - a.reasons.length ||
        b.character.rarity - a.character.rarity ||
        a.character.name.localeCompare(b.character.name)
      );
  }

  function renderGraph() {
    const character = allCharacters.find(item => String(item.id) === String(selectedCharacterId));
    const list = document.getElementById('relatedCharacters');
    if (!character) return;
    const related = findRelated(character.id);
    document.getElementById('graphSummary').textContent =
      `พบ ${related.length} ตัวละครที่เชื่อมโยงผ่าน Path/ธาตุ (ใช้เพื่อสำรวจข้อมูล ไม่ใช่คำแนะนำ Meta)`;
    list.innerHTML = related.length === 0
      ? '<li class="empty-results">ไม่พบตัวละครที่มี Path หรือธาตุตรงกัน</li>'
      : related.slice(0, 8).map(({ character: item, reasons }) => `
        <li class="related-item">
          ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : ''}
          <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(reasons.join(' · '))}</small></span>
          <button type="button" data-related-character-id="${escapeHtml(item.id)}">ดู</button>
        </li>
      `).join('');
  }

  async function getQueue() {
    const response = await fetch('/watchlist');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'โหลดคิวไม่สำเร็จ');
    if (!Array.isArray(result.items)) throw new Error('ข้อมูลคิวจากเซิร์ฟเวอร์ไม่ถูกต้อง');
    return result.items;
  }

  function renderQueue(items) {
    queueCount.textContent = `${items.length} รายการ`;
    processButton.disabled = queueBusy || items.length === 0;
    queueList.innerHTML = items.length === 0
      ? '<li class="empty-results">คิวยังว่าง — กด “+ คิว” บนตัวละครเพื่อเพิ่ม</li>'
      : items.map((character, index) => `
        <li class="queue-item">
          ${character.image ? `<img src="${escapeHtml(character.image)}" alt="" loading="lazy">` : ''}
          <span><strong>${escapeHtml(character.name)}</strong><small>ลำดับ ${index + 1} · ${escapeHtml(character.path)} · ${escapeHtml(character.element)}</small></span>
        </li>
      `).join('');
  }

  async function loadQueue() {
    queueStatus.textContent = 'กำลังโหลดคิว...';
    queueStatus.dataset.state = 'loading';
    retryQueue.hidden = true;
    try {
      const items = await getQueue();
      renderQueue(items);
      queueStatus.textContent = items.length ? `โหลดคิวสำเร็จ มี ${items.length} รายการ` : 'โหลดสำเร็จ — คิวยังว่าง';
      queueStatus.dataset.state = items.length ? 'success' : 'empty';
      retryQueue.hidden = true;
    } catch (error) {
      renderQueue([]);
      queueStatus.textContent = 'โหลดคิวไม่สำเร็จ';
      queueStatus.dataset.state = 'error';
      retryQueue.hidden = false;
      errorBox.textContent = error.message;
      errorBox.style.display = 'block';
    }
  }

  async function processNext() {
    if (queueBusy) return;
    queueBusy = true;
    processButton.disabled = true;
    queueStatus.textContent = 'กำลังประมวลผลตัวถัดไป...';
    queueStatus.dataset.state = 'loading';
    try {
      const response = await fetch('/watchlist/process', { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ประมวลผลคิวไม่สำเร็จ');
      const items = await getQueue();
      renderQueue(items);
      queueStatus.textContent = result.message || 'ประมวลผลคิวสำเร็จ';
      queueStatus.dataset.state = items.length ? 'success' : 'empty';
      errorBox.textContent = '';
      errorBox.style.display = 'none';
    } catch (error) {
      queueStatus.textContent = 'ประมวลผลคิวไม่สำเร็จ';
      queueStatus.dataset.state = 'error';
      errorBox.textContent = error.message;
      errorBox.style.display = 'block';
    } finally {
      queueBusy = false;
      processButton.disabled = queueCount.textContent === '0 รายการ';
    }
  }

  characterStatus.textContent = 'กำลังโหลดข้อมูลตัวละคร...';
  characterStatus.dataset.state = 'loading';
  retryCharacters.hidden = true;
  retryCharacters.addEventListener('click', () => loadDashboard());
  processButton.addEventListener('click', processNext);
  retryQueue.addEventListener('click', loadQueue);

  new MutationObserver(updateCharacterState).observe(characterList, {
    childList: true,
    subtree: true,
  });
  new MutationObserver(updateCharacterState).observe(errorBox, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });

  characterList.addEventListener('click', event => {
    const card = event.target.closest('.card[data-character-id]');
    if (!card || event.target.closest('.queue-button')) return;
    selectedCharacterId = card.dataset.characterId;
    buildGraph(allCharacters);
    renderGraph();
  });
  characterList.addEventListener('keydown', event => {
    const card = event.target.closest('.card[data-character-id]');
    if (!card || event.target !== card || !['Enter', ' '].includes(event.key)) return;
    selectedCharacterId = card.dataset.characterId;
    buildGraph(allCharacters);
    renderGraph();
  });
  document.getElementById('relatedCharacters').addEventListener('click', event => {
    const button = event.target.closest('[data-related-character-id]');
    if (!button) return;
    selectedCharacterId = button.dataset.relatedCharacterId;
    showCharacter(selectedCharacterId);
    renderGraph();
  });

  new MutationObserver(() => {
    if (notice.style.display !== 'none' && notice.textContent) loadQueue();
  }).observe(notice, { attributes: true, childList: true, characterData: true, subtree: true });

  window.addEventListener('load', loadQueue);
})();
