// Minimal standalone runtime for the NeonMeter design artboards.
// Renders the <x-dc> template ({{holes}}, <sc-for>, <sc-if>, <helmet>) with the
// artboard's Component class, and re-renders in place on setState so sliders keep working.
(function () {
  'use strict';

  function DCLogic(props) {
    this.props = props || {};
    this.state = undefined;
  }
  DCLogic.prototype.setState = function (patch) {
    this.state = Object.assign({}, this.state || {}, patch);
    if (this.__render) this.__render();
  };
  DCLogic.prototype.forceUpdate = function () {
    if (this.__render) this.__render();
  };

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(ctx, path) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    var value = ctx;
    for (var i = 0; i < parts.length; i++) {
      if (value == null) return undefined;
      value = value[parts[i]];
    }
    return value;
  }

  function interpolate(ctx, text) {
    return text.replace(HOLE, function (_, path) {
      var v = lookup(ctx, path);
      return v == null ? '' : String(v);
    });
  }

  function eventName(attr, el) {
    var name = attr.slice(2).toLowerCase();
    if (name === 'change') {
      var type = (el.getAttribute('type') || '').toLowerCase();
      return type === 'checkbox' || type === 'radio' ? 'change' : 'input';
    }
    return name;
  }

  function renderChildren(parent, ctx, out) {
    for (var c = parent.firstChild; c; c = c.nextSibling) renderNode(c, ctx, out);
  }

  function renderNode(node, ctx, out) {
    if (node.nodeType === 3) {
      out.push(document.createTextNode(interpolate(ctx, node.data)));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();
    if (tag === 'helmet') return;
    if (tag === 'sc-for') {
      var list = lookup(ctx, (node.getAttribute('list').match(WHOLE) || [])[1] || '') || [];
      var as = node.getAttribute('as') || 'item';
      for (var i = 0; i < list.length; i++) {
        var inner = Object.create(ctx);
        inner[as] = list[i];
        inner.$index = i;
        renderChildren(node, inner, out);
      }
      return;
    }
    if (tag === 'sc-if') {
      var cond = lookup(ctx, (node.getAttribute('value').match(WHOLE) || [])[1] || '');
      if (cond) renderChildren(node, ctx, out);
      return;
    }
    var el = document.createElement(tag);
    for (var a = 0; a < node.attributes.length; a++) {
      var attr = node.attributes[a];
      var name = attr.name;
      var raw = attr.value;
      if (name.indexOf('hint-') === 0) continue;
      var whole = raw.match(WHOLE);
      if (/^on[a-z]+$/i.test(name)) {
        var fn = whole ? lookup(ctx, whole[1]) : null;
        if (typeof fn === 'function') {
          el.__handlers = el.__handlers || {};
          el.__handlers[eventName(name, node)] = fn;
          el.addEventListener(eventName(name, node), function (ev) {
            var h = ev.currentTarget.__handlers[ev.type];
            if (h) h(ev);
          });
        }
        continue;
      }
      if (whole && (name === 'checked' || name === 'value')) {
        var v = lookup(ctx, whole[1]);
        if (name === 'checked') { el.checked = !!v; if (v) el.setAttribute('checked', ''); }
        else { el.setAttribute('value', v == null ? '' : String(v)); el.value = v == null ? '' : String(v); }
        continue;
      }
      el.setAttribute(name, interpolate(ctx, raw));
    }
    var kids = [];
    renderChildren(node, ctx, kids);
    for (var k = 0; k < kids.length; k++) el.appendChild(kids[k]);
    out.push(el);
  }

  function patch(oldNode, newNode) {
    if (oldNode.nodeType !== newNode.nodeType || oldNode.nodeName !== newNode.nodeName) {
      oldNode.parentNode.replaceChild(newNode, oldNode);
      return;
    }
    if (oldNode.nodeType === 3) {
      if (oldNode.data !== newNode.data) oldNode.data = newNode.data;
      return;
    }
    if (oldNode.nodeType !== 1) return;
    var i;
    for (i = oldNode.attributes.length - 1; i >= 0; i--) {
      var n = oldNode.attributes[i].name;
      if (!newNode.hasAttribute(n)) oldNode.removeAttribute(n);
    }
    for (i = 0; i < newNode.attributes.length; i++) {
      var at = newNode.attributes[i];
      if (oldNode.getAttribute(at.name) !== at.value) oldNode.setAttribute(at.name, at.value);
    }
    if (newNode.__handlers) oldNode.__handlers = newNode.__handlers;
    if (oldNode.tagName === 'INPUT') {
      if (oldNode.checked !== newNode.checked) oldNode.checked = newNode.checked;
      if (document.activeElement !== oldNode && oldNode.value !== newNode.value) oldNode.value = newNode.value;
    }
    var oc = Array.prototype.slice.call(oldNode.childNodes);
    var nc = Array.prototype.slice.call(newNode.childNodes);
    for (i = 0; i < nc.length; i++) {
      if (i < oc.length) patch(oc[i], nc[i]);
      else oldNode.appendChild(nc[i]);
    }
    for (i = nc.length; i < oc.length; i++) oldNode.removeChild(oc[i]);
  }

  function boot() {
    var host = document.querySelector('x-dc');
    var script = document.querySelector('script[data-dc-script]');
    if (!host || !script) return;

    var helmet = host.querySelector('helmet');
    if (helmet) {
      Array.prototype.slice.call(helmet.children).forEach(function (child) {
        document.head.appendChild(child.cloneNode(true));
      });
    }

    var template = document.createElement('div');
    template.innerHTML = host.innerHTML;
    var declared = {};
    try { declared = JSON.parse(script.getAttribute('data-props') || '{}'); } catch (e) { declared = {}; }
    var props = {};
    Object.keys(declared).forEach(function (key) {
      if (key.charAt(0) !== '$' && declared[key] && 'default' in declared[key]) props[key] = declared[key].default;
    });
    var query = new URLSearchParams(location.search);
    query.forEach(function (value, key) { props[key] = value; });

    var Component = new Function('DCLogic', script.textContent + '\nreturn Component;')(DCLogic);
    var instance = new Component(props);
    instance.props = props;

    var root = document.createElement('div');
    root.className = 'dc-root';
    host.parentNode.insertBefore(root, host);
    host.style.display = 'none';

    var scheduled = false;
    instance.__render = function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () { scheduled = false; draw(); });
    };

    function build() {
      var ctx = instance.renderVals() || {};
      var frag = document.createElement('div');
      var out = [];
      renderChildren(template, ctx, out);
      out.forEach(function (n) { frag.appendChild(n); });
      return frag;
    }

    function draw() {
      var next = build();
      if (!root.firstChild) {
        while (next.firstChild) root.appendChild(next.firstChild);
        return;
      }
      next.className = root.className;
      patch(root, next);
    }

    draw();
  }

  window.DCLogic = DCLogic;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
