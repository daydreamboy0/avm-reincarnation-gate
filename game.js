const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;
const FLOOR_Y = 454;
const GRAVITY = 1750;
const GATE_X = W / 2;
const keys = new Set();
const particles = [];
const effects = [];

const sprites = {
  player: loadImage('./player-cutout.png?v=red-stickman-20261004'),
  enemy: loadImage('./zombie.webp'),
  weapon: loadImage('./weapon-cutout.png'),
  hello: loadImage('./hello.png'),
};

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

const cycleData = [
  { quota: 5, spawn: 2.15, bossHealth: 190, name: '初醒' },
  { quota: 6, spawn: 1.85, bossHealth: 270, name: '逆行' },
  { quota: 7, spawn: 1.6, bossHealth: 360, name: '裂隙' },
  { quota: 8, spawn: 1.4, bossHealth: 460, name: '失序' },
  { quota: 9, spawn: 1.2, bossHealth: 580, name: '归零' },
  { quota: 10, spawn: 1.05, bossHealth: 720, name: '终门' },
];

function getCycleData(number) {
  if (number <= cycleData.length) return cycleData[number - 1];
  const depth = number - cycleData.length;
  return {
    quota: Math.min(24, 10 + depth * 2),
    spawn: Math.max(.55, 1.05 - depth * .08),
    bossHealth: 720 + depth * 150,
    name: `无尽 · ${number}`,
  };
}

const upgrades = [
  { id: 'vitality', icon: '+', name: '不灭核心', copy: '生命上限 +35，并立刻恢复全部生命。' },
  { id: 'edge', icon: '◇', name: '锋刃记忆', copy: '所有攻击伤害提高 35%。' },
  { id: 'haste', icon: '»', name: '疾行残响', copy: '移动更快，技能冷却缩短 22%。' },
  { id: 'siphon', icon: '◉', name: '魂火汲取', copy: '每次击破敌人恢复 6 点生命。' },
  { id: 'ward', icon: '⬡', name: '守门结界', copy: '受到的所有伤害降低 25%。' },
  { id: 'blade', icon: 'Y', name: '刀阵共鸣', copy: '刀阵范围、持续时间和伤害大幅提高。' },
  { id: 'legion', icon: 'X', name: '残影增殖', copy: '额外召唤 3 个分身，分身伤害提高 40%。' },
  { id: 'prism', icon: 'L', name: '激光棱镜', copy: '激光持续更久，伤害提高 45%。' },
  { id: 'airStep', icon: '↑', name: '空中跃迁', copy: '获得一次空中二段跳。' },
  { id: 'stomp', icon: '▼', name: '铁鞋践踏', copy: '踩中僵尸：减少其 10% 生命，并令其 10 秒内无法攻击。' },
];
const starterAbilityIds = ['stomp'];

function baseStats() {
  return {
    maxHealth: 100,
    damage: 1,
    speed: 1,
    cooldown: 1,
    healOnKill: 0,
    damageTaken: 1,
    bladeDuration: 2.6,
    bladeRadius: 78,
    bladeDamage: 11,
    cloneCount: 6,
    cloneDamage: 18,
    cloneLife: 4.8,
    laserDuration: 3.4,
    laserDamage: 38,
    extraJumps: 0,
    stomp: false,
  };
}

const state = {
  mode: 'start',
  time: 0,
  last: 0,
  cycle: 1,
  phase: 'wave',
  cycleKills: 0,
  totalKills: 0,
  souls: 0,
  nextSpawn: 0,
  shake: 0,
  player: null,
  enemies: [],
  clones: [],
  shockwaves: [],
  cooldowns: { y: 0, x: 0, l: 0 },
  laserTime: 0,
  touchX: 0,
  toastTime: 0,
  cycleBanner: 0,
  helloTriggerCount: 0,
  upgrades: [],
  stats: baseStats(),
};

function makePlayer() {
  return { x: 185, y: FLOOR_Y - 76, vx: 0, vy: 0, w: 30, h: 76, facing: 1, health: state.stats.maxHealth, grounded: true, airJumps: state.stats.extraJumps, attack: 0, attackHit: false, aura: 0, invuln: 0, stompInvuln: 0 };
}

function resetRun(showStart = true) {
  state.mode = showStart ? 'start' : 'playing';
  state.time = 0;
  state.cycle = 1;
  state.totalKills = 0;
  state.souls = 0;
  state.shake = 0;
  state.helloTriggerCount = 0;
  state.upgrades = [...starterAbilityIds];
  state.stats = baseStats();
  state.stats.stomp = true;
  state.player = makePlayer();
  particles.length = 0;
  effects.length = 0;
  document.getElementById('startScreen').classList.toggle('hidden', !showStart);
  document.getElementById('upgradeScreen').classList.add('hidden');
  document.getElementById('gameOver').classList.add('hidden');
  document.getElementById('toast').classList.add('hidden');
  document.getElementById('toast').classList.remove('hello-toast');
  state.toastTime = 0;
  startCycle(1, false);
  if (showStart) state.mode = 'start';
  renderAbilityDeck();
  updateHud();
}

function beginRun() {
  state.mode = 'playing';
  document.getElementById('startScreen').classList.add('hidden');
  state.cycleBanner = 2.2;
  setStatus('第一轮回已开启');
  initAudio();
  sound('gate');
}

