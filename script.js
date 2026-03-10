class Printer {
  constructor(id, model) {
    this.id = id;
    this.model = model;
    this.name = model.name;
    this.status = 'idle';
    this.currentJobId = null;
    this.upgradeLevel = 0;
    this.health = 100;
  }

  get statBlock() {
    const b = this.model;
    const up = this.upgradeLevel;
    return {
      speed: b.speed * (1 + up * 0.08),
      reliability: Math.min(99, b.reliability + up * 3),
      quality: b.quality + up * 2,
      complexity: b.complexity + up * 2,
      maxSize: b.maxSize + up * 4,
      multicolor: b.multicolor + up * 2,
      maintenance: Math.max(5, b.maintenance - up),
      failChance: Math.max(0.01, b.failChance - up * 0.01),
      deadlineEfficiency: 1 + up * 0.03
    };
  }
}

class Job {
  constructor(data) {
    Object.assign(this, data);
    this.status = 'waiting';
    this.progress = 0;
    this.assignedPrinterId = null;
    this.totalMinutes = data.requiredTime;
    this.remainingMinutes = data.requiredTime;
    this.createdAtDay = 0;
  }
}

class Location {
  constructor(cfg) { Object.assign(this, cfg); }
}

class Upgrade {
  constructor(id, cfg) {
    this.id = id;
    Object.assign(this, cfg);
    this.purchased = false;
  }
}

class SaveManager {
  static key = 'miniPrintFarmTycoonSaveV1';
  static save(game) {
    localStorage.setItem(this.key, JSON.stringify(game.serialize()));
  }
  static load() {
    const raw = localStorage.getItem(this.key);
    return raw ? JSON.parse(raw) : null;
  }
  static clear() { localStorage.removeItem(this.key); }
}

class GameState {
  constructor() {
    this.printerCatalog = [
      { name: 'P1S', tier: 1, cost: 520, speed: 58, reliability: 80, quality: 62, complexity: 56, maxSize: 58, multicolor: 40, maintenance: 12, failChance: 0.07, spriteScale: 1 },
      { name: 'X1C', tier: 2, cost: 980, speed: 72, reliability: 84, quality: 78, complexity: 74, maxSize: 58, multicolor: 74, maintenance: 14, failChance: 0.055, spriteScale: 1.08 },
      { name: 'P2S', tier: 3, cost: 1250, speed: 76, reliability: 90, quality: 75, complexity: 76, maxSize: 60, multicolor: 82, maintenance: 13, failChance: 0.04, spriteScale: 1.1 },
      { name: 'H2D', tier: 4, cost: 2150, speed: 84, reliability: 86, quality: 83, complexity: 84, maxSize: 95, multicolor: 88, maintenance: 19, failChance: 0.05, spriteScale: 1.2 },
      { name: 'H2C', tier: 5, cost: 2600, speed: 82, reliability: 88, quality: 88, complexity: 92, maxSize: 90, multicolor: 98, maintenance: 22, failChance: 0.045, spriteScale: 1.24 }
    ];

    this.locations = [
      new Location({ id: 'dorm', name: 'Dorm Room', unlockCost: 0, requiredPrinters: 0, capacity: 4, jobTier: 1, bonus: { payout: 1, failMod: 1.04 }, theme: 'cramped hobby setup' }),
      new Location({ id: 'office', name: 'Office', unlockCost: 4500, requiredPrinters: 5, capacity: 9, jobTier: 2, bonus: { payout: 1.15, failMod: 0.94 }, theme: 'professional workshop' }),
      new Location({ id: 'warehouse', name: 'Warehouse', unlockCost: 12000, requiredPrinters: 10, capacity: 16, jobTier: 3, bonus: { payout: 1.35, failMod: 0.88 }, theme: 'industrial print floor' })
    ];

    this.shopUpgrades = [
      new Upgrade('workflow', { name: 'Workflow Optimization', cost: 700, effect: 'Jobs complete 8% faster.', apply: g => g.modifiers.workflow += 0.08 }),
      new Upgrade('jobSlots', { name: 'Additional Listing Slots', cost: 900, effect: '+2 available job slots.', apply: g => g.maxJobListings += 2 }),
      new Upgrade('leadGen', { name: 'Lead Generation', cost: 1100, effect: 'Premium jobs appear more often.', apply: g => g.modifiers.premiumChance += 0.08 }),
      new Upgrade('repShield', { name: 'Reputation Protection', cost: 1400, effect: 'Negative reputation impacts reduced.', apply: g => g.modifiers.repPenaltyReduction += 0.25 }),
      new Upgrade('maintenanceTools', { name: 'Maintenance Tools', cost: 1000, effect: 'Printer failure chance reduced.', apply: g => g.modifiers.failReduction += 0.015 }),
      new Upgrade('recovery', { name: 'Failure Recovery Kit', cost: 1200, effect: 'Restarts lose less time.', apply: g => g.modifiers.restartTimePenalty -= 0.08 }),
      new Upgrade('scheduler', { name: 'Scheduling Console', cost: 1000, effect: 'Deadline pressure has less impact.', apply: g => g.modifiers.deadlineStressReduction += 0.2 })
    ];

    this.reset();
  }

