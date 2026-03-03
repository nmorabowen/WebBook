"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  radius: number;
  speedX: number;
  speedY: number;
  alpha: number;
  drift: number;
  seed: number;
};

const PARTICLE_COUNT = 72;

function createParticle(width: number, height: number): Particle {
  const radius = 0.8 + Math.random() * 2.6;
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    radius,
    speedX: (Math.random() - 0.5) * 0.18,
    speedY: -(0.16 + Math.random() * 0.42),
    alpha: 0.16 + Math.random() * 0.34,
    drift: 12 + Math.random() * 42,
    seed: Math.random() * Math.PI * 2,
  };
}

export function LandingBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let lastTime = 0;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = Math.max(window.innerHeight, document.documentElement.scrollHeight);
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      if (particles.length === 0) {
        for (let index = 0; index < PARTICLE_COUNT; index += 1) {
          particles.push(createParticle(width, height));
        }
      } else {
        for (const particle of particles) {
          particle.x = Math.min(particle.x, width);
          particle.y = Math.min(particle.y, height);
        }
      }
    };

    const draw = (time: number) => {
      const delta = Math.min((time - lastTime) / 16.667, 2.2) || 1;
      lastTime = time;

      context.clearRect(0, 0, width, height);

      const gradient = context.createRadialGradient(
        width * 0.72,
        height * 0.18,
        0,
        width * 0.72,
        height * 0.18,
        width * 0.55,
      );
      gradient.addColorStop(0, "rgba(143, 83, 53, 0.09)");
      gradient.addColorStop(0.45, "rgba(83, 112, 143, 0.06)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      for (const particle of particles) {
        const pointer = pointerRef.current;
        const sway = Math.sin(time * 0.00045 + particle.seed) * particle.drift;
        let offsetX = sway * 0.012;
        let offsetY = 0;

        if (pointer.active) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distance = Math.hypot(dx, dy) || 1;
          if (distance < 180) {
            const force = (180 - distance) / 180;
            offsetX += (dx / distance) * force * 1.15;
            offsetY += (dy / distance) * force * 0.65;
          }
        }

        particle.x += (particle.speedX + offsetX) * delta;
        particle.y += (particle.speedY + offsetY) * delta;

        if (particle.y < -18) {
          particle.y = height + 18;
          particle.x = Math.random() * width;
        }
        if (particle.x < -24) {
          particle.x = width + 24;
        }
        if (particle.x > width + 24) {
          particle.x = -24;
        }

        context.beginPath();
        context.fillStyle = `rgba(255, 247, 232, ${particle.alpha})`;
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();

        context.beginPath();
        context.strokeStyle = `rgba(255, 247, 232, ${particle.alpha * 0.24})`;
        context.lineWidth = 1;
        context.moveTo(particle.x, particle.y + particle.radius * 2.4);
        context.lineTo(particle.x - particle.speedX * 12, particle.y + 24);
        context.stroke();
      }

      animationRef.current = window.requestAnimationFrame(draw);
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = {
        x: event.clientX,
        y: event.clientY + window.scrollY,
        active: true,
      };
    };

    const handlePointerLeave = () => {
      pointerRef.current.active = false;
    };

    const handleScroll = () => {
      if (!pointerRef.current.active) {
        return;
      }
      pointerRef.current.y = window.scrollY + (pointerRef.current.y - window.scrollY);
    };

    resize();
    animationRef.current = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div className="landing-background" aria-hidden="true">
      <canvas ref={canvasRef} className="landing-background-canvas" />
      <div className="landing-background-glow landing-background-glow-a" />
      <div className="landing-background-glow landing-background-glow-b" />
    </div>
  );
}
