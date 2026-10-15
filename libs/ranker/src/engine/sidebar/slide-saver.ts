// A slider dragged moves many times a second, and each move re-ranks the whole list; on a phone a re-rank can
// take longer than the drag's steps, so they queued up behind each other and the drag stuttered. The filter
// menu saves a slider's tab through this instead: once a frame, with the latest of its sliders (the same
// object, changed in place by the slider). Any other save of the sliders (a preset, Reset, Clear) goes
// through saving() first: on the same tab it takes the waiting one's place, another tab's is saved first, so
// nothing is lost and the order of saves holds.
export class SlideSaver<P, W> {
  private waiting: { frame: number; position: P; weights: W } | null = null;

  constructor(
    private readonly save: (position: P, weights: W) => void,
    private readonly frame: (run: () => void) => number = (run) => requestAnimationFrame(run),
    private readonly cancel: (frame: number) => void = (frame) => cancelAnimationFrame(frame),
  ) {}

  // A slider moved on position's tab (weights: that tab's sliders, the object the slider writes into)
  slid(position: P, weights: W): void {
    if (this.waiting?.position === position && this.waiting.weights === weights) return;
    this.flush();
    const waiting = { frame: 0, position, weights };
    this.waiting = waiting;
    waiting.frame = this.frame(() => this.waiting === waiting && this.flush());
  }

  // Another save of position's sliders is about to happen
  saving(position: P): void {
    if (this.waiting?.position === position) this.drop();
    else this.flush();
  }

  // The waiting save, now (the menu going away)
  flush(): void {
    const waiting = this.drop();
    if (waiting) this.save(waiting.position, waiting.weights);
  }

  private drop() {
    const waiting = this.waiting;
    if (waiting) this.cancel(waiting.frame);
    this.waiting = null;
    return waiting;
  }
}