  reset() {
    this.money = 750;
    this.reputation = 50;
    this.day = 1;
    this.minutes = 8 * 60;
    this.printers = [];
    this.jobsAvailable = [];
    this.jobsAccepted = [];
    this.nextPrinterId = 1;
    this.nextJobId = 1;
    this.currentLocationId = 'dorm';
    this.unlockedLocations = ['dorm'];
    this.eventFeed = ['Welcome to your Dorm Room print startup.'];
    this.maxJobListings = 5;
    this.modifiers = {
      workflow: 0,
      premiumChance: 0,
      repPenaltyReduction: 0,
      failReduction: 0,
      restartTimePenalty: 0,
      deadlineStressReduction: 0
    };
    this.successStreak = 0;
    this.lastRejections = 0;
    this.firstLoadSeen = false;
    this.refillJobs();
  }

  get location() { return this.locations.find(l => l.id === this.currentLocationId); }
  get activeJobsCount() { return this.jobsAccepted.filter(j => j.status === 'printing' || j.status === 'waiting').length; }

  addLog(msg) {
    this.eventFeed.unshift(`[Day ${this.day} ${this.timeString}] ${msg}`);
    this.eventFeed = this.eventFeed.slice(0, 120);
  }

  get timeString() {
    const h = Math.floor(this.minutes / 60) % 24;
    const m = this.minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  buyPrinter(modelName) {
    if (this.printers.length >= this.location.capacity) return 'Capacity reached for current location.';
    const model = this.printerCatalog.find(p => p.name === modelName);
    if (!model || this.money < model.cost) return 'Not enough money.';
    this.money -= model.cost;
    this.printers.push(new Printer(this.nextPrinterId++, model));
    this.addLog(`${model.name} added to your farm.`);
    return null;
  }

  upgradePrinter(id) {
    const p = this.printers.find(x => x.id === id);
    if (!p) return 'Printer missing.';
    const cost = Math.round(220 * (p.upgradeLevel + 1) * (1 + p.model.tier * 0.4));
    if (this.money < cost) return 'Not enough money.';
    this.money -= cost;
    p.upgradeLevel += 1;
    this.addLog(`${p.name} upgraded to Mk.${p.upgradeLevel}.`);
    return null;
  }

  buyShopUpgrade(id) {
    const up = this.shopUpgrades.find(u => u.id === id);
    if (!up || up.purchased) return 'Unavailable.';
    if (this.money < up.cost) return 'Not enough money.';
    this.money -= up.cost;
    up.purchased = true;
    up.apply(this);
    this.addLog(`Business upgrade purchased: ${up.name}.`);
    return null;
  }

  unlockLocation(id) {
    const loc = this.locations.find(l => l.id === id);
    if (!loc || this.unlockedLocations.includes(id)) return 'Unavailable.';
    if (this.money < loc.unlockCost) return 'Not enough money.';
    if (this.printers.length < loc.requiredPrinters) return `Requires ${loc.requiredPrinters} printers.`;
    this.money -= loc.unlockCost;
    this.unlockedLocations.push(id);
    this.currentLocationId = id;
    this.addLog(`${loc.name} unlocked.`);
    return null;
  }

  moveLocation(id) {
    if (!this.unlockedLocations.includes(id)) return 'Location locked.';
    this.currentLocationId = id;
    this.addLog(`Moved operations to ${this.location.name}.`);
    return null;
  }

  rejectJob(jobId) {
    this.jobsAvailable = this.jobsAvailable.filter(j => j.id !== jobId);
    this.lastRejections += 1;
    if (this.lastRejections % 3 === 0) this.adjustRep(-1);
    this.refillJobs();
  }

  acceptJob(jobId) {
    const idx = this.jobsAvailable.findIndex(j => j.id === jobId);
    if (idx < 0) return;
    const [job] = this.jobsAvailable.splice(idx, 1);
    job.createdAtDay = this.day;
    this.jobsAccepted.push(job);
    this.addLog(`Accepted job: ${job.title}.`);
    this.refillJobs();
  }

  assignJob(jobId, printerId) {
    const job = this.jobsAccepted.find(j => j.id === jobId);
    const printer = this.printers.find(p => p.id === printerId);
    if (!job || !printer || printer.status !== 'idle' || job.status !== 'waiting') return 'Invalid assignment.';
    const s = printer.statBlock;
    if (s.maxSize < job.sizeRequirement || s.complexity < job.complexityRequirement) return 'Printer cannot handle this job.';
    job.assignedPrinterId = printerId;
    job.status = 'printing';
    printer.status = 'printing';
    printer.currentJobId = job.id;
    this.addLog(`Assigned ${job.title} to ${printer.name}.`);
    return null;
  }

  forfeitJob(jobId) {
    const job = this.jobsAccepted.find(j => j.id === jobId);
    if (!job || ['completed', 'forfeited', 'missed deadline'].includes(job.status)) return;
    job.status = 'forfeited';
    this.releasePrinter(job.assignedPrinterId);
    this.adjustRep(-Math.round(4 * (1 - this.modifiers.repPenaltyReduction)));
    this.addLog(`Forfeited job: ${job.title}.`);
  }

  restartJob(jobId) {
    const job = this.jobsAccepted.find(j => j.id === jobId);
    if (!job || job.status !== 'failed') return;
    if (job.deadlineMinutes <= 25) {
      this.forfeitJob(jobId);
      return;
    }
    const penalty = 0.22 + this.modifiers.restartTimePenalty;
    job.remainingMinutes = Math.ceil(job.totalMinutes * (1 - penalty));
    job.progress = (1 - job.remainingMinutes / job.totalMinutes) * 100;
    job.status = 'printing';
    const p = this.printers.find(x => x.id === job.assignedPrinterId);
    if (p) { p.status = 'printing'; p.currentJobId = job.id; }
    this.addLog(`Restarted failed job: ${job.title}.`);
  }

  releasePrinter(printerId) {
    const p = this.printers.find(x => x.id === printerId);
    if (p) { p.status = 'idle'; p.currentJobId = null; }
  }

  updateTick(deltaMinutes = 1) {
    this.minutes += deltaMinutes;
    while (this.minutes >= 24 * 60) {
      this.minutes -= 24 * 60;
      this.day += 1;
    }

    this.jobsAccepted.forEach(job => {
      if (['completed', 'forfeited', 'missed deadline'].includes(job.status)) return;
      job.deadlineMinutes -= deltaMinutes;
      if (job.deadlineMinutes <= 0 && job.status !== 'completed') {
        job.status = 'missed deadline';
        this.releasePrinter(job.assignedPrinterId);
        this.adjustRep(-Math.round((6 + job.difficulty) * (1 - this.modifiers.repPenaltyReduction)));
        this.addLog(`Deadline missed: ${job.title}.`);
        return;
      }
      if (job.status !== 'printing') return;

      const p = this.printers.find(x => x.id === job.assignedPrinterId);
      if (!p) return;
      const s = p.statBlock;
      const speed = (s.speed / 60) * (1 + this.modifiers.workflow) * this.location.bonus.payout / 1.08;
      job.remainingMinutes -= speed * deltaMinutes;
      job.progress = Math.max(0, Math.min(100, 100 * (1 - job.remainingMinutes / job.totalMinutes)));

      const pressure = job.deadlineMinutes < job.remainingMinutes * 0.9 ? 0.025 : 0;
      const difficultyRisk = 0.0025 * job.difficulty + 0.0016 * job.complexity;
      const failChance = Math.max(0.002, (s.failChance + difficultyRisk + pressure * (1 - this.modifiers.deadlineStressReduction) - this.modifiers.failReduction) * this.location.bonus.failMod / Math.max(0.7, s.reliability / 100));
      if (Math.random() < failChance * deltaMinutes) {
        job.status = 'failed';
        this.releasePrinter(job.assignedPrinterId);
        this.adjustRep(-Math.round((2 + job.failureSensitivity) * (1 - this.modifiers.repPenaltyReduction)));
        this.addLog(`Print failed on ${p.name}: ${job.title}.`);
        return;
      }

      if (job.remainingMinutes <= 0) {
        job.status = 'completed';
        this.releasePrinter(job.assignedPrinterId);
        const onTime = job.deadlineMinutes > 0;
        const payout = Math.round(job.payout * this.location.bonus.payout * (onTime ? 1.1 : 0.85));
        this.money += payout;
        const repGain = Math.round((2 + job.difficulty / 2) * (onTime ? 1.2 : 0.5));
        this.adjustRep(repGain);
        this.successStreak += 1;
        if (this.successStreak % 5 === 0) {
          this.adjustRep(2);
          this.addLog('Success streak bonus reputation +2.');
        }
        this.addLog(`Job completed: ${job.title} (+$${payout}).`);
      }
    });

    if (Math.random() < 0.08) this.refillJobs();
  }

  adjustRep(amount) {
    this.reputation = Math.max(0, Math.min(100, this.reputation + amount));
    if (amount < 0) this.successStreak = 0;
  }

  refillJobs() {
    while (this.jobsAvailable.length < this.maxJobListings) this.jobsAvailable.push(this.generateJob());
  }

  generateJob() {
    const categories = ['keychains', 'custom signs', 'stands/display holders', 'cosplay parts', 'engineering prototypes', 'drone components', 'architectural models', 'replacement parts', 'miniatures', 'fixtures/jigs', 'classroom models', 'marketing display pieces'];
    const clients = ['student', 'startup', 'local business', 'engineering team', 'architecture firm', 'event organizer', 'hobby customer', 'manufacturer'];
    const prefix = ['Express', 'Custom', 'Premium', 'Prototype', 'Batch', 'Festival', 'Studio', 'Detail'];

    const locationTier = this.location.jobTier;
    const repTier = this.reputation > 80 ? 3 : this.reputation > 60 ? 2 : 1;
    const printerPower = this.printers.length ? Math.max(...this.printers.map(p => p.model.tier)) : 1;
    const maxTier = Math.min(5, locationTier + repTier + Math.floor(printerPower / 2));
    const premiumChance = 0.08 + this.modifiers.premiumChance + (this.reputation / 200);
    const tier = Math.random() < premiumChance ? maxTier : Math.max(1, maxTier - 2 + Math.floor(Math.random() * 3));

    const category = categories[Math.floor(Math.random() * categories.length)];
    const client = clients[Math.floor(Math.random() * Math.min(clients.length, 3 + locationTier * 2))];
    const complexity = 35 + tier * 11 + Math.floor(Math.random() * 12);
    const sizeRequirement = 40 + tier * 9 + Math.floor(Math.random() * 18);
    const multicolorNeed = Math.max(0, Math.floor((tier - 2) * 14 + Math.random() * 30));
    const difficulty = Math.max(1, Math.min(10, Math.floor(tier * 1.7 + Math.random() * 2)));
    const requiredTime = 45 + tier * 24 + Math.floor(Math.random() * 70);
    const deadlineMinutes = requiredTime + 70 + Math.floor(Math.random() * 180) - tier * 8;
    const payout = Math.round((90 + tier * 70 + difficulty * 16 + multicolorNeed * 1.2) * (0.85 + this.reputation / 170));

    return new Job({
      id: this.nextJobId++,
      title: `${prefix[Math.floor(Math.random() * prefix.length)]} ${category}`,
      clientType: client,
      category,
      difficulty,
      complexity,
      requiredTime,
      deadlineMinutes,
      payout,
      reputationEffect: Math.max(1, Math.floor(difficulty / 2)),
      sizeRequirement,
      colorComplexity: multicolorNeed,
      failureSensitivity: Math.ceil(difficulty / 2),
      complexityRequirement: complexity
    });
  }

  serialize() {
    return {
      money: this.money, reputation: this.reputation, day: this.day, minutes: this.minutes, nextPrinterId: this.nextPrinterId,
      nextJobId: this.nextJobId, currentLocationId: this.currentLocationId, unlockedLocations: this.unlockedLocations,
      eventFeed: this.eventFeed, printers: this.printers, jobsAvailable: this.jobsAvailable, jobsAccepted: this.jobsAccepted,
      maxJobListings: this.maxJobListings, modifiers: this.modifiers, successStreak: this.successStreak, lastRejections: this.lastRejections,
      upgrades: this.shopUpgrades.map(u => ({ id: u.id, purchased: u.purchased })), firstLoadSeen: this.firstLoadSeen
    };
  }

  hydrate(data) {
    this.reset();
    Object.assign(this, data);
    this.printers = data.printers.map(p => Object.assign(new Printer(p.id, this.printerCatalog.find(m => m.name === p.model.name)), p));
    this.jobsAvailable = data.jobsAvailable.map(j => Object.assign(new Job(j), j));
    this.jobsAccepted = data.jobsAccepted.map(j => Object.assign(new Job(j), j));
    this.shopUpgrades.forEach(u => u.purchased = data.upgrades?.find(x => x.id === u.id)?.purchased || false);
  }
}

class Renderer {
  constructor(game) {
    this.g = game;
    this.topStats = document.getElementById('topStats');
    this.repFill = document.getElementById('repFill');
    this.scene = document.getElementById('locationScene');
    this.eventLog = document.getElementById('eventLog');
    this.notice = document.getElementById('autosaveNotice');
    this.tabs = [...document.querySelectorAll('.tab')];
    this.tabs.forEach(btn => btn.addEventListener('click', () => this.switchTab(btn.dataset.tab)));
    this.switchTab('jobs');
  }