function startCycle(number, heal = true) {
  state.cycle = number;
  state.phase = 'wave';
  state.cycleKills = 0;
  state.helloTriggerCount = 0;
  const toast = document.getElementById('toast');
  toast.textContent = '';
  toast.classList.add('hidden');
  toast.classList.remove('hello-toast');
  state.toastTime = 0;
  state.enemies = [];
  state.clones = [];
  state.shockwaves = [];
  state.cooldowns = { y: 0, x: 0, l: 0 };
  state.laserTime = 0;
  state.nextSpawn = .35;
  const p = state.player || makePlayer();
  p.x = 185;
  p.y = FLOOR_Y - p.h;
  p.vx = 0;
  p.vy = 0;
  p.grounded = true;
  p.airJumps = state.stats.extraJumps;
  p.invuln = 1;
  p.stompInvuln = 0;
  if (heal) p.health = state.stats.maxHealth;
  state.player = p;
  state.cycleBanner = number === 1 ? 0 : 2.2;
  setStatus(`轮回 ${cycleNumeral()} · ${getCycleData(number).name}`);
  updateHud();
}

function makeEnemy(type = 'normal', side = Math.random() < .5 ? -1 : 1) {
  const cycle = state.cycle;
  const boss = type === 'boss';
  const runner = type === 'runner';
  const health = boss ? getCycleData(cycle).bossHealth : runner ? 42 + cycle * 8 : 64 + cycle * 10;
  return {
    type,
    x: side < 0 ? 38 : W - 38,
    y: FLOOR_Y - (boss ? 104 : runner ? 65 : 76),
    w: boss ? 55 : runner ? 27 : 33,
    h: boss ? 104 : runner ? 65 : 76,
    health,
    maxHealth: health,
    speed: boss ? 42 + cycle * 6 : runner ? 104 + cycle * 9 : 54 + cycle * 8,
    damage: boss ? 18 + cycle * 3 : runner ? 9 + cycle * 2 : 10 + cycle * 2,
    facing: side < 0 ? 1 : -1,
    hit: 0,
    dead: 0,
    attackLock: 0,
    skillTimer: boss ? 2.4 : 0,
    stompLock: 0,
    phase: Math.random() * 6,
  };
}

function spawnBoss() {
  state.phase = 'boss';
  state.enemies.push(makeEnemy('boss', 1));
  state.cycleBanner = 1.4;
  setStatus('守门者苏醒');
  showToast('守门者苏醒 · 击败它开启轮回之门');
  burst(W - 90, FLOOR_Y - 40, '#f1c76b', 34);
  sound('boss');
}

function openGate() {
  state.phase = 'gate';
  state.shockwaves = [];
  setStatus('轮回之门已开启');
  showToast('门已开启 · 走入中央');
  burst(GATE_X, FLOOR_Y - 80, '#70d9d1', 46);
  sound('gate');
}

function enterGate() {
  if (state.mode !== 'playing' || state.phase !== 'gate') return;
  state.player.invuln = 9;
  state.mode = 'upgrade';
  renderUpgradeChoices();
  document.getElementById('upgradeScreen').classList.remove('hidden');
  sound('gate');
}

function renderUpgradeChoices() {
  const choices = document.getElementById('upgradeChoices');
  choices.innerHTML = '';
  const unseen = upgrades.filter(upgrade => !starterAbilityIds.includes(upgrade.id) && !state.upgrades.includes(upgrade.id));
  const available = unseen.length >= 3 ? unseen : upgrades;
  const offered = shuffle(available).slice(0, 3);
  for (const upgrade of offered) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'upgrade-card';
    button.innerHTML = `<span class="upgrade-icon">${upgrade.icon}</span><strong>${upgrade.name}</strong><small>${upgrade.copy}</small>`;
    button.addEventListener('click', () => chooseUpgrade(upgrade));
    choices.appendChild(button);
  }
}

function chooseUpgrade(upgrade) {
  state.upgrades.push(upgrade.id);
  if (upgrade.id === 'vitality') state.stats.maxHealth += 35;
  if (upgrade.id === 'edge') state.stats.damage *= 1.35;
  if (upgrade.id === 'haste') { state.stats.speed *= 1.12; state.stats.cooldown *= .78; }
  if (upgrade.id === 'siphon') state.stats.healOnKill = 6;
  if (upgrade.id === 'ward') state.stats.damageTaken *= .75;
  if (upgrade.id === 'blade') {
    state.stats.bladeDuration += 1.4;
    state.stats.bladeRadius += 24;
    state.stats.bladeDamage *= 1.4;
  }
  if (upgrade.id === 'legion') {
    state.stats.cloneCount += 3;
    state.stats.cloneDamage *= 1.4;
    state.stats.cloneLife += 1;
  }
  if (upgrade.id === 'prism') {
    state.stats.laserDuration += 1.4;
    state.stats.laserDamage *= 1.45;
  }
  if (upgrade.id === 'airStep') state.stats.extraJumps += 1;
  if (upgrade.id === 'stomp') state.stats.stomp = true;
  document.getElementById('upgradeScreen').classList.add('hidden');
  state.mode = 'playing';
  startCycle(state.cycle + 1);
  renderAbilityDeck();
  showToast(`${upgrade.name} 已写入轮回`);
  sound('upgrade');
}

function finishRun() {
  state.mode = 'lost';
  document.getElementById('resultEyebrow').textContent = '轮回中断';
  document.getElementById('gameOverTitle').textContent = '你倒在了门前';
  document.getElementById('gameOverCopy').textContent = '门仍在那里，下一次你会走得更远。';
  document.getElementById('runStats').innerHTML = `<span>抵达轮回<b>${cycleNumeral()}</b></span><span>击破敌人<b>${state.totalKills}</b></span><span>收集魂火<b>${state.souls}</b></span>`;
  document.getElementById('gameOver').classList.remove('hidden');
  setStatus('轮回中断');
  sound('lose');
}

