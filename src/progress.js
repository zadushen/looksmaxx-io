const STORAGE_KEY = 'looksmaxx-local-progress-v1';

export const SKINS = [
  { id: 'neon', name: 'Неон', color: '#7651a9', mark: '⌁', description: 'Стартовый скин' },
  { id: 'mint', name: 'Мята', color: '#3bb78d', mark: '●', description: 'Достигни массы 55', achievement: 'mass-55' },
  { id: 'sunset', name: 'Закат', color: '#e58449', mark: '◒', description: 'Сыграй 3 катки', achievement: 'games-3' },
  { id: 'star', name: 'Звезда', color: '#efe3c1', mark: '✦', description: 'Дойди до high-tier normie', achievement: 'high-tier' }
];

export const ACHIEVEMENTS = [
  { id: 'first-game', name: 'Первый шаг', description: 'Сыграй первую катку', target: 1, stat: 'games' },
  { id: 'mass-55', name: 'Набираешь форму', description: 'Достигни массы 55', target: 55, stat: 'bestMass' },
  { id: 'games-3', name: 'На арене свой', description: 'Сыграй 3 катки', target: 3, stat: 'games' },
  { id: 'high-tier', name: 'Выше нормы', description: 'Дойди до high-tier normie', target: 1, stat: 'highTier' }
];

const defaults = () => ({ selectedSkin: 'neon', unlockedSkins: ['neon'], games: 0, bestMass: 0, highTier: 0, unlockedAchievements: [] });

export class Progress {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.load();
  }
  load() {
    try { return { ...defaults(), ...JSON.parse(this.storage?.getItem(STORAGE_KEY) || '{}') }; }
    catch { return defaults(); }
  }
  save() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch {} }
  skin() { return SKINS.find(skin => skin.id === this.data.selectedSkin) || SKINS[0]; }
  selectSkin(id) { if (!this.data.unlockedSkins.includes(id)) return false; this.data.selectedSkin = id; this.save(); return true; }
  recordGame({ mass = 0, tier = '' } = {}) {
    this.data.games += 1;
    this.data.bestMass = Math.max(this.data.bestMass, Math.floor(mass));
    if (tier === 'high-tier normie' || tier === 'chadlite' || tier === 'chad' || tier === 'gigachad') this.data.highTier = 1;
    const newlyUnlocked = [];
    ACHIEVEMENTS.forEach(achievement => {
      if (this.data[achievement.stat] >= achievement.target && !this.data.unlockedAchievements.includes(achievement.id)) {
        this.data.unlockedAchievements.push(achievement.id); newlyUnlocked.push(achievement);
      }
    });
    SKINS.forEach(skin => {
      if (skin.achievement && this.data.unlockedAchievements.includes(skin.achievement) && !this.data.unlockedSkins.includes(skin.id)) {
        this.data.unlockedSkins.push(skin.id);
      }
    });
    this.save();
    return newlyUnlocked;
  }
  progressFor(achievement) { return Math.min(this.data[achievement.stat] || 0, achievement.target); }
}