  switchTab(tab) {
    this.tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.toggle('active', el.id === `tab-${tab}`));
    this.renderPanels();
  }

  renderAll() {
    this.renderTop();
    this.renderScene();
    this.renderPanels();
    this.renderLog();
  }

  renderTop() {
    const g = this.g;
    const map = [
      ['Money', `$${Math.floor(g.money)}`], ['Location', g.location.name], ['Printers', `${g.printers.length}/${g.location.capacity}`],
      ['Active Jobs', g.activeJobsCount], ['Available Jobs', g.jobsAvailable.length], ['Day/Time', `${g.day} / ${g.timeString}`], ['Rep Tier', g.reputation > 75 ? 'Premium' : g.reputation > 45 ? 'Standard' : 'Risky']
    ];
    this.topStats.innerHTML = map.map(([k, v]) => `<div class="stat"><div class="muted">${k}</div><strong>${v}</strong></div>`).join('');
    this.repFill.style.width = `${g.reputation}%`;
  }

  renderScene() {
    const g = this.g;
    this.scene.innerHTML = `<div class="scene-label">${g.location.name} • ${g.location.theme}</div>`;
    const cols = Math.ceil(Math.sqrt(Math.max(1, g.location.capacity)));
    g.printers.forEach((p, i) => {
      const node = document.createElement('div');
      const x = 12 + (i % cols) * (78 / cols + 8);
      const y = 22 + Math.floor(i / cols) * 14;
      node.className = `printer-node ${p.status === 'printing' ? 'printing' : ''}`;
      node.style.left = `${x}%`;
      node.style.top = `${y}%`;
      node.style.transform = `scale(${p.model.spriteScale})`;
      node.title = `${p.name} #${p.id}\nStatus: ${p.status}\nUpgrade: Mk.${p.upgradeLevel}`;
      this.scene.appendChild(node);
    });
  }

