'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DemoScene } from '../avatar/demo';

/** The coach looping one exercise in a small 3D viewport. */
export function Demo({ ex, className }: { ex: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scene = useRef<DemoScene | null>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const demo = (scene.current = new DemoScene());
    demo.scene.background = null;
    demo.set(canvas.dataset.ex ?? 'idle');
    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
      demo.update(Math.min(0.1, clock.getDelta()), w / Math.max(1, h));
      renderer.render(demo.scene, demo.camera);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
  }, []);
  useEffect(() => scene.current?.set(ex), [ex]);
  return <canvas ref={ref} data-ex={ex} className={className} />;
}
