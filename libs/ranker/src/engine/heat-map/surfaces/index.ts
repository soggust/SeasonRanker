// The Heat Maps' surfaces by id, each built once from its own geometry file. A sport adding one writes
// surfaces/<id>.ts returning a HeatSurface (its backdrop's pieces, styled by heat-map.scss's hm-* classes, and its
// cells' outlines) and lists it here; the component draws any of them the same way.

import type { HeatSurface, HeatSurfaceId } from '../heat-map.model';
import { downDistanceSurface } from './down-distance';
import { fieldSurface } from './field';
import { fieldStripSurface } from './field-strip';
import { halfCourtSurface } from './half-court';
import { redZoneSurface } from './red-zone';
import { rinkSurface } from './rink';
import { roundClock3Surface, roundClockSurface } from './round-clock';
import { body3Surface, bodySurface } from './body';
import { strikeZoneSurface } from './strike-zone';
import { sprayFanLeftySurface, sprayFanSurface } from './spray-fan';
import { diamondFieldSurface } from './diamond-field';

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
  'strike-zone': strikeZoneSurface,
  'spray-fan': sprayFanSurface,
  'spray-fan-l': sprayFanLeftySurface,
  'diamond-field': diamondFieldSurface,
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
