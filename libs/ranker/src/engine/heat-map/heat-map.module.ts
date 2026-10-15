import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { HeatMapComponent } from './heat-map.component';
import { HeatMapControlsComponent } from './heat-map-controls.component';

// The Heat Maps' components (<heat-map>, <heat-map-controls>), for any card tab or panel that draws one: the
// app's module imports it. Their look: styles/components/heat-map.scss (loaded under player-card).
@NgModule({
  declarations: [HeatMapComponent, HeatMapControlsComponent],
  imports: [CommonModule, MatSelectModule],
  exports: [HeatMapComponent, HeatMapControlsComponent],
})
export class HeatMapModule {}