  renderPanels() {
    this.renderJobs();
    this.renderPrinters();
    this.renderUpgrades();
    this.renderLocations();
  }

  renderJobs() {
    const g = this.g;
    const printerOpts = g.printers.map(p => `<option value="${p.id}">#${p.id} ${p.name} (${p.status})</option>`).join('');
    document.getElementById('tab-jobs').innerHTML = `
      <h3>Available Jobs</h3>
      ${g.jobsAvailable.map(j => `<div class="card" title="Complexity ${j.complexityRequirement}, Size ${j.sizeRequirement}, Color ${j.colorComplexity}">
        <h4>${j.title}</h4>
        <div class="row muted"><span>${j.clientType}</span><span>Category: ${j.category}</span></div>
        <div class="row"><span>Diff ${j.difficulty}</span><span>Time ${j.requiredTime}m</span><span>Deadline ${j.deadlineMinutes}m</span></div>
        <div class="row"><strong>$${j.payout}</strong><span class="muted">Size ${j.sizeRequirement} | Complexity ${j.complexityRequirement}</span></div>
        <button class="btn primary" data-act="accept" data-id="${j.id}">Accept</button>
        <button class="btn" data-act="reject" data-id="${j.id}">Reject</button>
      </div>`).join('')}
      <h3>Accepted Jobs</h3>
      ${g.jobsAccepted.slice().reverse().map(j => `
      <div class="card">
        <h4>${j.title} <span class="muted">[${j.status}]</span></h4>
        <div class="row"><span>Payout: $${j.payout}</span><span>Deadline: ${Math.max(0, Math.ceil(j.deadlineMinutes))}m</span></div>
        <div class="progress"><div style="width:${j.progress}%"></div></div>
        <div class="row muted"><span>Assigned: ${j.assignedPrinterId ? '#' + j.assignedPrinterId : 'none'}</span><span>Remaining: ${Math.max(0, Math.ceil(j.remainingMinutes))}m</span></div>
        ${j.status === 'waiting' ? `<select data-act="pickPrinter" data-id="${j.id}">${printerOpts}</select><button class="btn" data-act="assign" data-id="${j.id}">Assign</button>` : ''}
        ${j.status === 'failed' ? `<button class="btn primary" data-act="restart" data-id="${j.id}">Restart</button>` : ''}
        ${['completed', 'forfeited', 'missed deadline'].includes(j.status) ? '' : `<button class="btn danger" data-act="forfeit" data-id="${j.id}">Forfeit</button>`}
      </div>`).join('')}
    `;
  }