function jump() {
  if (state.mode !== 'playing') return;
  const p = state.player;
  if (!p.grounded && p.airJumps <= 0) return;
  if (!p.grounded) {
    p.airJumps -= 1;
    burst(p.x, p.y + p.h, '#70d9d1', 14);
  } else {
    p.grounded = false;
  }
  p.vy = -680;
  p.invuln = Math.max(p.invuln, 1.5);
  burst(p.x, FLOOR_Y - 3, '#d9e3e0', 8);
  sound('jump');
}

function attack() {
  if (state.mode !== 'playing') return;
  const p = state.player;
  if (p.attack > 0) return;
  p.attack = .28;
  p.attackHit = false;
  sound('swing');
}

function useBlade() {
  if (state.mode !== 'playing' || state.cooldowns.y > 0) return;
  state.player.aura = state.stats.bladeDuration;
  state.cooldowns.y = 7 * state.stats.cooldown;
  burst(state.player.x, state.player.y + 36, '#ff5c52', 24);
  showToast('绯红刀阵');
  sound('skill');
}

function useClones() {
  if (state.mode !== 'playing' || state.cooldowns.x > 0 || state.clones.length) return;
  const p = state.player;
  const center = (state.stats.cloneCount - 1) / 2;
  state.clones = Array.from({ length: state.stats.cloneCount }, (_, i) => ({
    x: clamp(p.x + (i - center) * 22, 28, W - 28), y: p.y, w: 26, h: 72,
    facing: i < center ? -1 : 1, life: state.stats.cloneLife, attack: i * .07, damage: state.stats.cloneDamage * state.stats.damage,
  }));
  state.cooldowns.x = 18 * state.stats.cooldown;
  showToast('残影军团');
  burst(p.x, p.y + 35, '#ff8b82', 30);
  sound('skill');
}

function useLaser() {
  if (state.mode !== 'playing' || state.cooldowns.l > 0 || state.laserTime > 0) return;
  state.laserTime = state.stats.laserDuration;
  state.cooldowns.l = 15 * state.stats.cooldown;
  showToast('赤色激光');
  sound('laser');
}

function damageEnemy(enemy, amount) {
  if (enemy.dead > 0 || enemy.health <= 0) return;
  enemy.health -= amount * state.stats.damage;
  enemy.hit = .13;
  if (enemy.health > 0) return;
  enemy.health = 0;
  enemy.dead = .65;
  const reward = enemy.type === 'boss' ? 8 + state.cycle * 2 : enemy.type === 'runner' ? 2 : 1;
  state.souls += reward;
  state.totalKills += 1;
  if (enemy.type !== 'boss') state.cycleKills += 1;
  if (state.stats.healOnKill > 0) {
    const healing = enemy.type === 'boss' ? state.stats.healOnKill * 2 : state.stats.healOnKill;
    state.player.health = Math.min(state.stats.maxHealth, state.player.health + healing);
  }
  burst(enemy.x, enemy.y + enemy.h * .5, enemy.type === 'boss' ? '#f1c76b' : '#70d9d1', enemy.type === 'boss' ? 38 : 16);
  state.shake = enemy.type === 'boss' ? 13 : 4;
  sound(enemy.type === 'boss' ? 'bossDown' : 'hit');
  if (enemy.type === 'boss') openGate();
}

function damagePlayer(amount, sourceX) {
  const p = state.player;
  if (p.invuln > 0 || p.stompInvuln > 0 || state.mode !== 'playing') return;
  const healthBeforeHit = p.health;
  p.health -= amount * state.stats.damageTaken;
  p.invuln = .75;
  p.vy = -230;
  p.vx = Math.sign(p.x - sourceX) * 240;
  state.shake = 9;
  burst(p.x, p.y + 32, '#e9322c', 12);
  sound('hurt');
  if (healthBeforeHit > 10 && p.health <= 10) {
    p.health = 10;
    handleHelloTrigger();
  }
  if (p.health <= 0) { p.health = 0; finishRun(); }
}

function handleHelloTrigger() {
  state.helloTriggerCount += 1;
  if (state.helloTriggerCount === 1) {
    summonHello();
  } else if (state.helloTriggerCount === 2) {
    showToast('HELLO：我出去摸金了。', 'hello');
  }
}

function summonHello() {
  state.player.invuln = 2;
  effects.push({ type: 'hello', x: state.player.x + 90, y: FLOOR_Y - 82, life: 2.8 });
  for (const enemy of state.enemies) if (!enemy.dead) damageEnemy(enemy, enemy.type === 'boss' ? 45 : 999);
  state.player.health = 100;
  const toast = document.getElementById('toast');
  toast.textContent = '';
  toast.classList.add('hidden');
  toast.classList.remove('hello-toast');
  state.toastTime = 0;
  sound('upgrade');
}

