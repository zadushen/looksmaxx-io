export function serverLimits(env = process.env) {
  const read = (name, fallback, max) => {
    const value = Number(env[name]);
    if (env[name] === undefined) return fallback;
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}: expected an integer from 1 to ${max}`);
    return value;
  };
  return {
    publicPlayers: read('PUBLIC_LIMIT', 64, 64),
    privatePlayers: read('ROOM_LIMIT', 12, 12),
    connections: read('CONNECTION_LIMIT', 128, 128),
    rooms: read('MAX_ROOMS', 32, 32)
  };
}
