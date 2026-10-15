// The Heat Maps' surfaces by id, each built once from its own geometry file. A sport adding one (a rink, a half
// court, a strike zone, a spray fan, a diamond, a fighter's body) writes surfaces/<id>.ts returning a
// HeatSurface (its backdrop's pieces, styled by heat-map.scss's hm-* classes, and its cells' outlines) and lists
// it here; the component draws any of them the same way.

import type { HeatSurface, HeatSurfaceId } from '../heat-map.model';
import { downDistanceSurface } from './down-distance';
import { fieldSurface } from './field';
import { fieldStripSurface } from './field-strip';

const BUILDERS: Partial<Record<HeatSurfaceId, () => HeatSurface>> = {
  field: fieldSurface,
  'field-strip': fieldStripSurface,
  'down-distance': downDistanceSurface,
  // TODO: rink (NHL), half-court (NBA), strike-zone, spray-fan and diamond-field (MLB), body (MMA)
};

const built = new Map<HeatSurfaceId, HeatSurface>();

// The surface for an id (null: none built yet)
export function heatSurface(id: HeatSurfaceId): HeatSurface | null {
  if (!built.has(id)) {
    const make = BUILDERS[id];
    if (!make) return null;
    built.set(id, make());
  }
  return built.get(id)!;
}