function update(dt) {
  state.time += dt;
  state.toastTime = Math.max(0, state.toastTime - dt);
  if (state.toastTime === 0) document.getElementById('toast').classList.add('hidden');
  updateParticles(dt);
  if (state.mode !== 'playing') return;

  const p = state.player;
  state.cycleBanner = Math.max(0, state.cycleBanner - dt);
  state.shake = Math.max(0, state.shake - dt * 22);
  p.attack = Math.max(0, p.attack - dt);
  p.aura = Math.max(0, p.aura - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.stompInvuln = Math.max(0, p.stompInvuln - dt);
  for (const key of Object.keys(state.cooldowns)) state.cooldowns[key] = Math.max(0, state.cooldowns[key] - dt);
  state.laserTime = Math.max(0, state.laserTime - dt);

  const direction = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0) || (Math.abs(state.touchX) > .15 ? Math.sign(state.touchX) : 0);
  p.vx += (direction * 270 * state.stats.speed - p.vx) * Math.min(1, dt * 14);
  if (!direction) p.vx *= Math.pow(.001, dt);
  if (direction) p.facing = direction;
  p.x = clamp(p.x + p.vx * dt, 24, W - 24);
  const previousBottom = p.y + p.h;
  const previousVy = p.vy;
  p.vy += GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y + p.h >= FLOOR_Y) { p.y = FLOOR_Y - p.h; p.vy = 0; p.grounded = true; p.airJumps = state.stats.extraJumps; }
  handleStomp(previousBottom, previousVy);

  if (p.attack > .11 && !p.attackHit) {
    p.attackHit = true;
    const hitbox = { x: p.x + p.facing * 38, y: p.y + 14, w: 78, h: 50 };
    let connected = false;
    for (const enemy of state.enemies) if (!enemy.dead && overlap(hitbox, enemy, 4)) { damageEnemy(enemy, 26); connected = true; }
    effects.push({ type: 'slash', x: p.x + p.facing * 35, y: p.y + 33, facing: p.facing, life: .2, color: '#eef6f3' });
    if (connected) { state.shake = 4; sound('hit'); }
  }

  if (p.aura > 0) {
    if (Math.random() < dt * 18) effects.push({ type: 'slash', x: p.x + rand(-20,20), y: p.y + rand(0,76), facing: Math.random() < .5 ? -1 : 1, life: .22, color: '#ff5c52' });
    for (const enemy of state.enemies) if (!enemy.dead && Math.abs(enemy.x - p.x) < state.stats.bladeRadius) damageEnemy(enemy, state.stats.bladeDamage * dt);
  }

  if (state.laserTime > 0) {
    const start = p.x + p.facing * 12;
    const beam = { x: (start + (p.facing > 0 ? W : 0)) / 2, y: p.y + 23, w: Math.abs((p.facing > 0 ? W : 0) - start), h: 18 };
    for (const enemy of state.enemies) if (!enemy.dead && overlap(beam, enemy)) damageEnemy(enemy, state.stats.laserDamage * dt);
  }

  updateEnemies(dt);
  updateClones(dt);
  updateShockwaves(dt);
  updateEffects(dt);

  state.enemies = state.enemies.filter(enemy => enemy.dead > 0 || enemy.health > 0);
  if (state.phase === 'wave') {
    const data = getCycleData(state.cycle);
    const alive = state.enemies.filter(enemy => !enemy.dead).length;
    if (state.cycleKills >= data.quota && alive === 0) spawnBoss();
    else if (state.cycleKills < data.quota) {
      state.nextSpawn -= dt;
      if (state.nextSpawn <= 0 && alive < Math.min(2 + state.cycle, 4)) {
        const type = state.cycle > 1 && Math.random() < .28 ? 'runner' : 'normal';
        state.enemies.push(makeEnemy(type));
        state.nextSpawn = data.spawn;
      }
    }
  }

  if (state.phase === 'gate' && Math.abs(p.x - GATE_X) < 42 && p.grounded) enterGate();
  updateHud();
}

function updateEnemies(dt) {
  const p = state.player;
  for (const enemy of state.enemies) {
    if (enemy.dead > 0) { enemy.dead -= dt; continue; }
    enemy.hit = Math.max(0, enemy.hit - dt);
    enemy.attackLock = Math.max(0, enemy.attackLock - dt);
    enemy.stompLock = Math.max(0, enemy.stompLock - dt);
    if (enemy.hit <= 0) {
      const distance = p.x - enemy.x;
      enemy.facing = Math.sign(distance) || enemy.facing;
      const stop = enemy.type === 'boss' ? 40 : 26;
      if (Math.abs(distance) > stop) enemy.x = clamp(enemy.x + enemy.facing * enemy.speed * dt, 25, W - 25);
    }
    if (overlap(p, enemy, 2) && enemy.attackLock <= 0 && enemy.stompLock <= 0) {
      damagePlayer(enemy.damage, enemy.x);
      enemy.attackLock = enemy.type === 'boss' ? 1 : .85;
    }
    if (enemy.type === 'boss') {
      enemy.skillTimer -= dt;
      if (enemy.skillTimer <= 0) {
        state.shockwaves.push({ x: enemy.x, y: FLOOR_Y - 16, direction: -1, life: 2.7, hit: false });
        state.shockwaves.push({ x: enemy.x, y: FLOOR_Y - 16, direction: 1, life: 2.7, hit: false });
        enemy.skillTimer = Math.max(1.55, 2.8 - state.cycle * .3);
        state.shake = 7;
        burst(enemy.x, FLOOR_Y - 8, '#f1c76b', 14);
        sound('slam');
      }
    }
  }
}

