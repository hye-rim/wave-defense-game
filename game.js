(() => {
  'use strict';

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const COLS = 12, ROWS = 9, CW = 960, CH = 720, CELL = 80;
  canvas.width = CW; canvas.height = CH;

  const path = [[0,4],[2,4],[2,1],[6,1],[6,6],[9,6],[9,3],[11,3]];
  const route = [];
  const pathTiles = new Set();
  for (let i = 0; i < path.length - 1; i++) {
    const [x1,y1] = path[i], [x2,y2] = path[i+1];
    const dx = Math.sign(x2-x1), dy = Math.sign(y2-y1);
    const n = Math.abs(x2-x1) + Math.abs(y2-y1);
    for (let j = 0; j < n; j++) {
      const x = x1 + dx*j, y = y1 + dy*j;
      pathTiles.add(`${x},${y}`);
      route.push([x + .5, y + .5]);
    }
  }
  pathTiles.add(`${path.at(-1)[0]},${path.at(-1)[1]}`);
  route.push([path.at(-1)[0] + .5, path.at(-1)[1] + .5]);
  const routeLength = route.slice(1).reduce((sum, p, i) => sum + Math.abs(p[0]-route[i][0]) + Math.abs(p[1]-route[i][1]), 0);

  const kinds = {
    dart:   { name:'화살 타워', icon:'🏹', cost:70, range:2.35, damage:15, rate:.46, color:'#49a7ff' },
    cannon: { name:'대포 타워', icon:'💣', cost:110, range:2.05, damage:43, rate:1.25, color:'#ff8a56' },
    frost:  { name:'냉기 타워', icon:'❄️', cost:90, range:1.95, damage:7, rate:.8, color:'#67dbf0' },
  };
  const ui = {
    gold: document.getElementById('gold'), lives: document.getElementById('lives'),
    wave: document.getElementById('wave'), best: document.getElementById('best'),
    message: document.getElementById('message'), waveBtn: document.getElementById('waveBtn'),
    upgradeBtn: document.getElementById('upgradeBtn'), sellBtn: document.getElementById('sellBtn'),
  };
  let gold, lives, wave, score, best, towers, enemies, selectedKind, selectedTower;
  let active, spawnLeft, spawnTimer, ended, won, last = performance.now(), flashes = [];

  function readBest() { try { return Number(localStorage.getItem('defenseBest') || 0); } catch { return 0; } }
  function reset() {
    gold = 180; lives = 18; wave = 0; score = 0; towers = []; enemies = []; flashes = [];
    active = false; spawnLeft = 0; spawnTimer = 0; ended = false; won = false;
    selectedKind = 'dart'; selectedTower = null; best = readBest();
    setMessage('타워를 고르고 맵의 빈 칸에 놓으세요!');
    updateUI();
  }
  function setMessage(text) { ui.message.textContent = text; }
  function updateUI() {
    ui.gold.textContent = Math.floor(gold).toLocaleString('ko-KR');
    ui.lives.textContent = lives;
    ui.wave.textContent = `${wave} / 10`;
    ui.best.textContent = best;
    ui.waveBtn.textContent = ended ? '↻ 다시 하기' : active ? `🌊 ${wave}웨이브 중` : wave >= 10 ? '🏆 모두 막았어요!' : '▶ 다음 웨이브';
    ui.waveBtn.disabled = active || (wave >= 10 && !ended);
    ui.upgradeBtn.disabled = !selectedTower || selectedTower.level >= 3;
    ui.sellBtn.disabled = !selectedTower;
    document.querySelectorAll('.tower').forEach(b => b.classList.toggle('selected', b.dataset.tower === selectedKind));
  }

  function startWave() {
    if (ended) { reset(); return; }
    if (active || wave >= 10) return;
    wave++;
    active = true;
    spawnLeft = 4 + wave + Math.max(0, wave - 6) * 2;
    spawnTimer = .35;
    selectedTower = null;
    setMessage(`웨이브 ${wave}! 적 ${spawnLeft}마리가 다가와요.`);
    updateUI();
  }

  function spawnEnemy() {
    const total = 4 + wave + Math.max(0, wave - 6) * 2;
    const n = total - spawnLeft;
    const late = Math.max(0, wave - 6);
    let type = 'grunt';
    if (wave >= 3 && n % 4 === 2) type = 'runner';
    if (wave >= 4 && n % 5 === 4) type = 'tank';
    if (wave >= 9 && n === total - 1) type = 'boss';
    const stats = type === 'runner'
      ? { hp:40 + wave*10 + late*18, speed:1.18 + Math.min(wave*.025,.2), reward:7, color:'#ec6294', icon:'🐇' }
      : type === 'tank'
        ? { hp:135 + wave*22 + late*35, speed:.58, reward:12, color:'#9865d8', icon:'🐻' }
        : type === 'boss'
          ? { hp:1800 + wave*100, speed:.46, reward:30, color:'#c64b75', icon:'🐲' }
          : { hp:54 + wave*14 + late*28, speed:.78, reward:5, color:'#e88c4b', icon:'👾' };
    enemies.push({ ...stats, maxHp:stats.hp, progress:0, slow:0, type });
    spawnLeft--;
  }

  function positionAt(distance) {
    let d = distance;
    for (let i = 1; i < route.length; i++) {
      const a = route[i-1], b = route[i];
      const len = Math.abs(b[0]-a[0]) + Math.abs(b[1]-a[1]);
      if (d <= len) {
        const t = len ? d / len : 0;
        return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t];
      }
      d -= len;
    }
    return route.at(-1);
  }

  function placeOrSelect(event) {
    if (ended) return;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((event.clientX - rect.left) / rect.width * COLS);
    const row = Math.floor((event.clientY - rect.top) / rect.height * ROWS);
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return;
    const existing = towers.find(t => t.col === col && t.row === row);
    if (existing) {
      selectedTower = existing;
      selectedKind = existing.kind;
      setMessage(`${kinds[existing.kind].name} · 강화 ${existing.level}/3`);
      updateUI(); return;
    }
    if (pathTiles.has(`${col},${row}`)) { setMessage('적이 지나가는 길에는 타워를 놓을 수 없어요.'); return; }
    const def = kinds[selectedKind];
    if (gold < def.cost) { setMessage(`🪙 코인이 부족해요. ${def.cost}개가 필요합니다.`); return; }
    gold -= def.cost;
    const tower = { col, row, kind:selectedKind, level:1, cooldown:.1, spent:def.cost };
    towers.push(tower); selectedTower = tower;
    setMessage(`${def.icon} ${def.name} 배치 완료!`);
    updateUI();
  }

  function upgrade() {
    if (!selectedTower || selectedTower.level >= 3) return;
    const price = 55 + selectedTower.level * 45;
    if (gold < price) { setMessage(`강화에는 🪙 ${price}개가 필요해요.`); return; }
    gold -= price; selectedTower.spent += price; selectedTower.level++;
    setMessage(`강화 완료! ${kinds[selectedTower.kind].name} 레벨 ${selectedTower.level}`);
    updateUI();
  }
  function sell() {
    if (!selectedTower) return;
    const refund = Math.floor(selectedTower.spent * .62);
    gold += refund; towers = towers.filter(t => t !== selectedTower); selectedTower = null;
    setMessage(`타워를 판매해 🪙 ${refund}개를 돌려받았어요.`);
    updateUI();
  }

  function endGame(victory) {
    ended = true; active = false; won = victory;
    const reached = victory ? 10 : Math.max(0, wave - (active ? 1 : 0));
    best = Math.max(best, reached);
    try { localStorage.setItem('defenseBest', String(best)); } catch {}
    setMessage(victory ? `🎉 완벽한 수비! 최종 점수 ${score}` : `기지가 무너졌어요 · ${wave}웨이브 · 점수 ${score}`);
    updateUI();
  }

  function update(dt) {
    if (active) {
      spawnTimer -= dt;
      if (spawnLeft > 0 && spawnTimer <= 0) { spawnEnemy(); spawnTimer = Math.max(.32, .82 - wave*.04); }
      for (const enemy of enemies) {
        const speed = enemy.speed * (enemy.slow > 0 ? .48 : 1);
        enemy.progress += speed * dt;
        enemy.slow = Math.max(0, enemy.slow - dt);
        if (enemy.progress >= routeLength) { enemy.leaked = true; lives--; setMessage('적이 기지에 도착했어요!'); }
      }
      enemies = enemies.filter(e => {
        if (e.leaked) return false;
        if (e.hp <= 0) { gold += e.reward; score += e.reward * 10; return false; }
        return true;
      });

      for (const tower of towers) {
        tower.cooldown -= dt;
        if (tower.cooldown > 0) continue;
        const def = kinds[tower.kind];
        const range = def.range + (tower.level-1)*.22;
        let target = null;
        for (const enemy of enemies) {
          const [ex,ey] = positionAt(enemy.progress);
          if (Math.hypot(ex-(tower.col+.5), ey-(tower.row+.5)) <= range && (!target || enemy.progress > target.progress)) target = enemy;
        }
        if (target) {
          const [ex,ey] = positionAt(target.progress);
          const damage = def.damage * (1 + (tower.level-1)*.72);
          target.hp -= damage;
          if (tower.kind === 'frost') target.slow = Math.max(target.slow, 1.35);
          flashes.push({x:tower.col+.5,y:tower.row+.5,tx:ex,ty:ey,color:def.color,life:.12});
          tower.cooldown = def.rate;
        }
      }
      if (lives <= 0) endGame(false);
      else if (spawnLeft === 0 && enemies.length === 0) {
        active = false;
        gold += 14 + wave*3;
        score += wave*100;
        setMessage(wave === 10 ? '마지막 웨이브를 막았어요!' : `웨이브 ${wave} 방어 성공! 보너스 코인을 받았어요.`);
        if (wave >= 10) endGame(true);
        else updateUI();
      }
    }
    flashes = flashes.filter(f => (f.life -= dt) > 0);
    updateUI();
  }

  function draw() {
    ctx.clearRect(0,0,CW,CH);
    ctx.fillStyle = '#a8e6a5'; ctx.fillRect(0,0,CW,CH);
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
      const odd = (x+y)%2;
      ctx.fillStyle = odd ? 'rgba(255,255,255,.10)' : 'rgba(61,143,94,.07)';
      ctx.fillRect(x*CELL,y*CELL,CELL,CELL);
      ctx.strokeStyle = 'rgba(48,111,83,.14)'; ctx.lineWidth=2;
      ctx.strokeRect(x*CELL,y*CELL,CELL,CELL);
    }
    ctx.beginPath();
    route.forEach(([x,y],i) => i ? ctx.lineTo(x*CELL,y*CELL) : ctx.moveTo(x*CELL,y*CELL));
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#d7aa65'; ctx.lineWidth=48; ctx.stroke();
    ctx.strokeStyle='#f5d79a'; ctx.lineWidth=34; ctx.stroke();
    for (const [x,y] of route) {
      ctx.beginPath(); ctx.arc(x*CELL,y*CELL,3,0,Math.PI*2); ctx.fillStyle='rgba(150,105,61,.35)'; ctx.fill();
    }
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
      if (pathTiles.has(`${x},${y}`)) continue;
      const seed = (x*19+y*13)%11;
      if (seed < 2) { ctx.fillStyle = seed ? '#fff4bd' : '#ffe16b'; ctx.beginPath(); ctx.arc(x*CELL+18+seed*8,y*CELL+20+seed*12,4,0,Math.PI*2); ctx.fill(); }
    }
    // entrance and base
    drawBadge(CELL*.5,CELL*4.5,'🚪');
    drawBadge(CW-CELL*.5,CELL*3.5,'🏰');
    for (const tower of towers) drawTower(tower);
    for (const flash of flashes) {
      ctx.globalAlpha=Math.min(1,flash.life/.12); ctx.strokeStyle=flash.color; ctx.lineWidth=6;
      ctx.beginPath();ctx.moveTo(flash.x*CELL,flash.y*CELL);ctx.lineTo(flash.tx*CELL,flash.ty*CELL);ctx.stroke();ctx.globalAlpha=1;
    }
    for (const enemy of enemies) drawEnemy(enemy);
    if (!active && wave === 0 && !ended) {
      ctx.fillStyle='rgba(43,29,82,.16)';ctx.fillRect(0,0,CW,CH);
      ctx.fillStyle='#fff';ctx.font='30px Jua, sans-serif';ctx.textAlign='center';ctx.fillText('길목에 타워를 놓고 수비를 준비하세요',CW/2,CH-24);
    }
    if (ended) {
      ctx.fillStyle='rgba(31,20,62,.72)';ctx.fillRect(0,0,CW,CH);
      ctx.textAlign='center';ctx.fillStyle=won?'#ffe168':'#fff';ctx.font='bold 64px Jua, sans-serif';ctx.fillText(won?'모든 웨이브 수비 성공!':'기지 방어 실패',CW/2,CH/2-16);
      ctx.fillStyle='#fff';ctx.font='32px Jua, sans-serif';ctx.fillText('아래 다시 하기 버튼으로 재도전',CW/2,CH/2+42);
    }
  }
  function drawBadge(x,y,icon) {
    ctx.fillStyle='rgba(43,29,82,.22)';ctx.beginPath();ctx.arc(x,y+5,28,0,Math.PI*2);ctx.fill();
    ctx.font='34px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(icon,x,y);ctx.textBaseline='alphabetic';
  }
  function drawTower(t) {
    const x=(t.col+.5)*CELL,y=(t.row+.5)*CELL,def=kinds[t.kind];
    ctx.fillStyle='rgba(43,29,82,.24)';ctx.beginPath();ctx.ellipse(x,y+19,28,12,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=def.color;ctx.strokeStyle='#2b1d52';ctx.lineWidth=5;
    ctx.beginPath();ctx.arc(x,y,25,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.font='27px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(def.icon,x,y+1);ctx.textBaseline='alphabetic';
    if (selectedTower===t) { ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,33,0,Math.PI*2);ctx.stroke(); }
    ctx.fillStyle='#2b1d52';ctx.beginPath();ctx.arc(x+21,y-22,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='14px Jua,sans-serif';ctx.fillText(t.level,x+21,y-17);
  }
  function drawEnemy(e) {
    const [gx,gy]=positionAt(e.progress),x=gx*CELL,y=gy*CELL;
    const radius=e.type==='boss'?25:19;
    ctx.fillStyle='rgba(43,29,82,.22)';ctx.beginPath();ctx.ellipse(x,y+17,22,9,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=e.color;ctx.strokeStyle='#2b1d52';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.font=`${e.type==='boss'?29:21}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(e.icon,x,y+1);ctx.textBaseline='alphabetic';
    const barWidth=e.type==='boss'?58:46;
    ctx.fillStyle='#2b1d52';ctx.fillRect(x-barWidth/2,y-30,barWidth,7);ctx.fillStyle=e.slow>0?'#6cf1ff':'#55e292';ctx.fillRect(x-barWidth/2+2,y-28,(barWidth-4)*Math.max(0,e.hp/e.maxHp),3);
    if (e.slow>0) { ctx.fillStyle='#d9fbff';ctx.font='13px sans-serif';ctx.fillText('❄',x+19,y-15); }
  }
  function frame(now) {
    const dt=Math.min(.04,(now-last)/1000);last=now;
    update(dt);draw();requestAnimationFrame(frame);
  }

  document.querySelectorAll('.tower').forEach(button => button.addEventListener('click', () => {
    selectedKind=button.dataset.tower;selectedTower=null;setMessage(`${kinds[selectedKind].name} 선택 · 맵의 빈 칸을 눌러 배치`);updateUI();
  }));
  canvas.addEventListener('pointerdown', event => { event.preventDefault(); placeOrSelect(event); });
  ui.waveBtn.addEventListener('click', startWave);
  ui.upgradeBtn.addEventListener('click', upgrade);
  ui.sellBtn.addEventListener('click', sell);
  window.addEventListener('keydown', event => {
    if (event.key === '1' || event.key === '2' || event.key === '3') document.querySelector(`[data-tower="${['dart','cannon','frost'][Number(event.key)-1]}"]`).click();
    if (event.code === 'Space') { event.preventDefault();startWave(); }
    if (event.key === 'Escape') { selectedTower=null;updateUI(); }
  });
  reset(); requestAnimationFrame(frame);
})();
