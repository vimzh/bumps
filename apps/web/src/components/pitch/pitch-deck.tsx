"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pitchSlides } from "@/data/pitch";
import styles from "./pitch-deck.module.css";

type PitchDeckProps = {
  fontClassName: string;
};

export function PitchDeck({ fontClassName }: PitchDeckProps) {
  const [current, setCurrent] = useState(0);
  const slide = pitchSlides[current];

  const move = useCallback((direction: -1 | 1) => {
    setCurrent((index) =>
      Math.min(Math.max(index + direction, 0), pitchSlides.length - 1)
    );
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move]);

  const controls = (
    <div className={styles.controls} aria-label="Slide controls">
      <button
        className={styles.control}
        type="button"
        onClick={() => move(-1)}
        disabled={current === 0}
        aria-label="Previous slide"
      >
        <ChevronLeft aria-hidden="true" size={22} strokeWidth={2.2} />
      </button>
      <span className={styles.counter} aria-live="polite">
        {String(current + 1).padStart(2, "0")} / {String(pitchSlides.length).padStart(2, "0")}
      </span>
      <button
        className={styles.control}
        type="button"
        onClick={() => move(1)}
        disabled={current === pitchSlides.length - 1}
        aria-label="Next slide"
      >
        <ChevronRight aria-hidden="true" size={22} strokeWidth={2.2} />
      </button>
    </div>
  );

  return (
    <main className={`${styles.deck} ${fontClassName}`}>
      {slide.id === "visitor" && (
        <section className={`${styles.slide} ${styles.visitorSlide}`} aria-labelledby="visitor-title">
          <div className={styles.visitorCopy}>
            <header className={styles.topline}>
              <span className={styles.brand}>bumps</span>
              <span>{slide.section}</span>
            </header>
            <div className={styles.headlineGroup}>
              <h1 className={styles.displayTitle} id="visitor-title">{slide.title}</h1>
              <p className={styles.lede}>{slide.body}</p>
            </div>
            <footer className={styles.footer}>{controls}</footer>
          </div>
          <div className={styles.visitorVisual}>
            <Image className={styles.heroImage} src={slide.hero.src} alt={slide.hero.alt} fill priority sizes="58vw" />
            <div className={styles.detailStrip}>
              {slide.details.map((image) => (
                <div className={styles.detailImage} key={image.src}>
                  <Image src={image.src} alt={image.alt} fill sizes="18vw" loading="eager" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {slide.id === "bottleneck" && (
        <section className={`${styles.slide} ${styles.bottleneckSlide}`} aria-labelledby="bottleneck-title">
          <div className={styles.bottleneckCopy}>
            <header className={styles.topline}>
              <span className={styles.brand}>bumps</span>
              <span>{slide.section}</span>
            </header>
            <div className={styles.headlineGroup}>
              <h1 className={styles.displayTitle} id="bottleneck-title">{slide.title}</h1>
              <p className={styles.emphasis}>{slide.emphasis}</p>
              <p className={styles.lede}>{slide.body}</p>
            </div>
            <footer className={styles.footer}>{controls}</footer>
          </div>
          <div className={styles.imageMosaic}>
            {slide.images.map((image, index) => (
              <div className={`${styles.mosaicImage} ${styles[`mosaicImage${index + 1}`]}`} key={image.src}>
                <Image src={image.src} alt={image.alt} fill sizes="30vw" />
              </div>
            ))}
          </div>
        </section>
      )}

      {slide.id === "agent" && (
        <section className={`${styles.slide} ${styles.agentSlide}`} aria-labelledby="agent-title">
          <header className={styles.topline}>
            <span className={styles.brand}>bumps</span>
            <span>{slide.section}</span>
          </header>
          <div className={styles.agentHeading}>
            <h1 className={styles.displayTitle} id="agent-title">{slide.title}</h1>
            <p className={styles.lede}>{slide.body}</p>
          </div>
          <ol className={styles.pipeline}>
            {slide.stages.map((stage) => (
              <li className={styles.stage} key={stage.label}>
                <div className={styles.stageImage}>
                  <Image src={stage.src} alt={stage.alt} fill sizes="25vw" />
                </div>
                <span>{stage.label}</span>
              </li>
            ))}
          </ol>
          <footer className={styles.agentFooter}>
            <ul className={styles.proofList}>
              {slide.proof.map((item) => <li key={item}>{item}</li>)}
            </ul>
            {controls}
          </footer>
        </section>
      )}
    </main>
  );
}