function handleStomp(previousBottom, previousVy) {
  if (!state.stats.stomp || previousVy <= 0 || state.player.vy < 0) return;
  const p = state.player;
  for (const enemy of state.enemies) {
    if (enemy.dead > 0 || enemy.health <= 0 || enemy.stompLock > 0) continue;
    const horizontal = Math.abs(p.x - enemy.x) < (p.w + enemy.w) * .5;
    const crossedTop = previousBottom <= enemy.y + 16 && p.y + p.h >= enemy.y;
    if (!horizontal || !crossedTop) continue;
    const stompDamage = enemy.maxHealth * .1 / state.stats.damage;
    damageEnemy(enemy, stompDamage);
    enemy.stompLock = 10;
    enemy.hit = .25;
    p.y = enemy.y - p.h - 1;
    p.vy = -430;
    p.grounded = false;
    p.airJumps = state.stats.extraJumps;
    p.stompInvuln = .65;
    effects.push({ type: 'stomp', x: enemy.x, y: enemy.y + 8, life: .45 });
    burst(enemy.x, enemy.y, '#f1c76b', 16);
    state.shake = 6;
    setStatus('铁鞋践踏 · 僵尸沉默 10 秒');
    sound('slam');
    break;
  }
}

function updateClones(dt) {
  for (const clone of state.clones) {
    clone.life -= dt;
    const target = nearestEnemy(clone.x);
    if (!target) continue;
    clone.facing = Math.sign(target.x - clone.x) || clone.facing;
    clone.x += clone.facing * 150 * dt;
    clone.attack -= dt;
    if (clone.attack <= 0 && Math.abs(target.x - clone.x) < 54) {
      clone.attack = .38;
      damageEnemy(target, clone.damage / state.stats.damage);
      effects.push({ type: 'slash', x: clone.x + clone.facing * 25, y: clone.y + 34, facing: clone.facing, life: .16, color: '#ff9a91' });
    }
  }
  state.clones = state.clones.filter(clone => clone.life > 0);
}

function updateShockwaves(dt) {
  for (const wave of state.shockwaves) {
    wave.life -= dt;
    wave.x += wave.direction * (185 + state.cycle * 18) * dt;
    if (!wave.hit && Math.abs(wave.x - state.player.x) < 25 && state.player.y + state.player.h > FLOOR_Y - 28) {
      wave.hit = true;
      damagePlayer(12 + state.cycle * 2, wave.x);
    }
  }
  state.shockwaves = state.shockwaves.filter(wave => wave.life > 0 && wave.x > -40 && wave.x < W + 40);
}

function updateParticles(dt) {
  for (const particle of particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 420 * dt;
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
}

function updateEffects(dt) {
  for (const effect of effects) effect.life -= dt;
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].life <= 0) effects.splice(i, 1);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(rand(-state.shake, state.shake) * .5, rand(-state.shake, state.shake) * .5);
  drawWorld();
  drawGate();
  drawFloor();
  for (const wave of state.shockwaves) drawShockwave(wave);
  for (const enemy of state.enemies) drawEnemy(enemy);
  for (const clone of state.clones) drawPlayer(clone, true);
  for (const effect of effects) if (effect.type === 'hello') drawHello(effect);
  drawPlayer(state.player, false);
  if (state.laserTime > 0) drawLaser();
  drawEffects();
  drawParticles();
  if (state.cycleBanner > 0 && state.mode === 'playing') drawCycleBanner();
  ctx.restore();
  drawVignette();
}

