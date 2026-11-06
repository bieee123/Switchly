const SVG_NS = 'http://www.w3.org/2000/svg';

function svgRoot(size = 18): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('width', String(size));
  node.setAttribute('height', String(size));
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  return node;
}

function path(d: string, attributes: Record<string, string>): SVGPathElement {
  const node = document.createElementNS(SVG_NS, 'path');
  node.setAttribute('d', d);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  return node;
}

export function createPencilIcon(): SVGSVGElement {
  const svg = svgRoot();
  svg.append(
    path('M4.5 19.5l4.1-1 10.2-10.2a2.2 2.2 0 0 0-3.1-3.1L5.5 15.4l-1 4.1z', {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
      'stroke-linejoin': 'round',
    }),
    path('M13.7 6.7l3.6 3.6', {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
      'stroke-linecap': 'round',
    }),
  );
  return svg;
}

export function createTrashIcon(): SVGSVGElement {
  const svg = svgRoot();
  svg.append(
    path('M5 7h14', {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
      'stroke-linecap': 'round',
    }),
    path('M9 7V4h6v3', {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
      'stroke-linejoin': 'round',
    }),
    path('M7 7.5l1 11.5h8l1-11.5', {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
      'stroke-linejoin': 'round',
    }),
    path('M10 11v5', {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
      'stroke-linecap': 'round',
    }),
    path('M14 11v5', {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
      'stroke-linecap': 'round',
    }),
  );
  return svg;
}

export function createDotsIcon(): SVGSVGElement {
  const svg = svgRoot(18);
  for (const cy of ['5', '12', '19']) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', '1.8');
    circle.setAttribute('fill', 'currentColor');
    svg.append(circle);
  }
  return svg;
}