  renderPrinters() {
    const g = this.g;
    document.getElementById('tab-printers').innerHTML = `
      <h3>Printer Shop</h3>
      ${g.printerCatalog.map(model => `<div class="card" title="Tier ${model.tier} | Speed ${model.speed} | Reliability ${model.reliability}">
        <h4>${model.name}</h4>
        <div class="row muted"><span>Tier ${model.tier}</span><span>Cost: $${model.cost}</span></div>
        <div class="row"><span>Quality ${model.quality}</span><span>Complexity ${model.complexity}</span><span>Max Size ${model.maxSize}</span></div>
        <div class="row"><span>Multi-color ${model.multicolor}</span><span>Failure ${Math.round(model.failChance * 100)}%</span></div>
        <button class="btn primary" data-act="buyPrinter" data-name="${model.name}">Buy ${model.name}</button>
      </div>`).join('')}
      <h3>Owned Printers</h3>
      ${g.printers.map(p => {
        const upCost = Math.round(220 * (p.upgradeLevel + 1) * (1 + p.model.tier * 0.4));
        const s = p.statBlock;
        return `<div class="card" title="Speed ${s.speed.toFixed(1)}, Reliability ${s.reliability}, Complexity ${s.complexity}">
          <h4>#${p.id} ${p.name} <span class="muted">${p.status}</span></h4>
          <div class="row"><span>Mk.${p.upgradeLevel}</span><span>Fail ${Math.round(s.failChance * 100)}%</span><span>Quality ${s.quality}</span></div>
          <button class="btn" data-act="upgradePrinter" data-id="${p.id}">Upgrade ($${upCost})</button>
        </div>`;
      }).join('')}
    `;
  }

