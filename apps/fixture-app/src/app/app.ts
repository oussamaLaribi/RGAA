import { Component, signal } from '@angular/core';

/**
 * Deliberately inaccessible fixture. Every violation sits at a line number the
 * bridge test asserts against, so moving markup in `app.html` must be matched by
 * updating `expected-violations.json`.
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly loggedIn = signal(true);

  close(): void {
    /* intentionally empty: the fixture only needs the binding to exist */
  }
}
