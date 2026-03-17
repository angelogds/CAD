export class PromptOptions { constructor({ message = '' } = {}) { this.message = message; } }
export class PromptPointOptions extends PromptOptions {}
export class PromptDistanceOptions extends PromptOptions {}
export class PromptAngleOptions extends PromptOptions {}
export class PromptStringOptions extends PromptOptions {}
export class PromptEntityOptions extends PromptOptions {}
export class PromptSelectionOptions extends PromptOptions {}

export class PromptPointResult { constructor(point) { this.point = point; } }
export class PromptDoubleResult { constructor(value) { this.value = value; } }
export class PromptStringResult { constructor(value) { this.value = value; } }
export class PromptEntityResult { constructor(entity) { this.entity = entity; } }
export class PromptSelectionResult { constructor(ids) { this.ids = ids; } }

export class PromptManager {
  constructor(eventBus) { this.eventBus = eventBus; this.message = 'Pronto'; }
  set(options = new PromptOptions()) { this.message = options.message; this.eventBus.emit('prompt:changed', this.message); }
}
