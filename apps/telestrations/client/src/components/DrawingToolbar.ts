/**
 * Drawing toolbar component.
 * Colors, sizes, pen/eraser, undo/redo/clear.
 */

export interface ToolbarState {
  tool: 'pen' | 'eraser';
  color: string;
  size: number;
  canUndo: boolean;
  canRedo: boolean;
}

export type ToolbarAction =
  | { type: 'tool'; tool: 'pen' | 'eraser' }
  | { type: 'color'; color: string }
  | { type: 'size'; size: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' };

const COLORS = [
  { hex: '#1A1A1A', name: 'Black' },
  { hex: '#6B7280', name: 'Dark Gray' },
  { hex: '#EF4444', name: 'Red' },
  { hex: '#F97316', name: 'Orange' },
  { hex: '#FACC15', name: 'Yellow' },
  { hex: '#22C55E', name: 'Green' },
  { hex: '#38BDF8', name: 'Light Blue' },
  { hex: '#3B82F6', name: 'Dark Blue' },
  { hex: '#8B5CF6', name: 'Purple' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#92400E', name: 'Brown' },
  { hex: '#FFFFFF', name: 'White' },
];

const SIZES = [
  { value: 3, dotSize: 6 },
  { value: 6, dotSize: 10 },
  { value: 12, dotSize: 16 },
];

const PEN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
const ERASER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`;
const UNDO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`;
const REDO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;

export function renderDrawingToolbar(state: ToolbarState): string {
  return `
    <div class="drawing-toolbar section-gap-sm" id="toolbar-tools">
      <div class="tool-group">
        <button class="tool-btn ${state.tool === 'pen' ? 'active' : ''}" aria-label="Pen tool" data-toolbar="tool" data-tool="pen">
          ${PEN_ICON}
        </button>
        <button class="tool-btn ${state.tool === 'eraser' ? 'active' : ''}" aria-label="Eraser tool" data-toolbar="tool" data-tool="eraser">
          ${ERASER_ICON}
        </button>
      </div>

      <span class="toolbar-sep"></span>

      <div class="tool-group">
        ${SIZES.map((s) => `
          <button class="size-btn ${state.size === s.value ? 'active' : ''}" aria-label="${s.value === 3 ? 'Small' : s.value === 6 ? 'Medium' : 'Large'} brush" data-toolbar="size" data-size="${s.value}">
            <span class="size-dot" style="width:${s.dotSize}px;height:${s.dotSize}px;"></span>
          </button>
        `).join('')}
      </div>

      <span class="toolbar-sep"></span>

      <div class="tool-group">
        <button class="tool-btn ${!state.canUndo ? '' : ''}" aria-label="Undo" data-toolbar="undo" ${!state.canUndo ? 'disabled' : ''}>
          ${UNDO_ICON}
        </button>
        <button class="tool-btn" aria-label="Redo" data-toolbar="redo" ${!state.canRedo ? 'disabled' : ''}>
          ${REDO_ICON}
        </button>
        <button class="tool-btn" aria-label="Clear canvas" data-toolbar="clear">
          ${TRASH_ICON}
        </button>
      </div>
    </div>

    <div class="drawing-toolbar" id="toolbar-colors">
      <div class="color-swatches">
        ${COLORS.map((c) => {
          const isWhite = c.hex === '#FFFFFF';
          const activeClass = state.color === c.hex ? 'active' : '';
          const whiteClass = isWhite ? 'color-swatch-white' : '';
          return `<button class="color-swatch ${activeClass} ${whiteClass}" style="background:${c.hex};" aria-label="${c.name}" data-toolbar="color" data-color="${c.hex}"></button>`;
        }).join('')}
      </div>
    </div>
  `;
}

export function setupToolbarEvents(
  container: HTMLElement,
  onAction: (action: ToolbarAction) => void
): void {
  container.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-toolbar]') as HTMLElement | null;
    if (!target) return;

    const type = target.dataset.toolbar;
    if (!type) return;

    switch (type) {
      case 'tool': {
        const tool = target.dataset.tool as 'pen' | 'eraser';
        if (tool) onAction({ type: 'tool', tool });
        break;
      }
      case 'color': {
        const color = target.dataset.color;
        if (color) onAction({ type: 'color', color });
        break;
      }
      case 'size': {
        const size = parseInt(target.dataset.size || '6', 10);
        onAction({ type: 'size', size });
        break;
      }
      case 'undo':
        onAction({ type: 'undo' });
        break;
      case 'redo':
        onAction({ type: 'redo' });
        break;
      case 'clear':
        onAction({ type: 'clear' });
        break;
    }
  });
}
