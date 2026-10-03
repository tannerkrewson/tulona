export function moveId(ids: readonly string[], from: number, to: number): string[] {
  const result = [...ids];
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) return result;
  const [id] = result.splice(from, 1);
  result.splice(to, 0, id);
  return result;
}

/** Choose the closest measured row center, including differently sized rows. */
export function dragTarget(centers: readonly number[], from: number, distance: number): number {
  const center = centers[from] + distance;
  let target = from;
  while (target < centers.length - 1 && center >= (centers[target] + centers[target + 1]) / 2)
    target++;
  while (target > 0 && center < (centers[target] + centers[target - 1]) / 2) target--;
  return target;
}
