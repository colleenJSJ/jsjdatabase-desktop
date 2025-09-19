export interface TooltipPosition {
  top: number;
  left: number;
}

export interface CalculateTooltipPositionOptions {
  targetRect: DOMRect;
  tooltipRect: DOMRect;
  mousePosition?: { x: number; y: number };
  containerRect?: DOMRect;
  gap?: number;
  preferredPlacement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

export function calculateTooltipPosition({
  targetRect,
  tooltipRect,
  mousePosition,
  containerRect,
  gap = 8,
  preferredPlacement = 'auto'
}: CalculateTooltipPositionOptions): TooltipPosition {
  // Get viewport or container boundaries
  const bounds = containerRect || {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight
  };
  
  // Calculate available space in each direction
  const spaceAbove = targetRect.top - bounds.top;
  const spaceBelow = bounds.bottom - targetRect.bottom;
  const spaceLeft = targetRect.left - bounds.left;
  const spaceRight = bounds.right - targetRect.right;
  
  // Calculate center positions
  const centerX = targetRect.left + targetRect.width / 2;
  const centerY = targetRect.top + targetRect.height / 2;
  
  let placement = preferredPlacement;
  
  // Auto-determine best placement if set to auto
  if (placement === 'auto') {
    const placements = [
      { name: 'right', space: spaceRight, minSpace: tooltipRect.width + gap },
      { name: 'left', space: spaceLeft, minSpace: tooltipRect.width + gap },
      { name: 'bottom', space: spaceBelow, minSpace: tooltipRect.height + gap },
      { name: 'top', space: spaceAbove, minSpace: tooltipRect.height + gap }
    ];
    
    // Sort by available space and pick the best one
    const bestPlacement = placements
      .filter(p => p.space >= p.minSpace)
      .sort((a, b) => b.space - a.space)[0];
    
    placement = bestPlacement ? bestPlacement.name as any : 'bottom';
  }
  
  let left = 0;
  let top = 0;
  
  // Calculate position based on placement
  switch (placement) {
    case 'top':
      left = centerX - tooltipRect.width / 2;
      top = targetRect.top - tooltipRect.height - gap;
      break;
      
    case 'bottom':
      left = centerX - tooltipRect.width / 2;
      top = targetRect.bottom + gap;
      break;
      
    case 'left':
      left = targetRect.left - tooltipRect.width - gap;
      top = centerY - tooltipRect.height / 2;
      break;
      
    case 'right':
      left = targetRect.right + gap;
      top = centerY - tooltipRect.height / 2;
      break;
  }
  
  // Ensure tooltip stays within bounds with edge detection
  if (left < bounds.left + gap) {
    left = bounds.left + gap;
  } else if (left + tooltipRect.width > bounds.right - gap) {
    left = bounds.right - tooltipRect.width - gap;
  }
  
  if (top < bounds.top + gap) {
    top = bounds.top + gap;
  } else if (top + tooltipRect.height > bounds.bottom - gap) {
    top = bounds.bottom - tooltipRect.height - gap;
  }
  
  // If tooltip still doesn't fit well, use mouse position as fallback
  if (mousePosition && (
    top < bounds.top || 
    top + tooltipRect.height > bounds.bottom ||
    left < bounds.left ||
    left + tooltipRect.width > bounds.right
  )) {
    // Position near mouse cursor
    left = mousePosition.x + gap;
    top = mousePosition.y + gap;
    
    // Adjust if it goes off screen
    if (left + tooltipRect.width > bounds.right - gap) {
      left = mousePosition.x - tooltipRect.width - gap;
    }
    if (top + tooltipRect.height > bounds.bottom - gap) {
      top = mousePosition.y - tooltipRect.height - gap;
    }
    
    // Final bounds check
    left = Math.max(bounds.left + gap, Math.min(bounds.right - tooltipRect.width - gap, left));
    top = Math.max(bounds.top + gap, Math.min(bounds.bottom - tooltipRect.height - gap, top));
  }
  
  // Convert to viewport coordinates if using container bounds
  // This ensures tooltips are positioned correctly even when containers have scroll
  if (containerRect) {
    // For fixed positioning, we don't need to adjust for page scroll
    // The position is already relative to the viewport
  }
  
  return { top, left };
}