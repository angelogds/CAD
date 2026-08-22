import {
  AcApDocManager,
  AcApEntityService,
  AcEdCommand,
  AcEdCommandStack,
  AcEdOpenMode,
  AcEdPromptDistanceOptions,
  AcEdPromptEntityOptions,
  AcEdPromptPointOptions,
  AcEdPromptSelectionOptions,
  AcEdPromptStatus,
} from '@mlightcad/cad-simple-viewer';
import {
  AcDbArc,
  AcDbLine,
  AcGeMatrix3d,
  AcGePoint3d,
} from '@mlightcad/data-model';
import {
  solveChamfer,
  solveFillet,
} from '../public/js/modules/desenho-tecnico/core/modify.geometry.mjs';
import {
  buildReflectionMatrixValues,
  lineEntitySnapshot,
  orientFilletArc,
} from './mlightcad-advanced-modify.logic.mjs';

function show(command, message, type = 'info') {
  command.showMessage(message, type);
}

async function promptPositiveDistance(message, defaultValue) {
  const options = new AcEdPromptDistanceOptions(message);
  options.allowZero = false;
  options.allowNegative = false;
  if (Number.isFinite(Number(defaultValue)) && Number(defaultValue) > 0) {
    options.defaultValue = Number(defaultValue);
    options.useDefaultValue = true;
    options.allowNone = true;
  }
  const result = await AcApDocManager.instance.editor.getDistance(options);
  if (result.status === AcEdPromptStatus.None && options.useDefaultValue) return options.defaultValue;
  if (result.status !== AcEdPromptStatus.OK || !Number.isFinite(Number(result.value)) || Number(result.value) <= 0) return null;
  return Number(result.value);
}

async function pickLine(context, command, message, excludedId = null) {
  const editor = AcApDocManager.instance.editor;
  while (true) {
    const options = new AcEdPromptEntityOptions(message);
    options.allowNone = true;
    options.setRejectMessage('Selecione uma entidade do tipo LINHA.');
    const result = await editor.getEntity(options);
    if (result.status === AcEdPromptStatus.None || result.status === AcEdPromptStatus.Cancel) return null;
    if (result.status !== AcEdPromptStatus.OK || !result.objectId) return null;
    if (excludedId != null && String(result.objectId) === String(excludedId)) {
      show(command, 'Selecione uma segunda linha diferente da primeira.', 'warning');
      continue;
    }
    const entity = context.doc.database.openEntityForRead(result.objectId);
    if (!(entity instanceof AcDbLine)) {
      show(command, 'FILLET/CHAMFER nesta etapa trabalham somente com duas linhas retas.', 'warning');
      continue;
    }
    const pick = result.pickedPoint || entity.midPoint;
    return {
      id: result.objectId,
      entity,
      pick: { x: Number(pick.x), y: Number(pick.y) },
    };
  }
}

function applyLineGeometry(database, id, geometry) {
  const line = database.openEntityForWrite(id);
  if (!(line instanceof AcDbLine)) throw new Error('A linha selecionada deixou de estar disponível para edição.');
  line.startPoint = new AcGePoint3d(Number(geometry.x1), Number(geometry.y1), Number(line.startPoint.z || 0));
  line.endPoint = new AcGePoint3d(Number(geometry.x2), Number(geometry.y2), Number(line.endPoint.z || 0));
  return line;
}

async function selectedEntitiesForMirror(context) {
  const selectionSet = context.view.selectionSet;
  if (selectionSet.count > 0) return context.doc.entityService.getEntitiesByIds(selectionSet.ids);

  const result = await AcApDocManager.instance.editor.getSelection(
    new AcEdPromptSelectionOptions('Selecione os objetos para ESPELHAR'),
  );
  if (result.status !== AcEdPromptStatus.OK || !result.value || result.value.count === 0) return [];
  return context.doc.entityService.getEntitiesByIds(result.value.ids);
}

export class CampoMirrorCmd extends AcEdCommand {
  constructor() {
    super();
    this.mode = AcEdOpenMode.Write;
  }

  async execute(context) {
    const entities = await selectedEntitiesForMirror(context);
    if (!entities.length) return;

    const editor = AcApDocManager.instance.editor;
    const firstResult = await editor.getPoint(new AcEdPromptPointOptions('Primeiro ponto do eixo de espelhamento'));
    if (firstResult.status !== AcEdPromptStatus.OK || !firstResult.value) return;

    const secondOptions = new AcEdPromptPointOptions('Segundo ponto do eixo de espelhamento');
    secondOptions.useBasePoint = true;
    secondOptions.useDashedLine = true;
    secondOptions.basePoint = new AcGePoint3d(firstResult.value);
    const secondResult = await editor.getPoint(secondOptions);
    if (secondResult.status !== AcEdPromptStatus.OK || !secondResult.value) return;

    const reflection = buildReflectionMatrixValues(firstResult.value, secondResult.value);
    if (!reflection.ok) {
      show(this, reflection.error, 'warning');
      return;
    }

    const matrix = new AcGeMatrix3d(...reflection.values);
    const clones = context.doc.entityService.cloneAndTransform(entities, matrix, { append: true });
    context.view.selectionSet.clear();
    show(this, `${clones.length} objeto(s) espelhado(s). Originais preservados.`, 'info');
  }
}

