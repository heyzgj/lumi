/**
 * ElementSchema - Derive control schema for the Property Panel
 */

const TEXT_TAGS = new Set([
  'p', 'span', 'strong', 'em', 'label', 'li', 'dt', 'dd',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
]);

const BUTTON_TAGS = new Set(['button']);
const LINK_TAGS = new Set(['a']);
const INPUT_TAGS = new Set(['input', 'textarea', 'select']);
const IMAGE_TAGS = new Set(['img', 'picture', 'figure']);

const CONTROL_DEFS = {
  text: {
    id: 'text',
    label: 'Text',
    type: 'textarea',
    group: 'content'
  },
  textColor: {
    id: 'color',
    label: 'Text Color',
    type: 'color',
    group: 'color',
    property: 'color'
  },
  backgroundColor: {
    id: 'backgroundColor',
    label: 'Background',
    type: 'color',
    group: 'color',
    property: 'backgroundColor'
  },
  fontSize: {
    id: 'fontSize',
    label: 'Font Size',
    type: 'number',
    unit: 'px',
    group: 'typography',
    property: 'fontSize',
    min: 8,
    max: 128
  },
  fontWeight: {
    id: 'fontWeight',
    label: 'Font Weight',
    type: 'select',
    options: ['300', '400', '500', '600', '700'],
    group: 'typography',
    property: 'fontWeight'
  },
  lineHeight: {
    id: 'lineHeight',
    label: 'Line Height',
    type: 'number',
    unit: null,
    step: 0.05,
    min: 0.5,
    max: 3,
    group: 'typography',
    property: 'lineHeight'
  },
  borderRadius: {
    id: 'borderRadius',
    label: 'Border Radius',
    type: 'number',
    unit: 'px',
    group: 'appearance',
    property: 'borderRadius',
    min: 0,
    max: 128
  },
  padding: {
    id: 'padding',
    label: 'Padding',
    type: 'padding',
    group: 'spacing',
    property: 'padding'
  },
  boxShadow: {
    id: 'boxShadow',
    label: 'Shadow',
    type: 'shadow',
    group: 'effects',
    property: 'boxShadow'
  }
};

const GROUP_ORDER = ['content', 'color', 'typography', 'spacing', 'appearance', 'effects'];

const GROUP_LABELS = {
  content: 'Content',
  color: 'Color',
  typography: 'Typography',
  spacing: 'Spacing',
  appearance: 'Appearance',
  effects: 'Effects'
};

function inferType(element) {
  const tag = element.tagName?.toLowerCase() || '';

  if (BUTTON_TAGS.has(tag)) return 'button';
  if (LINK_TAGS.has(tag)) return 'link';
  if (INPUT_TAGS.has(tag)) return 'form';
  if (IMAGE_TAGS.has(tag)) return 'image';
  if (TEXT_TAGS.has(tag)) return 'text';

  return 'container';
}

function supportsTextControls(elementType) {
  return elementType === 'text' || elementType === 'button' || elementType === 'link' || elementType === 'form';
}

function supportsBackground(elementType) {
  return elementType !== 'image';
}

function supportsTypography(elementType) {
  return elementType !== 'image';
}

function supportsPadding(elementType) {
  return elementType !== 'image';
}

function supportsShadow(elementType) {
  return elementType !== 'form';
}

export function getElementSchema(element) {
  if (!element) {
    return {
      type: 'unknown',
      controls: new Map(),
      order: []
    };
  }

  const type = inferType(element);
  const controls = new Map();

  if (supportsTextControls(type)) {
    controls.set('content', [CONTROL_DEFS.text]);
  }

  const colorControls = [];
  colorControls.push(CONTROL_DEFS.textColor);
  if (supportsBackground(type)) {
    colorControls.push(CONTROL_DEFS.backgroundColor);
  }
  controls.set('color', colorControls);

  if (supportsTypography(type)) {
    controls.set('typography', [
      CONTROL_DEFS.fontSize,
      CONTROL_DEFS.fontWeight,
      CONTROL_DEFS.lineHeight
    ]);
  }

  if (supportsPadding(type)) {
    controls.set('spacing', [CONTROL_DEFS.padding]);
  }

  controls.set('appearance', [CONTROL_DEFS.borderRadius]);

  if (supportsShadow(type)) {
    controls.set('effects', [CONTROL_DEFS.boxShadow]);
  }

  const order = GROUP_ORDER.filter(group => controls.has(group));

  return {
    type,
    controls,
    order,
    labels: GROUP_LABELS
  };
}

export function describeChanges(changes) {
  if (!changes) return 'Edited';
  const friendly = {
    text: 'Text',
    color: 'Text Color',
    backgroundColor: 'Background',
    fontSize: 'Font Size',
    fontWeight: 'Font Weight',
    lineHeight: 'Line Height',
    borderRadius: 'Radius',
    padding: 'Padding',
    paddingTop: 'Padding Top',
    paddingRight: 'Padding Right',
    paddingBottom: 'Padding Bottom',
    paddingLeft: 'Padding Left',
    boxShadow: 'Shadow'
  };
  const keys = Object.keys(changes);
  if (!keys.length) return 'Edited';
  const labels = keys.map(key => friendly[key] || key);
  return Array.from(new Set(labels)).join(', ');
}
