/**
 * StyleHistory - Tracks committed style changes for undo/redo
 */

export default class StyleHistory {
  constructor(limit = 200) {
    this.limit = limit;
    this.stack = [];
    this.position = -1;
  }

  push(change) {
    if (!change) return;
    if (this.position < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.position + 1);
    }
    this.stack.push(change);
    if (this.stack.length > this.limit) {
      this.stack.shift();
    } else {
      this.position += 1;
    }
  }

  undo() {
    if (this.position < 0) return null;
    const change = this.stack[this.position];
    this.position -= 1;
    return change;
  }

  redo() {
    if (this.position >= this.stack.length - 1) return null;
    this.position += 1;
    return this.stack[this.position];
  }

  clear() {
    this.stack = [];
    this.position = -1;
  }

  get canUndo() {
    return this.position >= 0;
  }

  get canRedo() {
    return this.position < this.stack.length - 1;
  }

  // Find the most recent entry (<= current position) for a given index
  lastForIndex(index) {
    if (typeof index !== 'number') return null;
    for (let i = this.position; i >= 0; i -= 1) {
      const entry = this.stack[i];
      if (entry && entry.index === index) return entry;
    }
    return null;
  }
}
