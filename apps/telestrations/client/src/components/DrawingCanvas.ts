/**
 * Full drawing canvas with tools.
 * - 400x400 CSS, 800x800 actual (retina)
 * - Freehand drawing with bezier smoothing
 * - Pen, Eraser, Color, Size, Undo/Redo, Clear
 * - Touch support with viewport locking
 * - Export to PNG base64
 */

import { Point, drawSmoothLine, getCanvasPoint, exportCanvasToPng } from '../utils/canvas';
import {
  renderDrawingToolbar,
  setupToolbarEvents,
  type ToolbarState,
  type ToolbarAction,
} from './DrawingToolbar';

interface Stroke {
  points: Point[];
  color: string;
  lineWidth: number;
  isEraser: boolean;
}

const CANVAS_SIZE = 800; // actual pixels
const MAX_UNDO = 50;

export class DrawingCanvasController {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private container: HTMLElement;
  private toolbarContainer: HTMLElement;

  // Drawing state
  private strokes: Stroke[] = [];
  private redoStack: Stroke[] = [];
  private currentStroke: Stroke | null = null;
  private isDrawing = false;

  // Tool state
  private tool: 'pen' | 'eraser' = 'pen';
  private color = '#1A1A1A';
  private lineWidth = 6; // this is the CSS size; actual is 2x for retina
  private destroyed = false;

  constructor(container: HTMLElement, toolbarContainer: HTMLElement) {
    this.container = container;
    this.toolbarContainer = toolbarContainer;
    this.init();
  }

  private init(): void {
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'crosshair';
    this.canvas.style.touchAction = 'none';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Drawing canvas');

    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Clear to white
    this.clearCanvas(false);

    // Mount canvas
    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    // Mount toolbar
    this.renderToolbar();
    setupToolbarEvents(this.toolbarContainer, (action) => this.handleToolbarAction(action));

    // Event listeners
    this.setupCanvasEvents();
    this.setupViewportLock();
  }

