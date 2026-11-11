'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DemoScene } from '@/avatar/demo';
import { EXERCISE_LIST } from '@/domain/exercises';

/** Developer contact sheet: every exercise pose at one phase. /sheet?phase=0.5&ids=squat,curl&az=90 */
export default function Sheet() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const phase = Number(q.get('phase') ?? 0.5);
    const ids = q.get('ids')?.split(',') ?? [...EXERCISE_LIST.map((e) => e.id), 'idle', 'spot', 'wave', 'cheer', 'beckon'];
    const cols = Number(q.get('cols') ?? Math.ceil(Math.sqrt(ids.length * 1.4)));
    const rows = Math.ceil(ids.length / cols);
    const cell = Number(q.get('cell') ?? 300);
    const canvas = ref.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(cols * cell, rows * cell, false);
    canvas.style.width = `${cols * cell}px`;
    renderer.setScissorTest(true);
    renderer.setClearColor(0x0b0e14);
    const human = q.has('human');
    const demos = ids.map((id) => {
      const demo = new DemoScene(human ? { human: '/models/coach.glb' } : {});
      demo.orbit = 0;
      demo.set(id);
      if (q.get('az')) (demo as unknown as { az: number }).az = (Number(q.get('az')) * Math.PI) / 180;
      demo.figure.rate = 0;
      demo.figure.phase = phase;
      demo.update(1);
      return demo;
    });
    const draw = () => demos.forEach((demo, i) => {
      demo.figure.update(0);
      const x = (i % cols) * cell, y = (rows - 1 - Math.floor(i / cols)) * cell;
      renderer.setViewport(x, y, cell, cell);
      renderer.setScissor(x, y, cell, cell);
      renderer.render(demo.scene, demo.camera);
    });
    draw();
    const labels = document.getElementById('labels')!;
    labels.innerHTML = ids.map((id, i) => `<span style="position:absolute;left:${(i % cols) * cell + 6}px;top:${Math.floor(i / cols) * cell + 4}px;font:12px monospace;color:#9fb">${id}</span>`).join('');
    // The human model loads asynchronously: draw again once it is in.
    setTimeout(() => (draw(), (document.title = 'sheet-ready')), human ? 6000 : 0);
    return () => renderer.dispose();
  }, []);
  return (
    <div style={{ position: 'relative' }}>
      <canvas ref={ref} />
      <div id="labels" />
    </div>
  );
}
