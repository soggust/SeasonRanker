// The Heat Maps' surfaces by id, each built once from its own geometry file. A sport adding one (a half
// court, a strike zone, a spray fan, a diamond, a fighter's body) writes surfaces/<id>.ts returning a
// HeatSurface (its backdrop's pieces, styled by heat-map.scss's hm-* classes, and its cells' outlines) and lists
// it here; the component draws any of them the same way.

import type { HeatSurface, HeatSurfaceId } from '../heat-map.model';
import { downDistanceSurface } from './down-distance';
import { fieldSurface } from './field';
import { fieldStripSurface } from './field-strip';
import { halfCourtSurface } from './half-court';
import { redZoneSurface } from './red-zone';
import { rinkSurface } from './rink';
import { roundClock3Surface, roundClockSurface } from './round-clock';
import { body3Surface, bodySurface } from './body';

const BUILDERS: Partial<Record<HeatSurfaceId, () => HeatSurface>> = {
  field: fieldSurface,
  'field-strip': fieldStripSurface,
  'red-zone': redZoneSurface,
  'down-distance': downDistanceSurface,
  rink: rinkSurface,
  'round-clock': roundClockSurface,
  'round-clock-3': roundClock3Surface,
  body: bodySurface,
  'body-3': body3Surface,
  'half-court': halfCourtSurface,
  // TODO: strike-zone, spray-fan and diamond-field (MLB)
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
