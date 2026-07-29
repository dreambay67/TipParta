"use client";

import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { subscribeBroadcastItems } from "@/features/broadcast/broadcastRepository";

const defaultTickerItems = [
  "Štúdio sleduje najodvážnejšie tipy dňa",
  "Po uzávierke sa rozsvieti prehľad celej partie",
  "Rovnaký tip ako tvoj svieti žltou",
  "Keď striedate počítač, najprv sa odhláste"
];

type PixelTickerProps = {
  items?: string[];
  label?: string;
};

const tickerSpeedPxPerSecond = 46;
const tickerItemGapPx = 36;

export function PixelTicker({ items, label = "Naživo" }: PixelTickerProps) {
  const [broadcastItems, setBroadcastItems] = useState<string[]>([]);
  const [tickerMetrics, setTickerMetrics] = useState({ copies: 2, distance: 1200, duration: 26 });
  const trackRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items) {
      return undefined;
    }

    return subscribeBroadcastItems((nextItems) => {
      setBroadcastItems(nextItems.map((item) => item.text));
    });
  }, [items]);

  const visibleItems = useMemo(() => {
    if (items && items.length > 0) {
      return items;
    }

    return broadcastItems.length > 0 ? broadcastItems : defaultTickerItems;
  }, [broadcastItems, items]);
  useLayoutEffect(() => {
    const track = trackRef.current;
    const measure = measureRef.current;

    if (!track || !measure) {
      return undefined;
    }

    const updateMetrics = () => {
      const trackWidth = track.clientWidth;
      const measuredWidth = measure.scrollWidth;

      if (trackWidth <= 0 || measuredWidth <= 0) {
        return;
      }

      const distance = Math.ceil(measuredWidth + tickerItemGapPx);
      const copies = Math.max(3, Math.ceil((trackWidth * 2.4) / distance) + 1);
      const duration = Math.max(8, Math.round((distance / tickerSpeedPxPerSecond) * 10) / 10);

      setTickerMetrics((previous) => {
        if (
          previous.copies === copies &&
          previous.distance === distance &&
          previous.duration === duration
        ) {
          return previous;
        }

        return { copies, distance, duration };
      });
    };

    updateMetrics();

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updateMetrics);
    resizeObserver?.observe(track);
    resizeObserver?.observe(measure);
    window.addEventListener("resize", updateMetrics);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, [visibleItems]);

  const loopItems = useMemo(
    () => Array.from({ length: tickerMetrics.copies }, () => visibleItems).flat(),
    [tickerMetrics.copies, visibleItems]
  );
  const tickerStyle = {
    "--ticker-duration": `${tickerMetrics.duration}s`,
    "--ticker-offset": `-${tickerMetrics.distance}px`
  } as CSSProperties;

  return (
    <div aria-label="Aktuálny štúdiový ticker" className="pixel-ticker" role="status">
      <span className="pixel-ticker__label">{label}</span>
      <div className="pixel-ticker__track" aria-hidden="true" ref={trackRef}>
        <div className="pixel-ticker__motion pixel-ticker__motion--measure" ref={measureRef}>
          {visibleItems.map((item, index) => (
            <span className="pixel-ticker__item" key={`measure-${item}-${index}`}>
              {item}
            </span>
          ))}
        </div>
        <div className="pixel-ticker__motion" style={tickerStyle}>
          {loopItems.map((item, index) => (
            <span className="pixel-ticker__item" key={`${item}-${index}`}>
              {item}
            </span>
          ))}
        </div>
      </div>
      <span className="sr-only">{visibleItems.join(" · ")}</span>
    </div>
  );
}
