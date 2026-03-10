class Printer {
  constructor(id, model) {
    this.id = id;
    this.model = model;
    this.name = model.name;
    this.status = 'idle'; // idle, printing, paused, failed, ready
    this.currentJobId = null;
    this.upgradeLevel = 0;
    this.condition = 100;
    this.completedBuffer = 0;
  }

  get statBlock() {
    const b = this.model;
    const up = this.upgradeLevel;
    const condFactor = 0.85 + (this.condition / 100) * 0.2;
    return {
      speed: b.speed * (1 + up * 0.09) * condFactor,
      reliability: Math.min(99, b.reliability + up * 3 + Math.floor(this.condition / 20)),
      quality: b.quality + up * 2,
      complexity: b.complexity + up * 2,
      maxSize: b.maxSize + up * 4,
      multicolor: b.multicolor + up * 2,
      failChance: Math.max(0.0001, b.failChance - up * 0.00003 + (100 - this.condition) / 90000),
      healthState: this.condition > 74 ? 'Excellent' : this.condition > 45 ? 'Stable' : 'Needs maintenance'
    };
  }
}

class Job {
  constructor(data) {
    Object.assign(this, data);
    this.status = 'available';
    this.progress = 0;
    this.assignedPrinterId = null;
    this.totalMinutes = data.requiredTime;
    this.remainingMinutes = data.requiredTime;
    this.createdAtDay = 0;
    this.failureChanceHint = data.failureChanceHint || 'Low';
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
  static key = 'miniPrintFarmTycoonSaveV2';
  static save(game) { localStorage.setItem(this.key, JSON.stringify(game.serialize())); }
  static load() {
    const raw = localStorage.getItem(this.key);
    return raw ? JSON.parse(raw) : null;
  }
  static clear() { localStorage.removeItem(this.key); }
}

class GameState {
  constructor() {
    // Ordered best to worst for economy, while preserving specialization.
    this.printerCatalog = [
      { name: 'H2C', tier: 5, cost: 3200, speed: 93, reliability: 94, quality: 95, complexity: 98, maxSize: 94, multicolor: 99, failChance: 0.00018, spriteScale: 1.2, specialty: 'Advanced multi-material specialist' },
      { name: 'H2D', tier: 4, cost: 2800, speed: 95, reliability: 93, quality: 89, complexity: 91, maxSize: 100, multicolor: 90, failChance: 0.00022, spriteScale: 1.24, specialty: 'Large-format production powerhouse' },
      { name: 'P2S', tier: 3, cost: 1680, speed: 84, reliability: 95, quality: 83, complexity: 84, maxSize: 68, multicolor: 86, failChance: 0.0002, spriteScale: 1.12, specialty: 'Reliability/value upper-tier workhorse' },
      { name: 'X1C', tier: 2, cost: 1260, speed: 82, reliability: 91, quality: 90, complexity: 86, maxSize: 66, multicolor: 88, failChance: 0.00028, spriteScale: 1.1, specialty: 'Precision + smart detail jobs' },
      { name: 'P1S', tier: 1, cost: 520, speed: 72, reliability: 88, quality: 68, complexity: 63, maxSize: 62, multicolor: 48, failChance: 0.00035, spriteScale: 1, specialty: 'Best affordable starter farm unit' }
    ];

    this.locations = [
      new Location({ id: 'dorm', name: 'Dorm Room', unlockCost: 0, requiredPrinters: 0, capacity: 4, jobTier: 1, bonus: { payout: 1, failMod: 1.04 }, theme: 'scrappy startup desk, spools and boxes' }),
      new Location({ id: 'office', name: 'Office', unlockCost: 5000, requiredPrinters: 5, capacity: 10, jobTier: 2, bonus: { payout: 1.18, failMod: 0.95 }, theme: 'organized startup workshop with shelves' }),
      new Location({ id: 'warehouse', name: 'Warehouse', unlockCost: 13000, requiredPrinters: 10, capacity: 18, jobTier: 3, bonus: { payout: 1.35, failMod: 0.88 }, theme: 'industrial farm lanes and heavy fixtures' })
    ];

    this.shopUpgrades = [
      new Upgrade('workflow', { name: 'Workflow Optimization', cost: 700, effect: '+10% print throughput', apply: g => g.modifiers.workflow += 0.1 }),
      new Upgrade('slots', { name: 'Lead List Expansion', cost: 900, effect: '+2 available job slots', apply: g => g.maxJobListings += 2 }),
      new Upgrade('leads', { name: 'Premium Lead Generation', cost: 1200, effect: 'Higher premium job chance', apply: g => g.modifiers.premiumChance += 0.1 }),
      new Upgrade('repShield', { name: 'Client Relations Shield', cost: 1300, effect: '-25% reputation penalties', apply: g => g.modifiers.repPenaltyReduction += 0.25 }),
      new Upgrade('maintenanceTools', { name: 'Maintenance Tool Crate', cost: 950, effect: 'Global failure chance reduction', apply: g => g.modifiers.failReduction += 0.012 }),
      new Upgrade('recovery', { name: 'Failure Recovery SOP', cost: 1200, effect: 'Restarts lose less time', apply: g => g.modifiers.restartTimePenalty -= 0.1 }),
      new Upgrade('scheduler', { name: 'Scheduling Dashboard', cost: 950, effect: 'Lower deadline stress effect', apply: g => g.modifiers.deadlineStressReduction += 0.25 })
    ];

    this.reset();
  }

