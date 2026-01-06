/**
 * Weft Logo Component
 *
 * Abstract weaving-inspired logo representing interwoven threads.
 * Clean, minimal design showing the weave pattern.
 * On hover, threads subtly "unweave" with a smooth animation.
 */

interface WeftLogoProps {
  onClick?: () => void;
}

export function WeftLogo({ onClick }: WeftLogoProps) {
  return (
    <div className="weft-logo" onClick={onClick}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="weft-logo-icon"
      >
        {/* Woven grid pattern - 3 horizontal weft threads weaving through 3 vertical warp threads */}

        {/* Vertical threads (warp) - lighter/background */}
        <line className="warp warp-1" x1="6" y1="2" x2="6" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.35" />
        <line className="warp warp-2" x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.35" />
        <line className="warp warp-3" x1="18" y1="2" x2="18" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.35" />

        {/* Horizontal threads (weft) - main accent, with weave breaks */}
        {/* Top row: over-under-over pattern */}
        <line className="weft weft-top-1" x1="2" y1="6" x2="7.5" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line className="weft weft-top-2" x1="10.5" y1="6" x2="13.5" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line className="weft weft-top-3" x1="16.5" y1="6" x2="22" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />

        {/* Middle row: under-over-under pattern */}
        <line className="weft weft-mid-1" x1="2" y1="12" x2="4.5" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line className="weft weft-mid-2" x1="7.5" y1="12" x2="16.5" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line className="weft weft-mid-3" x1="19.5" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />

        {/* Bottom row: over-under-over pattern */}
        <line className="weft weft-bot-1" x1="2" y1="18" x2="7.5" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line className="weft weft-bot-2" x1="10.5" y1="18" x2="13.5" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line className="weft weft-bot-3" x1="16.5" y1="18" x2="22" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="weft-logo-text">WEFT</span>
    </div>
  );
}
