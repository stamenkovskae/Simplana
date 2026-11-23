import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { QueryState } from '../query-state';
import { Block, chipLabel, cssKind, keyOf, blocksOf } from '../palette/blocks';

/** "Show me [Requests][per minute][by endpoint]": the blocks are the sentence. */
@Component({
  selector: 'app-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-canvas': '', '[class.over]': 'state.dragging()', 'aria-label': 'Your chart, as a sentence', role: 'group' },
  styleUrl: './canvas.component.css',
  templateUrl: './canvas.component.html',
})
export class CanvasComponent {
  protected readonly state = inject(QueryState);
  protected readonly cssKind = cssKind;
  protected readonly chipLabel = chipLabel;
  protected readonly key = keyOf;
  // The default look (Line) stays implicit; every other block is a chip.
  protected readonly chips = computed<Block[]>(() => {
    const q = this.state.query();
    return q ? blocksOf(q).filter((b) => !(b.kind === 'look' && b.value === 'line')) : [];
  });
}