  private setupCanvasEvents(): void {
    if (!this.canvas) return;

    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.onPointerDown(e.clientX, e.clientY));
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDrawing) this.onPointerMove(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('mouseup', () => this.onPointerUp());
    this.canvas.addEventListener('mouseleave', () => {
      if (this.isDrawing) this.onPointerUp();
    });

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        this.onPointerDown(touch.clientX, touch.clientY);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (this.isDrawing && e.touches.length === 1) {
        const touch = e.touches[0];
        this.onPointerMove(touch.clientX, touch.clientY);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.onPointerUp();
    }, { passive: false });

    this.canvas.addEventListener('touchcancel', () => {
      this.onPointerUp();
    });
  }

  private setupViewportLock(): void {
    // Prevent page scrolling while drawing
    const preventScroll = (e: TouchEvent) => {
      if (this.isDrawing) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventScroll, { passive: false });

    // Store for cleanup
    (this as any)._preventScroll = preventScroll;
  }

  private onPointerDown(clientX: number, clientY: number): void {
    if (!this.canvas || this.destroyed) return;

    const point = getCanvasPoint(this.canvas, clientX, clientY);
    const actualLineWidth = this.lineWidth * 2; // 2x for retina

    this.currentStroke = {
      points: [point],
      color: this.tool === 'eraser' ? '#FFFFFF' : this.color,
      lineWidth: actualLineWidth,
      isEraser: this.tool === 'eraser',
    };

    this.isDrawing = true;
    this.redoStack = []; // Clear redo on new stroke
    this.renderCurrentStroke();
  }

  private onPointerMove(clientX: number, clientY: number): void {
    if (!this.canvas || !this.currentStroke || !this.isDrawing) return;

    const point = getCanvasPoint(this.canvas, clientX, clientY);
    this.currentStroke.points.push(point);
    this.renderCurrentStroke();
  }

  private onPointerUp(): void {
    if (!this.currentStroke || !this.isDrawing) return;

    this.strokes.push(this.currentStroke);

    // Limit undo history
    if (this.strokes.length > MAX_UNDO) {
      this.strokes = this.strokes.slice(-MAX_UNDO);
    }

    this.currentStroke = null;
    this.isDrawing = false;
    this.renderToolbar();
  }

  private renderCurrentStroke(): void {
    if (!this.ctx || !this.currentStroke) return;

    // Redraw everything (simple approach - performant enough for our use case)
    this.redrawAll();

    // Draw current in-progress stroke
    if (this.currentStroke.isEraser) {
      this.ctx.globalCompositeOperation = 'source-over';
    }
    drawSmoothLine(
      this.ctx,
      this.currentStroke.points,
      this.currentStroke.color,
      this.currentStroke.lineWidth
    );
  }

  private redrawAll(): void {
    if (!this.ctx) return;

    // Clear to white
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Redraw all strokes
    for (const stroke of this.strokes) {
      this.ctx.globalCompositeOperation = 'source-over';
      drawSmoothLine(this.ctx, stroke.points, stroke.color, stroke.lineWidth);
    }
  }

  private handleToolbarAction(action: ToolbarAction): void {
    switch (action.type) {
      case 'tool':
        this.tool = action.tool;
        break;
      case 'color':
        this.color = action.color;
        this.tool = 'pen'; // Switch to pen when selecting a color
        break;
      case 'size':
        this.lineWidth = action.size;
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'clear':
        this.showClearConfirmation();
        return; // Don't re-render toolbar yet
    }
    this.renderToolbar();
  }

  private undo(): void {
    const stroke = this.strokes.pop();
    if (stroke) {
      this.redoStack.push(stroke);
      this.redrawAll();
    }
  }

  private redo(): void {
    const stroke = this.redoStack.pop();
    if (stroke) {
      this.strokes.push(stroke);
      this.redrawAll();
    }
  }

  private clearCanvas(confirmDone = true): void {
    if (!this.ctx) return;
    this.strokes = [];
    this.redoStack = [];
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (confirmDone) this.renderToolbar();
  }

  private showClearConfirmation(): void {
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="modal-backdrop" id="clear-modal">
        <div class="modal-card">
          <h3>Clear canvas?</h3>
          <p>This will erase your entire drawing. This cannot be undone.</p>
          <div class="modal-actions">
            <button class="btn btn-secondary btn-sm" data-modal-action="cancel">Cancel</button>
            <button class="btn btn-danger btn-sm" data-modal-action="confirm">Clear</button>
          </div>
        </div>
      </div>
    `;

    modalContainer.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-modal-action]') as HTMLElement | null;
      if (!target) return;

      const action = target.dataset.modalAction;
      if (action === 'confirm') {
        this.clearCanvas();
      }
      modalContainer.innerHTML = '';
    }, { once: false });

    // Close on backdrop click
    const backdrop = document.getElementById('clear-modal');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        modalContainer.innerHTML = '';
      }
    });
  }

  private renderToolbar(): void {
    const state: ToolbarState = {
      tool: this.tool,
      color: this.color,
      size: this.lineWidth,
      canUndo: this.strokes.length > 0,
      canRedo: this.redoStack.length > 0,
    };

    this.toolbarContainer.innerHTML = renderDrawingToolbar(state);
  }

  /**
   * Export the canvas to a PNG data URI.
   */
  export(): string {
    if (!this.canvas) return '';
    return exportCanvasToPng(this.canvas);
  }

  /**
   * Check if the canvas has any strokes.
   */
  hasContent(): boolean {
    return this.strokes.length > 0;
  }

  /**
   * Destroy the canvas and clean up event listeners.
   */
  destroy(): void {
    this.destroyed = true;
    if ((this as any)._preventScroll) {
      document.removeEventListener('touchmove', (this as any)._preventScroll);
    }
    this.container.innerHTML = '';
    this.toolbarContainer.innerHTML = '';
  }
}