export class CampoFilletCmd extends AcEdCommand {
  static lastRadius = 10;

  constructor() {
    super();
    this.mode = AcEdOpenMode.Write;
  }

  async execute(context) {
    const radius = await promptPositiveDistance('Raio do arredondamento', CampoFilletCmd.lastRadius);
    if (!(radius > 0)) return;
    CampoFilletCmd.lastRadius = radius;

    const first = await pickLine(context, this, 'Selecione a primeira linha para o ARREDONDAMENTO');
    if (!first) return;
    const second = await pickLine(context, this, 'Selecione a segunda linha para o ARREDONDAMENTO', first.id);
    if (!second) return;

    const line1 = lineEntitySnapshot(first.entity);
    const line2 = lineEntitySnapshot(second.entity);
    const result = solveFillet(line1, first.pick, line2, second.pick, radius);
    if (!result.ok) {
      show(this, result.error || 'Não foi possível criar o arredondamento.', 'warning');
      return;
    }

    const arcData = orientFilletArc(result.arc);
    const database = context.doc.database;
    context.doc.entityService.runEdit('CAD FILLET', () => {
      applyLineGeometry(database, first.id, result.line1);
      applyLineGeometry(database, second.id, result.line2);
      const arc = new AcDbArc(
        new AcGePoint3d(arcData.cx, arcData.cy, 0),
        arcData.radius,
        arcData.startAngle,
        arcData.endAngle,
      );
      AcApEntityService.copyDisplayTraits(first.entity, arc);
      database.tables.blockTable.modelSpace.appendEntity(arc);
    });
    context.view.selectionSet.clear();
    show(this, `Arredondamento R${radius} criado com tangência nas duas linhas.`, 'info');
  }
}

export class CampoChamferCmd extends AcEdCommand {
  static lastDistance1 = 10;
  static lastDistance2 = 10;

  constructor() {
    super();
    this.mode = AcEdOpenMode.Write;
  }

  async execute(context) {
    const distance1 = await promptPositiveDistance('Primeira distância do chanfro', CampoChamferCmd.lastDistance1);
    if (!(distance1 > 0)) return;
    const distance2 = await promptPositiveDistance('Segunda distância do chanfro', CampoChamferCmd.lastDistance2 || distance1);
    if (!(distance2 > 0)) return;
    CampoChamferCmd.lastDistance1 = distance1;
    CampoChamferCmd.lastDistance2 = distance2;

    const first = await pickLine(context, this, 'Selecione a primeira linha para o CHANFRO');
    if (!first) return;
    const second = await pickLine(context, this, 'Selecione a segunda linha para o CHANFRO', first.id);
    if (!second) return;

    const line1 = lineEntitySnapshot(first.entity);
    const line2 = lineEntitySnapshot(second.entity);
    const result = solveChamfer(line1, first.pick, line2, second.pick, distance1, distance2);
    if (!result.ok) {
      show(this, result.error || 'Não foi possível criar o chanfro.', 'warning');
      return;
    }

    const database = context.doc.database;
    context.doc.entityService.runEdit('CAD CHAMFER', () => {
      applyLineGeometry(database, first.id, result.line1);
      applyLineGeometry(database, second.id, result.line2);
      const chamfer = new AcDbLine(
        new AcGePoint3d(result.chamfer.x1, result.chamfer.y1, 0),
        new AcGePoint3d(result.chamfer.x2, result.chamfer.y2, 0),
      );
      AcApEntityService.copyDisplayTraits(first.entity, chamfer);
      database.tables.blockTable.modelSpace.appendEntity(chamfer);
    });
    context.view.selectionSet.clear();
    show(this, `Chanfro ${distance1} x ${distance2} criado.`, 'info');
  }
}

export function registerMlightAdvancedModifyCommands() {
  const manager = AcApDocManager.instance.commandManager;
  const group = AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME;
  manager.addCommand(group, 'mirror', 'mirror', new CampoMirrorCmd());
  manager.addCommand(group, 'fillet', 'fillet', new CampoFilletCmd());
  manager.addCommand(group, 'chamfer', 'chamfer', new CampoChamferCmd());
}
