import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { QueryState, isDisabled, isUsed } from '../query-state';
import { Block, GROUPS, cssKind, label } from './blocks';

/** Left palette. Blocks can be clicked, activated with Enter/Space, or dragged onto `[data-canvas]`. */
@Component({
  selector: 'app-palette',
  imports: [CdkDrag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './palette.component.css',
  templateUrl: './palette.component.html',
})
export class PaletteComponent {
  protected readonly state = inject(QueryState);
  protected readonly groups = GROUPS;
  protected readonly label = label;
  protected readonly cssKind = cssKind;
  protected readonly isUsed = isUsed;
  protected readonly isDisabled = isDisabled;

  protected dropped(e: CdkDragEnd, b: Block) {
    this.state.dragging.set(false);
    // Dropped on the canvas? (hit-test by point, so the page needs no wiring between palette and canvas)
    const hit = document.elementFromPoint(e.dropPoint.x, e.dropPoint.y);
    if (hit?.closest('[data-canvas]')) this.state.add(b);
    e.source.reset(); // snap the block back to the palette
  }
}