  reset() {
    this.money = 820;
    this.reputation = 50;
    this.day = 1;
    this.minutes = 8 * 60;
    this.printers = [];
    this.jobsAvailable = [];
    this.jobsAccepted = [];
    this.jobsHistory = [];
    this.nextPrinterId = 1;
    this.nextJobId = 1;
    this.currentLocationId = 'dorm';
    this.unlockedLocations = ['dorm'];
    this.eventFeed = ['Operations online. Buy your first P1S and start with Tier 1 jobs.'];
    this.maxJobListings = 6;
    this.modifiers = { workflow: 0, premiumChance: 0, repPenaltyReduction: 0, failReduction: 0, restartTimePenalty: 0, deadlineStressReduction: 0 };
    this.successStreak = 0;
    this.rejectionCounter = 0;
    this.firstLoadSeen = false;
    this.selectedPrinterId = null;
    this.refillJobs();
  }

  get location() { return this.locations.find(x => x.id === this.currentLocationId); }
  get timeString() {
    const h = Math.floor(this.minutes / 60) % 24;
    const m = Math.floor(this.minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  addLog(text) {
    this.eventFeed.unshift(`[D${this.day} ${this.timeString}] ${text}`);
    this.eventFeed = this.eventFeed.slice(0, 140);
  }

  adjustRep(amount) {
    this.reputation = Math.max(0, Math.min(100, this.reputation + amount));
    if (amount < 0) this.successStreak = 0;
  }

  highestPrinterTier() {
    return this.printers.length ? Math.max(...this.printers.map(p => p.model.tier + Math.floor(p.upgradeLevel / 2))) : 1;
  }

  affordableModels() {
    return this.printerCatalog.filter(m => this.money >= m.cost);
  }

  buyPrinter(name) {
    if (this.printers.length >= this.location.capacity) return 'Location capacity reached.';
    const model = this.printerCatalog.find(m => m.name === name);
    if (!model) return 'Unknown printer model.';
    if (this.money < model.cost) return 'Not enough money.';
    this.money -= model.cost;
    this.printers.push(new Printer(this.nextPrinterId++, model));
    this.addLog(`${model.name} installed on the floor.`);
    return null;
  }

  upgradePrinter(id) {
    const p = this.printers.find(x => x.id === id);
    if (!p) return 'Printer not found.';
    const cost = Math.round(250 * (p.upgradeLevel + 1) * (1 + p.model.tier * 0.35));
    if (this.money < cost) return 'Not enough money.';
    this.money -= cost;
    p.upgradeLevel += 1;
    p.condition = Math.min(100, p.condition + 8);
    this.addLog(`${p.name} #${p.id} upgraded to Mk.${p.upgradeLevel}.`);
    return null;
  }

  maintainPrinter(id) {
    const p = this.printers.find(x => x.id === id);
    if (!p) return 'Printer not found.';
    const cost = Math.round(40 + (100 - p.condition) * 2.2 + p.model.tier * 6);
    if (this.money < cost) return 'Not enough money.';
    this.money -= cost;
    p.condition = Math.min(100, p.condition + 28);
    this.addLog(`Maintenance complete on ${p.name} #${p.id}.`);
    return null;
  }

  pausePrinter(id) {
    const p = this.printers.find(x => x.id === id);
    if (!p || p.status !== 'printing') return 'Printer is not actively printing.';
    p.status = 'paused';
    const job = this.jobsAccepted.find(j => j.id === p.currentJobId);
    if (job) job.status = 'paused';
    this.addLog(`${p.name} #${p.id} paused.`);
    return null;
  }

  resumePrinter(id) {
    const p = this.printers.find(x => x.id === id);
    if (!p || p.status !== 'paused') return 'Printer is not paused.';
    p.status = 'printing';
    const job = this.jobsAccepted.find(j => j.id === p.currentJobId);
    if (job) job.status = 'printing';
    this.addLog(`${p.name} #${p.id} resumed.`);
    return null;
  }

  cancelPrinterJob(id) {
    const p = this.printers.find(x => x.id === id);
    if (!p || !p.currentJobId) return 'No assigned job.';
    this.forfeitJob(p.currentJobId, true);
    return null;
  }

  buyShopUpgrade(id) {
    const up = this.shopUpgrades.find(u => u.id === id);
    if (!up || up.purchased) return 'Upgrade unavailable.';
    if (this.money < up.cost) return 'Not enough money.';
    this.money -= up.cost;
    up.purchased = true;
    up.apply(this);
    this.addLog(`Business upgrade installed: ${up.name}.`);
    return null;
  }

  unlockLocation(id) {
    const loc = this.locations.find(l => l.id === id);
    if (!loc || this.unlockedLocations.includes(id)) return 'Location unavailable.';
    if (this.printers.length < loc.requiredPrinters) return `Needs ${loc.requiredPrinters} printers.`;
    if (this.money < loc.unlockCost) return 'Not enough money.';
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

  rejectJob(id) {
    const before = this.jobsAvailable.length;
    this.jobsAvailable = this.jobsAvailable.filter(j => j.id !== id);
    if (before === this.jobsAvailable.length) return;
    this.rejectionCounter += 1;
    if (this.day <= 2) {
      if (this.rejectionCounter % 6 === 0) this.adjustRep(-1);
    } else if (this.rejectionCounter % 4 === 0) {
      this.adjustRep(-1);
    }
    this.refillJobs();
  }

  acceptJob(id) {
    const idx = this.jobsAvailable.findIndex(j => j.id === id);
    if (idx < 0) return;
    const [job] = this.jobsAvailable.splice(idx, 1);
    job.status = 'accepted';
    job.createdAtDay = this.day;
    this.jobsAccepted.push(job);
    this.addLog(`Accepted: ${job.title} (${job.recommendedPrinter}).`);
    this.refillJobs();
  }

  assignJob(jobId, printerId) {
    const job = this.jobsAccepted.find(j => j.id === jobId);
    const printer = this.printers.find(p => p.id === printerId);
    if (!job || !printer || !['idle', 'ready'].includes(printer.status) || job.status !== 'accepted') return 'Invalid assignment.';
    const s = printer.statBlock;
    if (s.maxSize < job.sizeRequirement || s.complexity < job.complexityRequirement) return 'Printer cannot handle job size/complexity.';
    if (s.multicolor < job.colorComplexity) return 'Printer multicolor capability too low.';
    job.assignedPrinterId = printerId;
    job.status = 'printing';
    job.failureChanceHint = this.estimateFailureRisk(job, printer).label;
    printer.status = 'printing';
    printer.currentJobId = job.id;
    printer.completedBuffer = 0;
    this.addLog(`${job.title} assigned to ${printer.name} #${printer.id}.`);
    return null;
  }

  forfeitJob(jobId, fromCancel = false) {
    const job = this.jobsAccepted.find(j => j.id === jobId);
    if (!job || ['completed', 'forfeited', 'missed deadline'].includes(job.status)) return;
    const printer = this.printers.find(p => p.id === job.assignedPrinterId);
    if (printer) {
      printer.status = 'idle';
      printer.currentJobId = null;
    }
    job.status = 'forfeited';
    this.jobsHistory.unshift({ ...job });
    this.jobsAccepted = this.jobsAccepted.filter(j => j.id !== job.id);
    this.adjustRep(-Math.max(1, Math.round((3 + job.difficulty / 2) * (1 - this.modifiers.repPenaltyReduction))));
    this.addLog(`${fromCancel ? 'Canceled' : 'Forfeited'} job: ${job.title}.`);
  }

  restartJob(jobId) {
    const job = this.jobsAccepted.find(j => j.id === jobId);
    if (!job || job.status !== 'failed') return;
    if (job.deadlineMinutes <= 20) return this.forfeitJob(jobId);
    const penalty = Math.max(0.1, 0.28 + this.modifiers.restartTimePenalty);
    job.remainingMinutes = Math.ceil(job.totalMinutes * (1 - penalty));
    job.progress = 100 - (job.remainingMinutes / job.totalMinutes) * 100;
    job.status = 'printing';
    const p = this.printers.find(x => x.id === job.assignedPrinterId);
    if (p) p.status = 'printing';
    this.addLog(`Restarted failed print: ${job.title}.`);
  }

  inspectPrinter(id) {
    const p = this.printers.find(x => x.id === id);
    if (!p) return;
    const load = p.currentJobId ? this.jobsAccepted.find(j => j.id === p.currentJobId)?.title || 'assigned job' : 'no job';
    this.addLog(`Inspection ${p.name} #${p.id}: ${p.statBlock.healthState}, ${load}.`);
  }

  updateTick(delta = 1) {
    this.minutes += delta;
    while (this.minutes >= 1440) {
      this.minutes -= 1440;
      this.day += 1;
      this.printers.forEach(p => p.condition = Math.max(30, p.condition - 1));
    }

    this.jobsAccepted.forEach(job => {
      job.deadlineMinutes -= delta;
      if (job.deadlineMinutes <= 0 && !['completed', 'forfeited', 'missed deadline'].includes(job.status)) {
        job.status = 'missed deadline';
        const p = this.printers.find(x => x.id === job.assignedPrinterId);
        if (p) { p.status = 'idle'; p.currentJobId = null; }
        this.jobsHistory.unshift({ ...job });
        this.jobsAccepted = this.jobsAccepted.filter(j => j.id !== job.id);
        this.adjustRep(-Math.max(2, Math.round((5 + job.difficulty) * (1 - this.modifiers.repPenaltyReduction))));
        this.addLog(`Deadline missed: ${job.title}.`);
        return;
      }

      if (job.status !== 'printing') return;
      const p = this.printers.find(x => x.id === job.assignedPrinterId);
      if (!p) return;
      const s = p.statBlock;

      const speed = (s.speed / 65) * (1 + this.modifiers.workflow) * (1 + p.upgradeLevel * 0.02);
      job.remainingMinutes -= speed * delta;
      job.progress = Math.max(0, Math.min(100, 100 - (job.remainingMinutes / job.totalMinutes) * 100));

      p.condition = Math.max(15, p.condition - 0.05 * (1 + job.difficulty * 0.1));

      const risk = this.estimateFailureRisk(job, p).perMinute;

      if (Math.random() < risk * delta) {
        job.status = 'failed';
        p.status = 'failed';
        this.adjustRep(-Math.max(1, Math.round((1.5 + job.failureSensitivity) * (1 - this.modifiers.repPenaltyReduction))));
        this.addLog(`Print failed on ${p.name} #${p.id}: ${job.title}.`);
        return;
      }

      if (job.remainingMinutes <= 0) {
        job.status = 'completed';
        p.status = 'ready';
        p.completedBuffer = 20;
        const onTime = job.deadlineMinutes > 0;
        const payout = Math.round(job.payout * this.location.bonus.payout * (onTime ? 1.1 : 0.88));
        this.money += payout;
        const repGain = Math.round((2 + job.difficulty * 0.55) * (onTime ? 1.1 : 0.7));
        this.adjustRep(repGain);
        this.successStreak += 1;
        if (this.successStreak > 0 && this.successStreak % 4 === 0) {
          this.adjustRep(2);
          this.addLog('Client streak bonus: +2 reputation.');
        }
        this.jobsHistory.unshift({ ...job });
        this.jobsAccepted = this.jobsAccepted.filter(j => j.id !== job.id);
        p.currentJobId = null;
        this.addLog(`Delivered: ${job.title} (+$${payout}).`);
      }
    });

    this.printers.forEach(p => {
      if (p.status === 'ready') {
        p.completedBuffer -= delta;
        if (p.completedBuffer <= 0) p.status = 'idle';
      }
      if (p.status === 'failed' && Math.random() < 0.08) p.status = 'idle';
    });

    if (Math.random() < 0.12) this.refillJobs();
  }

  estimateFailureRisk(job, printer) {
    const s = printer.statBlock;
    const tierCapacity = printer.model.tier * 2 + 1;
    const diffGap = Math.max(0, job.difficulty - tierCapacity);
    const complexityGap = Math.max(0, job.complexityRequirement - s.complexity);
    const sizeGap = Math.max(0, job.sizeRequirement - s.maxSize);
    const colorGap = Math.max(0, job.colorComplexity - s.multicolor);
    const conditionPenalty = ((100 - printer.condition) / 100) * 0.0024;
    const mismatchPenalty = diffGap * 0.00045 + complexityGap * 0.00011 + sizeGap * 0.00012 + colorGap * 0.0001;
    const tightDeadline = job.deadlineMinutes < job.remainingMinutes * 0.65 ? 0.0018 : job.deadlineMinutes < job.remainingMinutes * 0.9 ? 0.0007 : 0;
    const overclockPenalty = Math.max(0, printer.upgradeLevel - 2) * 0.00035;
    const reliabilityReduction = (s.reliability - 80) * 0.00001;

    const perMinute = Math.max(0.00015,
      (s.failChance + conditionPenalty + mismatchPenalty + tightDeadline * (1 - this.modifiers.deadlineStressReduction) + overclockPenalty - reliabilityReduction - this.modifiers.failReduction * 0.4)
      * this.location.bonus.failMod
    );

    const minutes = Math.max(1, Math.ceil(job.remainingMinutes));
    const jobChance = 1 - Math.pow(1 - Math.min(0.08, perMinute), minutes);
    const pct = Math.round(jobChance * 100);
    const label = pct < 8 ? 'Low' : pct < 16 ? 'Moderate' : 'High';
    return { perMinute, jobChance, percent: pct, label };
  }

  projectedRiskForJob(job) {
    const suitable = this.printers
      .filter(p => ['idle', 'ready', 'printing', 'paused', 'failed'].includes(p.status))
      .filter(p => p.statBlock.maxSize >= job.sizeRequirement && p.statBlock.complexity >= job.complexityRequirement && p.statBlock.multicolor >= job.colorComplexity)
      .sort((a, b) => b.statBlock.reliability - a.statBlock.reliability);

    const target = suitable[0] || this.printers.sort((a, b) => b.statBlock.reliability - a.statBlock.reliability)[0];
    if (!target) return { label: job.failureChanceHint || 'Moderate', percent: 12 };
    return this.estimateFailureRisk(job, target);
  }

  refillJobs() {
    while (this.jobsAvailable.length < this.maxJobListings) {
      const job = this.generateJob();
      job.status = 'available';
      this.jobsAvailable.push(job);
    }
  }

  recommendedPrinterForTier(tier) {
    if (tier <= 1) return 'P1S';
    if (tier === 2) return 'X1C / P2S';
    if (tier === 3) return 'P2S / X1C';
    if (tier === 4) return 'H2D';
    return 'H2C / H2D';
  }

  generateJob() {
    const tierDefs = {
      1: {
        categories: ['keychains', 'simple holders', 'cable clips', 'basic stands', 'desk organizers', 'small gifts', 'simple brackets', 'name tags'],
        clients: ['student', 'hobby customer', 'local business'],
        prefixes: ['Quick', 'Starter', 'Campus', 'Basic', 'Simple'],
        diff: [1, 3], size: [36, 58], complexity: [30, 62], colors: [0, 42], time: [35, 95], deadlineBonus: [110, 260], payout: [80, 240], rep: [1, 2], risk: 'Low'
      },
      2: {
        categories: ['custom signs', 'display holders', 'replacement knobs', 'event badges', 'camera mounts', 'storage bins'],
        clients: ['startup', 'local business', 'event organizer', 'classroom team'],
        prefixes: ['Client', 'Studio', 'Batch', 'Custom', 'Branded'],
        diff: [3, 5], size: [50, 70], complexity: [48, 76], colors: [20, 62], time: [70, 150], deadlineBonus: [95, 220], payout: [190, 460], rep: [2, 3], risk: 'Moderate'
      },
      3: {
        categories: ['miniatures', 'cosplay parts', 'fixtures/jigs', 'drone components', 'classroom models'],
        clients: ['startup', 'engineering team', 'event organizer', 'architecture firm'],
        prefixes: ['Detailed', 'Multi-part', 'Precision', 'Prototype', 'Maker'],
        diff: [5, 7], size: [58, 84], complexity: [66, 90], colors: [30, 82], time: [110, 210], deadlineBonus: [85, 190], payout: [360, 780], rep: [3, 4], risk: 'Elevated'
      },
      4: {
        categories: ['engineering prototypes', 'architectural models', 'marketing display pieces', 'production fixtures'],
        clients: ['engineering team', 'architecture firm', 'manufacturer'],
        prefixes: ['Commercial', 'Engineering', 'Pilot Run', 'Rigorous', 'Spec'],
        diff: [7, 9], size: [72, 95], complexity: [80, 102], colors: [48, 92], time: [160, 300], deadlineBonus: [70, 170], payout: [700, 1400], rep: [4, 6], risk: 'High'
      },
      5: {
        categories: ['large-format enclosures', 'advanced multi-material assemblies', 'industrial replacement kits', 'high-detail exhibition models'],
        clients: ['manufacturer', 'architecture firm', 'enterprise lab'],
        prefixes: ['Flagship', 'Critical', 'High-end', 'Advanced', 'Enterprise'],
        diff: [9, 10], size: [86, 110], complexity: [94, 115], colors: [65, 105], time: [230, 380], deadlineBonus: [60, 150], payout: [1400, 2600], rep: [6, 8], risk: 'Severe'
      }
    };

    const repGate = this.reputation > 85 ? 5 : this.reputation > 72 ? 4 : this.reputation > 58 ? 3 : this.reputation > 46 ? 2 : 1;
    const printerGate = Math.min(5, this.highestPrinterTier() + (this.printers.length >= 4 ? 1 : 0));
    const locationGate = this.location.jobTier === 1 ? 2 : this.location.jobTier === 2 ? 4 : 5;
    const maxTier = Math.max(1, Math.min(5, repGate, printerGate, locationGate));

    let tier;
    if (this.printers.length <= 1 && this.day <= 2) {
      tier = Math.random() < 0.8 ? 1 : 2;
    } else {
      const premiumRoll = 0.08 + this.modifiers.premiumChance + this.reputation / 240;
      tier = Math.random() < premiumRoll ? maxTier : Math.max(1, maxTier - 1 + Math.floor(Math.random() * 2));
    }

    const d = tierDefs[tier];
    const randRange = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const difficulty = randRange(d.diff);
    const sizeRequirement = randRange(d.size);
    const complexityRequirement = randRange(d.complexity);
    const colorComplexity = randRange(d.colors);
    const requiredTime = randRange(d.time);
    const deadlineMinutes = requiredTime + randRange(d.deadlineBonus);

    const payoutBase = randRange(d.payout);
    const payout = Math.round(payoutBase * (0.95 + this.reputation / 190));

    return new Job({
      id: this.nextJobId++,
      title: `${pick(d.prefixes)} ${pick(d.categories)}`,
      clientType: pick(d.clients),
      category: pick(d.categories),
      difficulty,
      complexity: complexityRequirement,
      requiredTime,
      deadlineMinutes,
      payout,
      reputationEffect: randRange(d.rep),
      sizeRequirement,
      colorComplexity,
      failureSensitivity: Math.ceil(difficulty / 2),
      complexityRequirement,
      recommendedPrinter: this.recommendedPrinterForTier(tier),
      tier,
      failureChanceHint: d.risk
    });
  }

  getAvailablePrintersForJob(jobId) {
    const job = this.jobsAccepted.find(j => j.id === jobId);
    if (!job) return [];
    return this.printers.filter(p => {
      const s = p.statBlock;
      return ['idle', 'ready'].includes(p.status) && s.maxSize >= job.sizeRequirement && s.complexity >= job.complexityRequirement && s.multicolor >= job.colorComplexity;
    });
  }

  serialize() {
    return {
      money: this.money, reputation: this.reputation, day: this.day, minutes: this.minutes,
      printers: this.printers, jobsAvailable: this.jobsAvailable, jobsAccepted: this.jobsAccepted, jobsHistory: this.jobsHistory,
      nextPrinterId: this.nextPrinterId, nextJobId: this.nextJobId, currentLocationId: this.currentLocationId, unlockedLocations: this.unlockedLocations,
      eventFeed: this.eventFeed, maxJobListings: this.maxJobListings, modifiers: this.modifiers, successStreak: this.successStreak,
      rejectionCounter: this.rejectionCounter, firstLoadSeen: this.firstLoadSeen,
      upgrades: this.shopUpgrades.map(u => ({ id: u.id, purchased: u.purchased }))
    };
  }

  hydrate(data) {
    this.reset();
    Object.assign(this, data);
    this.printers = (data.printers || []).map(p => Object.assign(new Printer(p.id, this.printerCatalog.find(m => m.name === p.model?.name || p.name)), p));
    this.jobsAvailable = (data.jobsAvailable || []).map(j => Object.assign(new Job(j), j));
    this.jobsAccepted = (data.jobsAccepted || []).map(j => Object.assign(new Job(j), j));
    this.jobsHistory = data.jobsHistory || [];
    this.shopUpgrades.forEach(u => {
      u.purchased = data.upgrades?.find(x => x.id === u.id)?.purchased || false;
    });
  }
}

class Renderer {
  constructor(game) {
    this.g = game;
    this.topStats = document.getElementById('topStats');
    this.repFill = document.getElementById('repFill');
    this.repText = document.getElementById('repText');
    this.scene = document.getElementById('locationScene');
    this.sceneLoc = document.getElementById('sceneLocationLabel');
    this.eventLog = document.getElementById('eventLog');
    this.drawer = document.getElementById('printerDetailPanel');
    this.notice = document.getElementById('autosaveNotice');
    this.activeTab = 'jobs';
    this.activeJobsSubtab = 'available';

    this.tabs = [...document.querySelectorAll('.tab')];
    this.tabs.forEach(t => t.addEventListener('click', () => this.switchTab(t.dataset.tab)));
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.toggle('active', el.id === `tab-${tab}`));
    this.renderPanels();
  }

  renderAll() {
    this.renderTop();
    this.renderScene();
    this.renderPanels();
    this.renderLog();
    this.renderPrinterDrawer();
  }

  renderTop() {
    const g = this.g;
    const stats = [
      ['Money', `$${Math.floor(g.money)}`],
      ['Location', g.location.name],
      ['Printers', `${g.printers.length}/${g.location.capacity}`],
      ['Accepted', `${g.jobsAccepted.filter(j => j.status === 'accepted').length}`],
      ['Active', `${g.jobsAccepted.filter(j => ['printing', 'paused', 'failed'].includes(j.status)).length}`],
      ['Leads', `${g.jobsAvailable.length}`],
      ['Day / Time', `${g.day} / ${g.timeString}`]
    ];

    this.topStats.innerHTML = stats.map(([k, v]) => `<div class="stat"><div class="label">${k}</div><strong>${v}</strong></div>`).join('');
    this.repFill.style.width = `${g.reputation}%`;
    this.repText.textContent = `${Math.round(g.reputation)} / 100`;
  }

  scenePropsForLocation(id) {
    if (id === 'dorm') {
      return [
        ['prop-bench', 8, 24], ['prop-shelf', 72, 20], ['prop-box', 12, 58], ['prop-box', 22, 56], ['prop-spool', 79, 58]
      ];
    }
    if (id === 'office') {
      return [
        ['prop-bench', 10, 20], ['prop-shelf', 70, 18], ['prop-shelf', 72, 28], ['prop-box', 8, 62], ['prop-spool', 83, 60]
      ];
    }
    return [
      ['prop-bench', 10, 18], ['prop-bench', 68, 18], ['prop-shelf', 8, 66], ['prop-shelf', 72, 66], ['prop-box', 45, 64], ['prop-spool', 54, 65]
    ];
  }

  renderScene() {
    const g = this.g;
    this.scene.innerHTML = '';
    this.sceneLoc.textContent = `${g.location.name} · ${g.location.theme}`;

    this.scenePropsForLocation(g.currentLocationId).forEach(([klass, x, y]) => {
      const p = document.createElement('div');
      p.className = `workshop-prop ${klass}`;
      p.style.left = `${x}%`;
      p.style.top = `${y}%`;
      this.scene.appendChild(p);
    });

    const cols = Math.ceil(Math.sqrt(Math.max(1, g.location.capacity)));
    g.printers.forEach((printer, i) => {
      const node = document.createElement('div');
      node.className = `printer-node ${printer.status === 'printing' ? 'printing' : ''}`;
      node.style.left = `${8 + (i % cols) * (81 / cols)}%`;
      node.style.top = `${40 + Math.floor(i / cols) * 12}%`;
      node.style.transform = `scale(${printer.model.spriteScale})`;
      node.dataset.printer = printer.id;

      const job = g.jobsAccepted.find(j => j.id === printer.currentJobId);
      const dotClass = printer.status === 'printing' ? 'dot-printing' : printer.status === 'paused' ? 'dot-paused' : printer.status === 'failed' ? 'dot-failed' : printer.status === 'ready' ? 'dot-ready' : 'dot-idle';
      const progress = job ? job.progress : 0;

      node.innerHTML = `
        <div class="printer-head">
          <span class="printer-type">${printer.name}</span>
          <span class="status-dot ${dotClass}"></span>
        </div>
        <div class="printer-mini">${printer.status.toUpperCase()}</div>
        <div class="printer-mini">${job ? job.title.slice(0, 16) : 'No active job'}</div>
        <div class="printer-mini">HP ${Math.round(printer.condition)} · SPD ${Math.round(printer.statBlock.speed)}</div>
        <div class="node-progress"><div style="width:${progress}%"></div></div>
      `;

      node.title = `${printer.name} #${printer.id}\nStatus: ${printer.status}\nClick for details`;
      this.scene.appendChild(node);
    });
  }

  jobCard(job, mode) {
    const urgency = job.deadlineMinutes < job.requiredTime * 0.8 ? 'badge danger' : job.deadlineMinutes < job.requiredTime * 1.1 ? 'badge warn' : 'badge';
    const projectedRisk = mode === 'active' && job.assignedPrinterId
      ? this.g.estimateFailureRisk(job, this.g.printers.find(p => p.id === job.assignedPrinterId) || this.g.printers[0])
      : this.g.projectedRiskForJob(job);
    const riskLabel = projectedRisk?.label || job.failureChanceHint || 'Moderate';
    const riskPercent = projectedRisk?.percent ?? 12;
    const riskClass = riskLabel === 'Low' ? 'badge' : riskLabel === 'Moderate' ? 'badge warn' : 'badge danger';

    return `
      <div class="card" title="Suggested: ${job.recommendedPrinter}">
        <h4>${job.title}</h4>
        <div class="row muted"><span>${job.clientType}</span><span>${job.category}</span></div>
        <div class="row">
          <span class="badge">Tier ${job.tier}</span>
          <span class="${urgency}">Deadline ${Math.max(0, Math.ceil(job.deadlineMinutes))}m</span>
          <span class="${riskClass}">Risk ${riskLabel} (${riskPercent}%)</span>
        </div>
        <div class="row muted">
          <span>Size ${job.sizeRequirement}</span>
          <span>Complexity ${job.complexityRequirement}</span>
          <span>Color ${job.colorComplexity}</span>
        </div>
        <div class="row muted"><span>ETA ${job.requiredTime}m</span><span>Recommended ${job.recommendedPrinter}</span></div>
        <div class="row"><strong>$${job.payout}</strong><span>Rep ±${job.reputationEffect}</span></div>
        ${mode === 'available' ? `
          <button class="btn primary" data-act="accept" data-id="${job.id}">Accept</button>
          <button class="btn ghost" data-act="reject" data-id="${job.id}">Reject</button>
        ` : ''}
        ${mode === 'accepted' ? `
          <select class="select" data-act="pickPrinter" data-id="${job.id}">
            ${this.g.getAvailablePrintersForJob(job.id).map(p => `<option value="${p.id}">#${p.id} ${p.name} (${p.status})</option>`).join('') || `<option value="">No suitable idle printer</option>`}
          </select>
          <button class="btn primary" data-act="assign" data-id="${job.id}">Assign</button>
          <button class="btn danger" data-act="forfeit" data-id="${job.id}">Forfeit</button>
        ` : ''}
        ${mode === 'active' ? `
          <div class="progress"><div style="width:${job.progress}%"></div></div>
          <div class="row muted"><span>Assigned #${job.assignedPrinterId || '-'}</span><span>Remaining ${Math.max(0, Math.ceil(job.remainingMinutes))}m</span></div>
          ${job.status === 'failed' ? `<button class="btn primary" data-act="restart" data-id="${job.id}">Restart</button>` : ''}
          <button class="btn danger" data-act="forfeit" data-id="${job.id}">Forfeit</button>
        ` : ''}
        ${mode === 'history' ? `<div class="row muted"><span>Status: ${job.status}</span><span>Final progress ${Math.round(job.progress)}%</span></div>` : ''}
      </div>
    `;
  }

  renderJobs() {
    const g = this.g;
    const groups = {
      available: g.jobsAvailable,
      accepted: g.jobsAccepted.filter(j => j.status === 'accepted'),
      active: g.jobsAccepted.filter(j => ['printing', 'paused', 'failed'].includes(j.status)),
      history: g.jobsHistory.slice(0, 28)
    };

    const subTabs = ['available', 'accepted', 'active', 'history'];
    const labels = { available: 'Available Jobs', accepted: 'Accepted Jobs', active: 'Active Jobs', history: 'Completed / Failed' };

    document.getElementById('tab-jobs').innerHTML = `
      <div class="subtabs">
        ${subTabs.map(s => `<button class="btn subtab ${this.activeJobsSubtab === s ? 'active' : ''}" data-act="jobsSubtab" data-subtab="${s}">${labels[s]}</button>`).join('')}
      </div>
      ${groups[this.activeJobsSubtab].length ? groups[this.activeJobsSubtab].map(j => this.jobCard(j, this.activeJobsSubtab)).join('') : '<div class="card muted">No jobs in this section right now.</div>'}
    `;
  }

  renderPrinters() {
    const g = this.g;
    const cards = g.printerCatalog.map(m => `
      <div class="card" title="${m.specialty}">
        <h4>${m.name}</h4>
        <div class="row muted"><span>Tier ${m.tier}</span><span>Cost $${m.cost}</span></div>
        <div class="row muted"><span>SPD ${m.speed}</span><span>REL ${m.reliability}</span><span>QLT ${m.quality}</span></div>
        <div class="row muted"><span>CMP ${m.complexity}</span><span>SIZE ${m.maxSize}</span><span>CLR ${m.multicolor}</span></div>
        <div class="muted">${m.specialty}</div>
        <button class="btn primary" data-act="buyPrinter" data-name="${m.name}">Buy ${m.name}</button>
      </div>
    `).join('');

    const owned = g.printers.map(p => {
      const upCost = Math.round(250 * (p.upgradeLevel + 1) * (1 + p.model.tier * 0.35));
      return `
        <div class="card">
          <h4>#${p.id} ${p.name}</h4>
          <div class="row muted"><span>Status ${p.status}</span><span>Mk.${p.upgradeLevel}</span><span>Condition ${Math.round(p.condition)}%</span></div>
          <button class="btn" data-act="selectPrinter" data-id="${p.id}">Open Details</button>
          <button class="btn" data-act="upgradePrinter" data-id="${p.id}">Upgrade ($${upCost})</button>
        </div>
      `;
    }).join('');

    document.getElementById('tab-printers').innerHTML = `<h3>Printer Market</h3>${cards}<h3>Installed Printers</h3>${owned || '<div class="card muted">No printers installed yet.</div>'}`;
  }

  renderUpgrades() {
    const g = this.g;
    document.getElementById('tab-upgrades').innerHTML = `
      <h3>Business Upgrades</h3>
      ${g.shopUpgrades.map(u => `
        <div class="card">
          <h4>${u.name}</h4>
          <div class="muted">${u.effect}</div>
          <div class="row"><span>Cost $${u.cost}</span><span>${u.purchased ? 'Owned' : 'Available'}</span></div>
          <button class="btn ${u.purchased ? '' : 'primary'}" data-act="buyUpgrade" data-id="${u.id}" ${u.purchased ? 'disabled' : ''}>${u.purchased ? 'Installed' : 'Purchase'}</button>
        </div>
      `).join('')}
    `;
  }

  renderLocations() {
    const g = this.g;
    document.getElementById('tab-locations').innerHTML = `
      <h3>Location Expansion</h3>
      ${g.locations.map(loc => {
        const unlocked = g.unlockedLocations.includes(loc.id);
        return `
          <div class="card">
            <h4>${loc.name} ${g.currentLocationId === loc.id ? '(Current)' : ''}</h4>
            <div class="muted">${loc.theme}</div>
            <div class="row"><span>Capacity ${loc.capacity}</span><span>Job tier gate ${loc.jobTier}</span></div>
            <div class="row muted"><span>Unlock $${loc.unlockCost}</span><span>Needs ${loc.requiredPrinters} printers</span></div>
            <div class="muted">Payout x${loc.bonus.payout} · Failure x${loc.bonus.failMod}</div>
            ${unlocked ? `<button class="btn" data-act="moveLocation" data-id="${loc.id}" ${g.currentLocationId === loc.id ? 'disabled' : ''}>Move</button>` : `<button class="btn primary" data-act="unlockLocation" data-id="${loc.id}">Unlock</button>`}
          </div>
        `;
      }).join('')}
    `;
  }

  renderPanels() {
    this.renderJobs();
    this.renderPrinters();
    this.renderUpgrades();
    this.renderLocations();
  }

  renderLog() {
    this.eventLog.innerHTML = this.g.eventFeed.map(l => `<div class="log-item">${l}</div>`).join('');
  }

  renderPrinterDrawer() {
    const g = this.g;
    const id = g.selectedPrinterId;
    const p = g.printers.find(x => x.id === id);
    if (!p) {
      this.drawer.classList.add('hidden');
      this.drawer.innerHTML = '';
      return;
    }

    const job = g.jobsAccepted.find(j => j.id === p.currentJobId);
    const upCost = Math.round(250 * (p.upgradeLevel + 1) * (1 + p.model.tier * 0.35));
    const s = p.statBlock;
    const risk = job ? g.estimateFailureRisk(job, p) : null;

    this.drawer.classList.remove('hidden');
    this.drawer.innerHTML = `
      <div class="panel-head">
        <h3>${p.name} #${p.id}</h3>
        <button class="btn" data-act="closePrinter">Close</button>
      </div>
      <div class="card">
        <div class="row"><span>Status</span><strong>${p.status.toUpperCase()}</strong></div>
        <div class="row"><span>Assigned Job</span><strong>${job ? job.title : 'None'}</strong></div>
        <div class="row"><span>Percent Complete</span><strong>${job ? Math.round(job.progress) : 0}%</strong></div>
        <div class="row"><span>Time Remaining</span><strong>${job ? Math.max(0, Math.ceil(job.remainingMinutes)) : 0}m</strong></div>
        <div class="row"><span>Failure Chance (job)</span><strong>${risk ? `${risk.label} (${risk.percent}%)` : 'Low (n/a)'}</strong></div>
        <div class="row"><span>Maintenance State</span><strong>${s.healthState}</strong></div>
      </div>
      <div class="card">
        <div class="row muted"><span>Speed ${Math.round(s.speed)}</span><span>Reliability ${s.reliability}</span><span>Quality ${s.quality}</span></div>
        <div class="row muted"><span>Complexity ${s.complexity}</span><span>Max Size ${s.maxSize}</span><span>Multi-color ${s.multicolor}</span></div>
        <div class="row muted"><span>Upgrade Mk.${p.upgradeLevel}</span><span>Condition ${Math.round(p.condition)}%</span></div>
      </div>
      <div class="row">
        <button class="btn" data-act="inspectPrinter" data-id="${p.id}">Inspect</button>
        <button class="btn" data-act="maintainPrinter" data-id="${p.id}">Maintenance</button>
        <button class="btn" data-act="upgradePrinter" data-id="${p.id}">Upgrade ($${upCost})</button>
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="btn primary" data-act="assignFromPrinter" data-id="${p.id}">Assign Job</button>
        <button class="btn" data-act="${p.status === 'paused' ? 'resumePrinter' : 'pausePrinter'}" data-id="${p.id}">${p.status === 'paused' ? 'Resume' : 'Pause'}</button>
        <button class="btn danger" data-act="cancelPrinterJob" data-id="${p.id}">Cancel</button>
      </div>
    `;
  }
}

const game = new GameState();
const loaded = SaveManager.load();
if (loaded) game.hydrate(loaded);
const renderer = new Renderer(game);
renderer.renderAll();

function bindActions() {
  document.body.addEventListener('click', (e) => {
    const node = e.target.closest('[data-act]');
    if (!node) return;
    const act = node.dataset.act;
    const id = Number(node.dataset.id);
    let err = null;

    if (act === 'jobsSubtab') renderer.activeJobsSubtab = node.dataset.subtab;
    if (act === 'accept') game.acceptJob(id);
    if (act === 'reject') game.rejectJob(id);
    if (act === 'assign') {
      const select = document.querySelector(`select[data-act='pickPrinter'][data-id='${id}']`);
      err = game.assignJob(id, Number(select?.value));
    }
    if (act === 'forfeit') game.forfeitJob(id);
    if (act === 'restart') game.restartJob(id);

    if (act === 'buyPrinter') err = game.buyPrinter(node.dataset.name);
    if (act === 'upgradePrinter') err = game.upgradePrinter(id);
    if (act === 'maintainPrinter') err = game.maintainPrinter(id);
    if (act === 'pausePrinter') err = game.pausePrinter(id);
    if (act === 'resumePrinter') err = game.resumePrinter(id);
    if (act === 'cancelPrinterJob') err = game.cancelPrinterJob(id);
    if (act === 'inspectPrinter') game.inspectPrinter(id);
    if (act === 'selectPrinter') game.selectedPrinterId = id;
    if (act === 'assignFromPrinter') {
      const candidate = game.jobsAccepted.find(j => j.status === 'accepted' && game.getAvailablePrintersForJob(j.id).some(p => p.id === id));
      if (candidate) err = game.assignJob(candidate.id, id);
      else err = 'No compatible accepted job available for this printer.';
    }
    if (act === 'closePrinter') game.selectedPrinterId = null;

    if (act === 'buyUpgrade') err = game.buyShopUpgrade(node.dataset.id);
    if (act === 'unlockLocation') err = game.unlockLocation(node.dataset.id);
    if (act === 'moveLocation') err = game.moveLocation(node.dataset.id);

    if (err) game.addLog(`Action blocked: ${err}`);
    renderer.renderAll();
  });

  document.getElementById('locationScene').addEventListener('click', (e) => {
    const node = e.target.closest('[data-printer]');
    if (!node) return;
    game.selectedPrinterId = Number(node.dataset.printer);
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
  renderer.notice.textContent = `Autosaved · Day ${game.day} ${game.timeString}`;
  setTimeout(() => renderer.notice.textContent = 'Autosave ready', 850);
}, 10000);

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset all progress and clear save?')) return;
  SaveManager.clear();
  game.reset();
  renderer.activeJobsSubtab = 'available';
  renderer.renderAll();
});

const tutorialModal = document.getElementById('tutorialModal');
if (!game.firstLoadSeen) tutorialModal.classList.remove('hidden');
document.getElementById('closeTutorialBtn').addEventListener('click', () => {
  tutorialModal.classList.add('hidden');
  game.firstLoadSeen = true;
  SaveManager.save(game);
});
