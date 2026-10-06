// Only display precision is rounded; authoritative simulation retains full precision.
export function wireWorld(world) {
  return JSON.parse(JSON.stringify(world, (key, value) => {
    if (key === 'velocity') return undefined;
    if (key === 'mass') return Math.floor(value * 100) / 100;
    return typeof value === 'number' ? Math.round(value * 100) / 100 : value;
  }));
}

export function foodDelta(food, previous = new Map()) {
  const current = new Map(food.map(item => [item.id, item]));
  const changes = food.filter(item => JSON.stringify(item) !== JSON.stringify(previous.get(item.id)));
  const removed = [...previous.keys()].filter(id => !current.has(id));
  return { current, changes, removed };
}

export function applyFoodDelta(previous, world) {
  if (Array.isArray(world.food)) return world.food;
  const food = new Map(previous.map(item => [item.id, item]));
  for (const id of world.foodRemoved || []) food.delete(id);
  for (const item of world.foodChanges || []) food.set(item.id, item);
  return [...food.values()];
}