function drawWorld() {
  const gradient = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  gradient.addColorStop(0, '#071012');
  gradient.addColorStop(.6, '#132326');
  gradient.addColorStop(1, '#263537');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = .12;
  for (let i = 0; i < 14; i++) {
    const x = (i * 89 + state.time * (i % 2 ? 3 : -2)) % (W + 100) - 50;
    const h = 80 + (i * 31) % 170;
    ctx.fillStyle = i % 3 === 0 ? '#70d9d1' : '#cdd8d5';
    ctx.fillRect(x, FLOOR_Y - h, 1, h);
    ctx.fillRect(x, FLOOR_Y - h, 34, 1);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(2,5,6,.35)';
  ctx.fillRect(0, FLOOR_Y - 46, W, 46);
  ctx.fillStyle = 'rgba(218,231,227,.7)';
  ctx.font = '700 10px Arial';
  ctx.fillText(`REINCARNATION // ${String(state.cycle).padStart(2, '0')}`, 22, 28);
}

function drawGate() {
  const open = state.phase === 'gate';
  const pulse = Math.sin(state.time * (open ? 5 : 2)) * 4;
  const radiusX = 48 + pulse * .25;
  const radiusY = 88 + pulse;
  ctx.save();
  ctx.translate(GATE_X, FLOOR_Y - 78);
  ctx.globalAlpha = open ? .9 : .28;
  ctx.shadowColor = open ? '#70d9d1' : '#e9322c';
  ctx.shadowBlur = open ? 28 : 12;
  ctx.strokeStyle = open ? '#8ff6eb' : '#a63833';
  ctx.lineWidth = open ? 5 : 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 8]);
  ctx.rotate(state.time * .08);
  ctx.beginPath();
  ctx.ellipse(0, 0, radiusX + 11, radiusY + 11, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (open) {
    const inner = ctx.createRadialGradient(0, 0, 3, 0, 0, 78);
    inner.addColorStop(0, 'rgba(215,255,250,.48)');
    inner.addColorStop(.45, 'rgba(55,160,153,.22)');
    inner.addColorStop(1, 'rgba(2,9,10,0)');
    ctx.fillStyle = inner;
    ctx.beginPath(); ctx.ellipse(0, 0, radiusX - 4, radiusY - 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawFloor() {
  ctx.fillStyle = '#a4afaf';
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  const size = 38;
  for (let y = FLOOR_Y; y < H; y += size) for (let x = 0; x < W; x += size) {
    ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#aab5b5' : '#929f9f';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = 'rgba(30,43,45,.25)';
    ctx.strokeRect(x + .5, y + .5, size - 1, size - 1);
  }
  ctx.fillStyle = '#dce5e3'; ctx.fillRect(0, FLOOR_Y - 4, W, 4);
  ctx.fillStyle = '#536365'; ctx.fillRect(0, FLOOR_Y, W, 3);
}

function drawPlayer(entity, clone) {
  if (!entity) return;
  ctx.save();
  ctx.translate(entity.x, entity.y);
  if (entity.facing < 0) ctx.scale(-1, 1);
  const flicker = !clone && (entity.invuln > 0 || entity.stompInvuln > 0) && Math.floor(state.time * 18) % 2;
  ctx.globalAlpha = clone ? clamp(entity.life / 1.5, 0, .55) : flicker ? .32 : 1;
  if (sprites.player.complete && sprites.player.naturalWidth) {
    const drawH = clone ? 104 : 114;
    const drawW = drawH * sprites.player.naturalWidth / sprites.player.naturalHeight;
    ctx.filter = clone ? 'hue-rotate(8deg) saturate(.7)' : 'none';
    ctx.drawImage(sprites.player, -drawW / 2, entity.h - drawH, drawW, drawH);
    ctx.filter = 'none';
  } else drawFallbackPlayer();
  const swinging = !clone && entity.attack > 0;
  if (sprites.weapon.complete && sprites.weapon.naturalWidth) {
    ctx.save();
    ctx.translate(8, 35);
    ctx.rotate(swinging ? -1.15 + (entity.attack / .28) * 1.4 : -.65);
    ctx.drawImage(sprites.weapon, -10, -49, 76, 76);
    ctx.restore();
  }
  if (!clone && entity.aura > 0) {
    ctx.globalAlpha = .45;
    ctx.strokeStyle = '#ff4c43'; ctx.lineWidth = 4; ctx.shadowColor = '#ff4c43'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(0, 40, 50 + Math.sin(state.time * 12) * 4, -.9, 1.1); ctx.stroke();
  }
  ctx.restore();
}

function drawFallbackPlayer() {
  ctx.strokeStyle = '#e9322c'; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 14, 12, 0, Math.PI * 2); ctx.moveTo(0,26); ctx.lineTo(0,59); ctx.moveTo(0,36); ctx.lineTo(-18,50); ctx.moveTo(0,36); ctx.lineTo(19,50); ctx.moveTo(0,59); ctx.lineTo(-13,75); ctx.moveTo(0,59); ctx.lineTo(14,75); ctx.stroke();
}

function drawEnemy(enemy) {
  const scale = enemy.type === 'boss' ? 1.38 : enemy.type === 'runner' ? .88 : 1;
  const drawH = 132 * scale;
  const drawW = sprites.enemy.naturalWidth ? drawH * sprites.enemy.naturalWidth / sprites.enemy.naturalHeight : 76 * scale;
  ctx.save();
  ctx.translate(enemy.x, FLOOR_Y);
  if (enemy.facing < 0) ctx.scale(-1, 1);
  ctx.globalAlpha = enemy.dead > 0 ? clamp(enemy.dead * 1.7, 0, 1) : 1;
  ctx.shadowColor = enemy.type === 'boss' ? '#f1c76b' : enemy.type === 'runner' ? '#70d9d1' : 'transparent';
  ctx.shadowBlur = enemy.type === 'boss' ? 18 : 8;
  if (sprites.enemy.complete && sprites.enemy.naturalWidth) {
    ctx.filter = enemy.type === 'boss' ? 'sepia(.45) saturate(1.35)' : enemy.type === 'runner' ? 'hue-rotate(55deg)' : 'none';
    ctx.drawImage(sprites.enemy, -drawW / 2, -drawH, drawW, drawH);
    ctx.filter = 'none';
  } else { ctx.fillStyle = '#64875e'; ctx.fillRect(-18, -76, 36, 76); }
  if (enemy.hit > 0) {
    ctx.globalAlpha = enemy.hit * 4;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-drawW / 2, -drawH, drawW, drawH);
  }
  ctx.restore();
  if (enemy.type !== 'boss' && !enemy.dead) {
    ctx.fillStyle = '#1a2826'; ctx.fillRect(enemy.x - 18, FLOOR_Y - 7, 36, 3);
    ctx.fillStyle = enemy.type === 'runner' ? '#70d9d1' : '#d7c66f'; ctx.fillRect(enemy.x - 18, FLOOR_Y - 7, 36 * clamp(enemy.health / enemy.maxHealth, 0, 1), 3);
    if (enemy.stompLock > 0) {
      ctx.fillStyle = '#70d9d1';
      ctx.font = '700 9px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`沉默 ${Math.ceil(enemy.stompLock)}s`, enemy.x, enemy.y - 8);
    }
  }
}

function drawHello(effect) {
  ctx.save();
  ctx.globalAlpha = clamp(effect.life, 0, 1);
  const bob = Math.sin(state.time * 9) * 3;
  if (sprites.hello.complete && sprites.hello.naturalWidth) {
    const height = 148;
    const width = height * sprites.hello.naturalWidth / sprites.hello.naturalHeight;
    ctx.drawImage(sprites.hello, effect.x - width / 2, effect.y + bob - 70, width, height);
  }
  ctx.strokeStyle = '#f1c76b'; ctx.lineWidth = 2; ctx.shadowColor = '#f1c76b'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(effect.x, effect.y + 18, 42, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawLaser() {
  const p = state.player;
  const y = p.y + 30;
  const start = p.x + p.facing * 10;
  const end = p.facing > 0 ? W : 0;
  ctx.save();
  ctx.globalAlpha = .45 + Math.sin(state.time * 30) * .1;
  ctx.strokeStyle = '#ff332c'; ctx.lineWidth = 13; ctx.shadowColor = '#ff332c'; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.moveTo(start, y); ctx.lineTo(end, y); ctx.stroke();
  ctx.globalAlpha = 1; ctx.strokeStyle = '#ffe1dc'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(start, y); ctx.lineTo(end, y); ctx.stroke();
  ctx.restore();
}

function drawShockwave(wave) {
  ctx.save();
  ctx.translate(wave.x, wave.y);
  ctx.globalAlpha = clamp(wave.life, 0, 1);
  ctx.strokeStyle = '#f1c76b'; ctx.lineWidth = 4; ctx.shadowColor = '#f1c76b'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(-16, 7); ctx.lineTo(-8, -7); ctx.lineTo(0, 5); ctx.lineTo(9, -10); ctx.lineTo(17, 7); ctx.stroke();
  ctx.restore();
}

function drawEffects() {
  for (const effect of effects) {
    if (effect.type === 'stomp') {
      ctx.save();
      ctx.globalAlpha = clamp(effect.life * 3, 0, 1);
      ctx.strokeStyle = '#f1c76b'; ctx.lineWidth = 4; ctx.shadowColor = '#f1c76b'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, (1 - effect.life / .45) * 38 + 10, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.restore();
      continue;
    }
    if (effect.type !== 'slash') continue;
    ctx.save();
    ctx.globalAlpha = clamp(effect.life * 6, 0, 1);
    ctx.translate(effect.x, effect.y);
    if (effect.facing < 0) ctx.scale(-1, 1);
    ctx.strokeStyle = effect.color; ctx.lineWidth = 5; ctx.shadowColor = effect.color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(0, 0, 44, -.85, .75); ctx.stroke();
    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of particles) {
    ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function drawCycleBanner() {
  const alpha = Math.min(1, state.cycleBanner, (2.2 - state.cycleBanner) * 3);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f5f4'; ctx.font = '700 36px Arial';
  ctx.fillText(`轮回 ${cycleNumeral()}`, W / 2, 220);
  ctx.fillStyle = '#8c9998'; ctx.font = '12px Arial';
  ctx.fillText(getCycleData(state.cycle).name, W / 2, 246);
  ctx.restore();
}

function drawVignette() {
  const vignette = ctx.createRadialGradient(W / 2, H / 2, 170, W / 2, H / 2, 570);
  vignette.addColorStop(.55, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

function updateHud() {
  const p = state.player;
  const data = getCycleData(state.cycle);
  const boss = state.enemies.find(enemy => enemy.type === 'boss' && !enemy.dead);
  document.getElementById('healthValue').textContent = Math.ceil(clamp(p.health, 0, state.stats.maxHealth));
  document.getElementById('maxHealthValue').textContent = state.stats.maxHealth;
  document.getElementById('healthBar').style.width = `${clamp(p.health / state.stats.maxHealth * 100, 0, 100)}%`;
  document.getElementById('soulValue').textContent = state.souls;
  document.getElementById('killValue').textContent = state.totalKills;
  document.getElementById('cycleValue').textContent = cycleNumeral();
  let objective = `清除门前残影 · ${data.name}`;
  let progress = state.cycleKills / data.quota;
  let progressText = `${Math.min(state.cycleKills, data.quota)} / ${data.quota}`;
  if (state.phase === 'boss') { objective = '击败守门者'; progress = boss ? boss.health / boss.maxHealth : 0; progressText = boss ? `${Math.ceil(clamp(progress, 0, 1) * 100)}%` : ''; }
  if (state.phase === 'gate') { objective = '进入轮回之门'; progress = 1; progressText = '已开启'; }
  document.getElementById('objectiveText').textContent = objective;
  document.getElementById('objectiveProgress').style.width = `${clamp(progress * 100, 0, 100)}%`;
  document.getElementById('progressText').textContent = progressText;
  document.getElementById('bossBar').classList.toggle('hidden', !boss);
  if (boss) document.getElementById('bossHealth').style.width = `${clamp(boss.health / boss.maxHealth * 100, 0, 100)}%`;
  updateCooldown('Y', state.cooldowns.y);
  updateCooldown('X', state.cooldowns.x);
  updateCooldown('L', state.laserTime > 0 ? state.laserTime : state.cooldowns.l);
}

function renderAbilityDeck() {
  const container = document.getElementById('abilityCards');
  const count = document.getElementById('deckCount');
  if (!container || !count) return;
  const levels = new Map();
  for (const id of state.upgrades) levels.set(id, (levels.get(id) || 0) + 1);
  count.textContent = `${levels.size} / ${upgrades.length}`;
  if (!levels.size) {
    container.innerHTML = '<span class="deck-empty">穿过轮回之门后选择能力</span>';
    return;
  }
  container.innerHTML = '';
  for (const upgrade of upgrades) {
    const level = levels.get(upgrade.id);
    if (!level) continue;
    const card = document.createElement('div');
    card.className = 'ability-card';
    card.title = `${upgrade.name} Lv.${level}\n${upgrade.copy}`;
    card.innerHTML = `<span class="ability-card-icon">${upgrade.icon}</span><span class="ability-card-info"><strong class="ability-card-name">${upgrade.name}</strong><small class="ability-card-detail">${upgrade.copy}</small></span><em class="ability-card-level">Lv.${level}</em>`;
    container.appendChild(card);
  }
}

function updateCooldown(key, value) {
  const lower = key.toLowerCase();
  const skill = document.getElementById(`skill${key}`);
  const timer = value > 0 ? Math.ceil(value) : '';
  skill.classList.toggle('cooldown', value > 0);
  skill.classList.toggle('ready', value <= 0);
  document.getElementById(`skill${key}Timer`).textContent = timer;
  const touchId = key === 'Y' ? 'touchBladeTimer' : key === 'X' ? 'touchCloneTimer' : 'touchLaserTimer';
  document.getElementById(touchId).textContent = timer;
  void lower;
}

function showToast(text, variant = '') {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.classList.toggle('hello-toast', variant === 'hello');
  toast.classList.remove('hidden');
  state.toastTime = 2.3;
}

function setStatus(text) { document.getElementById('statusText').textContent = text; }
function cycleNumeral() { return ['壹', '贰', '叁', '肆', '伍', '陆'][state.cycle - 1] || String(state.cycle); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function rand(min, max) { return min + Math.random() * (max - min); }
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function overlap(a, b, pad = 0) { return a.x - a.w / 2 < b.x + b.w / 2 + pad && a.x + a.w / 2 > b.x - b.w / 2 - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad; }
function nearestEnemy(x) { return state.enemies.filter(enemy => !enemy.dead).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0]; }
function burst(x, y, color, count) { for (let i = 0; i < count; i++) particles.push({ x, y, vx: rand(-180, 180), vy: rand(-240, 40), life: rand(.3, .75), color, size: rand(2, 5) }); }

let audioContext = null;
function initAudio() { if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); }
function sound(name) {
  if (!audioContext) return;
  const settings = {
    jump: [220, .05, 'sine'], swing: [150, .04, 'sawtooth'], hit: [90, .06, 'square'], hurt: [70, .11, 'sawtooth'],
    skill: [340, .14, 'triangle'], laser: [110, .22, 'sawtooth'], slam: [55, .16, 'square'], gate: [260, .34, 'sine'],
    boss: [64, .4, 'sawtooth'], bossDown: [110, .45, 'triangle'], upgrade: [520, .22, 'sine'], win: [660, .55, 'sine'], lose: [72, .45, 'triangle'],
  }[name] || [180, .05, 'sine'];
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = settings[2];
  oscillator.frequency.setValueAtTime(settings[0], audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, settings[0] * (name === 'win' || name === 'upgrade' ? 1.7 : .62)), audioContext.currentTime + settings[1]);
  gain.gain.setValueAtTime(.04, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + settings[1]);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(); oscillator.stop(audioContext.currentTime + settings[1]);
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (['a', 'd', 'y', 'x', 'l', ' ', 'j'].includes(key)) event.preventDefault();
  if (!event.repeat) {
    if (key === ' ') jump();
    if (key === 'j') attack();
    if (key === 'y') useBlade();
    if (key === 'x') useClones();
    if (key === 'l') useLaser();
    if (key === 'enter' && state.mode === 'start') beginRun();
  }
  keys.add(key);
}
function onKeyUp(event) { keys.delete(event.key.toLowerCase()); }

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
canvas.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * W;
  state.player.facing = x >= state.player.x ? 1 : -1;
  attack();
});
document.getElementById('startGame').addEventListener('click', beginRun);
document.getElementById('resetGame').addEventListener('click', () => { resetRun(false); beginRun(); });
document.getElementById('restart').addEventListener('click', () => { document.getElementById('gameOver').classList.add('hidden'); resetRun(false); beginRun(); });

const joystick = document.getElementById('joystick');
const joystickKnob = document.getElementById('joystickKnob');
let joystickPointer = null;
function moveJoystick(clientX) {
  const rect = joystick.getBoundingClientRect();
  const limit = rect.width / 2 - 19;
  const offset = clamp(clientX - (rect.left + rect.width / 2), -limit, limit);
  state.touchX = offset / limit;
  joystickKnob.style.transform = `translateX(${offset}px)`;
}
function releaseJoystick() { joystickPointer = null; state.touchX = 0; joystickKnob.style.transform = 'translateX(0)'; }
joystick.addEventListener('pointerdown', event => { joystickPointer = event.pointerId; joystick.setPointerCapture(event.pointerId); moveJoystick(event.clientX); event.preventDefault(); });
joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickPointer) moveJoystick(event.clientX); });
joystick.addEventListener('pointerup', releaseJoystick);
joystick.addEventListener('pointercancel', releaseJoystick);
document.getElementById('touchJump').addEventListener('pointerdown', event => { event.stopPropagation(); jump(); });
document.getElementById('touchAttack').addEventListener('pointerdown', event => { event.stopPropagation(); attack(); });
document.getElementById('touchBlade').addEventListener('pointerdown', event => { event.stopPropagation(); useBlade(); });
document.getElementById('touchClone').addEventListener('pointerdown', event => { event.stopPropagation(); useClones(); });
document.getElementById('touchLaser').addEventListener('pointerdown', event => { event.stopPropagation(); useLaser(); });

function frame(timestamp) {
  const dt = Math.min((timestamp - state.last) / 1000 || 0, .033);
  state.last = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

resetRun(true);
requestAnimationFrame(frame);
