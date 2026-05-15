import { forwardRef } from "react";
import type { ImgHTMLAttributes } from "react";

type ImgProps = ImgHTMLAttributes<HTMLImageElement>;

interface Props extends Omit<ImgProps, "src"> {
  /**
   * Card code like "AS", "10H", "9C". If omitted, renders the card back.
   */
  card?: string;
  /**
   * Force the face-down back of the card (ignored if `card` is provided).
   */
  back?: boolean;
}

const VALID_CARD_RE = /^(A|10|K|Q|J|9)[CDHS]$/;

/**
 * Renders a playing card using a <picture> element so browsers pick the
 * smallest supported format:
 *   AVIF  (~3KB / card)  ->  WebP  (~4KB / card)  ->  PNG  (~47KB / card, legacy)
 *
 * The card back is an SVG, which already compresses well — no encoded variants.
 */
export const CardImage = forwardRef<HTMLImageElement, Props>(function CardImage(
  { card, back, alt = "", ...imgProps },
  ref,
) {
  if (back || !card) {
    return (
      <img
        ref={ref}
        src="/img/back.svg"
        alt={alt}
        aria-hidden={alt === "" ? true : undefined}
        {...imgProps}
      />
    );
  }

  const code = VALID_CARD_RE.test(card) ? card : null;

  if (!code) {
    // Unknown/invalid code — fall back to the back of a card so we never hard-crash.
    return (
      <img
        ref={ref}
        src="/img/back.svg"
        alt={alt}
        aria-hidden={alt === "" ? true : undefined}
        {...imgProps}
      />
    );
  }

  return (
    <picture>
      <source srcSet={`/img/${code}.avif`} type="image/avif" />
      <source srcSet={`/img/${code}.webp`} type="image/webp" />
      <img ref={ref} src={`/img/${code}.png`} alt={alt} {...imgProps} />
    </picture>
  );
});
