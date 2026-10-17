import { NgModule } from '@angular/core';
import { BrowserModule, REMOVE_STYLES_ON_COMPONENT_DESTROY } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { SkillRankingsComponent } from './skill-rankings/skill-rankings.component';
import { SettingsMenuComponent } from './skill-rankings/settings-menu.component';
import { PlayerCardComponent } from './player-card/player-card.component';
import { PlayerCompareComponent } from './compare/player-compare.component';
import { CARD_TABS } from '@ranker/engine/player-card/tabs/card-tabs';
import { CardPanelComponent } from './player-card/card-panel.component';
import { FieldMapComponent } from './player-card/field-map.component';
import { HeatMapModule } from './heat-map/heat-map.module';
import { CardSplashHost } from './player-card/splash/splash-host.component';
import { GameViewComponent } from './game-view/game-view.component';
import { ColumnHighlightDirective } from '@ranker/core/column-highlight.directive';
import { ScrolledSidewaysDirective } from '@ranker/core/scrolled-sideways.directive';
import { RecentPrimeDirective } from './skill-rankings/recent-prime.directive';
import { COLUMN_MOVER, ColumnDragDirective } from '@ranker/core/column-drag.directive';
import { SelectOriginDirective } from '@ranker/core/select-origin.directive';
import { PausedWhileDirective } from '@ranker/core/paused-while.directive';
import { A11Y_DIRECTIVES } from '@ranker/core/a11y.directives';
import { MatMenuModule } from '@angular/material/menu';
import { AboutComponent } from '@sport/about/about.component';
import { AboutFrameComponent } from './about/about-frame.component';
import { PositionService } from './position.service';
import { BetsPageComponent } from './bets/bets-page.component';
import { BetsAboutComponent } from './bets/bets-about.component';
import { ModelDeskComponent } from './bets/model-desk.component';
import { DeskNoteComponent } from './bets/desk-note.component';
import { LiveTabComponent } from './bets/live-tab.component';
import { ACCOUNT_COMPONENTS } from './account/account-components';
import { SplashGalleryHost } from './player-card/splash/splash-gallery-host.component';

@NgModule({
  declarations: [
    AppComponent,
    SidebarComponent,
    SkillRankingsComponent,
    SettingsMenuComponent,
    PlayerCardComponent,
    PlayerCompareComponent,
    ...CARD_TABS,
    CardPanelComponent,
    FieldMapComponent,
    GameViewComponent,
    ColumnHighlightDirective,
    ScrolledSidewaysDirective,
    RecentPrimeDirective,
    ColumnDragDirective,
    SelectOriginDirective,
    PausedWhileDirective,
    ...A11Y_DIRECTIVES,
    AboutComponent,
    AboutFrameComponent,
    BetsPageComponent,
    BetsAboutComponent,
    ModelDeskComponent,
    DeskNoteComponent,
    LiveTabComponent,
    ...ACCOUNT_COMPONENTS,
  ],
  bootstrap: [AppComponent],
  // (the column headers' drag and drop reorders columns through the position service)
  providers: [
    { provide: COLUMN_MOVER, useExisting: PositionService },
    // (a lazily drawn component's styles stay in the document once added: Angular's default pulls them out when
    // its last instance goes and puts them back on the next, and each put-back restyles the whole page, 100-350
    // ms of a throttled phone's main thread every time a card opened its splash)
    { provide: REMOVE_STYLES_ON_COMPONENT_DESTROY, useValue: false },
  ],
  imports: [
    BrowserModule,
    SplashGalleryHost,
    BrowserAnimationsModule,
    MatSliderModule,
    MatSelectModule,
    MatIconModule,
    FormsModule,
    DragDropModule,
    MatButtonModule,
    MatMenuModule,
    MatSlideToggleModule,
    HeatMapModule,
    CardSplashHost,
  ],
})
export class AppModule {}