  renderUpgrades() {
    const g = this.g;
    document.getElementById('tab-upgrades').innerHTML = `
      <h3>Business Upgrades</h3>
      ${g.shopUpgrades.map(u => `<div class="card">
        <h4>${u.name}</h4><div class="muted">${u.effect}</div>
        <div class="row"><span>Cost: $${u.cost}</span><span>${u.purchased ? 'Purchased' : 'Available'}</span></div>
        <button class="btn ${u.purchased ? '' : 'primary'}" data-act="buyUpgrade" data-id="${u.id}" ${u.purchased ? 'disabled' : ''}>${u.purchased ? 'Owned' : 'Purchase'}</button>
      </div>`).join('')}
    `;
  }

  renderLocations() {
    const g = this.g;
    document.getElementById('tab-locations').innerHTML = `
      <h3>Locations</h3>
      ${g.locations.map(l => {
        const unlocked = g.unlockedLocations.includes(l.id);
        return `<div class="card" title="${l.theme}">
          <h4>${l.name} ${g.currentLocationId === l.id ? '(Current)' : ''}</h4>
          <div class="row"><span>Capacity ${l.capacity}</span><span>Tier ${l.jobTier}</span></div>
          <div class="row muted"><span>Unlock $${l.unlockCost}</span><span>Needs ${l.requiredPrinters} printers</span></div>
          <div class="muted">Payout x${l.bonus.payout} • Failure modifier x${l.bonus.failMod}</div>
          ${unlocked ? `<button class="btn" data-act="moveLocation" data-id="${l.id}" ${g.currentLocationId === l.id ? 'disabled' : ''}>Move Here</button>` : `<button class="btn primary" data-act="unlockLocation" data-id="${l.id}">Unlock</button>`}
        </div>`;
      }).join('')}
    `;
  }

