export const getOrInitializeMapValue = (map, key, defaultValue) => {
  if (!map.has(key)) {
    map.set(key, defaultValue);
  }

  return map.get(key);
};

export const fetchJsonData = async (path) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} failed: HTTP ${response.status}`);
  }

  return (await response.json()).data;
};
