// The gallery's host (?gallery=1): loads the gallery, and the splash's art with it, only when the page asks for it
import { Component, Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';

@Component({
  selector: 'splash-gallery-host',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `@if (component; as c) {
    <ng-container *ngComponentOutlet="c"></ng-container>
  }`,
})
export class SplashGalleryHost {
  component: Type<unknown> | null = null;

  constructor() {
    import('./splash-gallery.component').then((m) => (this.component = m.SplashGallery));
  }
}
