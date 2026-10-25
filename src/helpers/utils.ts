export const fetchJsonData = async (path: string): Promise<Array<any>> => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} failed: HTTP ${response.status}`);
  }

  return (await response.json()).data;
};

export const getElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element not found: ${selector}`);
  }

  return element;
};