  renderLog() {
    this.eventLog.innerHTML = this.g.eventFeed.map(e => `<div class="log-item">${e}</div>`).join('');
  }
}

const game = new GameState();
const loaded = SaveManager.load();
if (loaded) game.hydrate(loaded);
const renderer = new Renderer(game);
renderer.renderAll();

function bindActions() {
  document.body.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const id = Number(b.dataset.id);
    let err = null;
    if (act === 'accept') game.acceptJob(id);
    if (act === 'reject') game.rejectJob(id);
    if (act === 'assign') {
      const pick = document.querySelector(`select[data-act='pickPrinter'][data-id='${id}']`);
      err = game.assignJob(id, Number(pick?.value));
    }
    if (act === 'forfeit') game.forfeitJob(id);
    if (act === 'restart') game.restartJob(id);
    if (act === 'buyPrinter') err = game.buyPrinter(b.dataset.name);
    if (act === 'upgradePrinter') err = game.upgradePrinter(id);
    if (act === 'buyUpgrade') err = game.buyShopUpgrade(b.dataset.id);
    if (act === 'unlockLocation') err = game.unlockLocation(b.dataset.id);
    if (act === 'moveLocation') err = game.moveLocation(b.dataset.id);
    if (err) game.addLog(`Action blocked: ${err}`);
    renderer.renderAll();
  });
}
bindActions();

setInterval(() => {
  game.updateTick(1);
  renderer.renderAll();
}, 1000);

setInterval(() => {
  SaveManager.save(game);
  renderer.notice.textContent = `Autosaved • Day ${game.day} ${game.timeString}`;
  setTimeout(() => renderer.notice.textContent = 'Autosave ready', 800);
}, 10000);

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset game and clear save?')) return;
  SaveManager.clear();
  game.reset();
  renderer.renderAll();
});

const tutorialModal = document.getElementById('tutorialModal');
if (!game.firstLoadSeen) tutorialModal.classList.remove('hidden');
document.getElementById('closeTutorialBtn').addEventListener('click', () => {
  tutorialModal.classList.add('hidden');
  game.firstLoadSeen = true;
  SaveManager.save(game);
});
