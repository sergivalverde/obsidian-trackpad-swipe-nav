"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const vm = require("node:vm");

// main.js requires "obsidian", which exists only inside Obsidian. Give it a stub.
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === "obsidian") return { Plugin: class {} };
  return load.call(this, request, ...rest);
};
const TrackpadSwipeNav = require("../main.js");
const { makeDetector, GUEST_SCRIPT } = TrackpadSwipeNav;
Module._load = load;

// canScrollX reads these browser globals.
globalThis.getComputedStyle = (el) => ({ overflowX: el.overflowX || "visible" });
globalThis.document = { scrollingElement: null };

const plain = { nodeType: 1, scrollWidth: 800, clientWidth: 800, scrollLeft: 0, parentElement: null };

// A detector with a fake clock. send() takes [deltaX, deltaY] pairs, 16 ms apart.
function setup() {
  const fired = [];
  let clock = 1000;
  const onWheel = makeDetector((dir) => fired.push(dir), () => clock);
  const send = (pairs, extra = {}) => {
    for (const [deltaX, deltaY] of pairs) {
      clock += 16;
      onWheel({ deltaX, deltaY, ctrlKey: false, target: plain, ...extra });
    }
  };
  const wait = (ms) => { clock += ms; };
  return { fired, send, wait };
}

const swipe = (deltaX, n = 5) => Array.from({ length: n }, () => [deltaX, 0]);

test("swipe right (deltaX < 0) goes back", () => {
  const { fired, send } = setup();
  send(swipe(-40));
  assert.deepEqual(fired, ["back"]);
});

test("swipe left (deltaX > 0) goes forward", () => {
  const { fired, send } = setup();
  send(swipe(40));
  assert.deepEqual(fired, ["forward"]);
});

test("one long swipe with a momentum tail moves one page only", () => {
  const { fired, send } = setup();
  send(swipe(-40, 60));
  assert.deepEqual(fired, ["back"]);
});

test("two swipes with a gap of more than 250 ms move two pages", () => {
  const { fired, send, wait } = setup();
  send(swipe(-40));
  wait(300);
  send(swipe(-40));
  assert.deepEqual(fired, ["back", "back"]);
});

test("a gap of less than 250 ms keeps one swipe", () => {
  const { fired, send, wait } = setup();
  send(swipe(-40));
  wait(200);
  send(swipe(-40));
  assert.deepEqual(fired, ["back"]);
});

test("movement below 120 px does nothing", () => {
  const { fired, send } = setup();
  send(swipe(-20, 5)); // 100 px
  assert.deepEqual(fired, []);
});

test("movement of exactly 120 px fires", () => {
  const { fired, send } = setup();
  send(swipe(-40, 3));
  assert.deepEqual(fired, ["back"]);
});

test("mostly vertical scroll does nothing", () => {
  const { fired, send } = setup();
  send(Array.from({ length: 10 }, () => [-30, 40]));
  assert.deepEqual(fired, []);
});

test("diagonal swipe fires only when horizontal is two times vertical or more", () => {
  const a = setup();
  a.send(Array.from({ length: 5 }, () => [-40, 25])); // 200 vs 125: ratio 1.6
  assert.deepEqual(a.fired, []);
  const b = setup();
  b.send(Array.from({ length: 5 }, () => [-40, 20])); // 200 vs 100: ratio 2
  assert.deepEqual(b.fired, ["back"]);
});

test("pinch to zoom (Ctrl down) does nothing", () => {
  const { fired, send } = setup();
  send(swipe(-40), { ctrlKey: true });
  assert.deepEqual(fired, []);
});

test("swipe in an element that can scroll in that direction scrolls it", () => {
  const table = { nodeType: 1, scrollWidth: 2000, clientWidth: 500, scrollLeft: 300, overflowX: "auto", parentElement: plain };
  const cell = { nodeType: 1, scrollWidth: 100, clientWidth: 100, scrollLeft: 0, parentElement: table };
  const { fired, send } = setup();
  send(swipe(-40), { target: cell }); // can scroll left
  send(swipe(40), { target: cell }); // same swipe, no gap: still blocked
  assert.deepEqual(fired, []);
});

test("swipe in a scrollable element at its edge navigates", () => {
  const table = { nodeType: 1, scrollWidth: 2000, clientWidth: 500, scrollLeft: 0, overflowX: "auto", parentElement: plain };
  const { fired, send } = setup();
  send(swipe(-40), { target: table }); // already at the left edge
  assert.deepEqual(fired, ["back"]);
});

test("overflow hidden does not count as scrollable", () => {
  const box = { nodeType: 1, scrollWidth: 2000, clientWidth: 500, scrollLeft: 300, overflowX: "hidden", parentElement: plain };
  const { fired, send } = setup();
  send(swipe(-40), { target: box });
  assert.deepEqual(fired, ["back"]);
});

test("a wide page (document.scrollingElement) scrolls before it navigates", () => {
  const page = { nodeType: 1, scrollWidth: 2000, clientWidth: 500, scrollLeft: 300, parentElement: null };
  globalThis.document = { scrollingElement: page };
  try {
    const { fired, send } = setup();
    send(swipe(-40), { target: page });
    assert.deepEqual(fired, []);
  } finally {
    globalThis.document = { scrollingElement: null };
  }
});

test("web viewer script reports the swipe through console.log, once", () => {
  const logs = [];
  const listeners = [];
  const window = { addEventListener: (type, fn) => listeners.push([type, fn]) };
  const context = {
    window,
    console: { log: (m) => logs.push(m) },
    document: { scrollingElement: null },
    getComputedStyle: () => ({ overflowX: "visible" }),
    Date,
  };
  vm.createContext(context);
  vm.runInContext(GUEST_SCRIPT, context);
  vm.runInContext(GUEST_SCRIPT, context); // a second injection adds nothing

  assert.equal(listeners.length, 1);
  assert.equal(listeners[0][0], "wheel");
  for (let i = 0; i < 30; i++) listeners[0][1]({ deltaX: -40, deltaY: 0, ctrlKey: false, target: plain });
  assert.deepEqual(logs, ["__trackpad_swipe_nav__:back"]);
});

test("plugin maps back and forward to the Obsidian commands", () => {
  const run = [];
  const plugin = new TrackpadSwipeNav();
  plugin.app = { commands: { executeCommandById: (id) => run.push(id) } };
  plugin.go("back");
  plugin.go("forward");
  assert.deepEqual(run, ["app:go-back", "app:go-forward"]);
});
