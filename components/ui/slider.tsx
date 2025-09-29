import * as React from "react"
import { cn } from "@/lib/utils"

export interface SliderProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange?: (value: number[]) => void
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, min = 0, max = 100, step = 1, onValueChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = Number(e.target.value)
      onChange?.(e)
      onValueChange?.([newValue])
    }
    
    return (
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Array.isArray(value) ? value[0] : value}
          className={cn(
            "w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer",
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:w-5",
            "[&::-webkit-slider-thumb]:h-5",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-primary-500",
            "[&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-webkit-slider-thumb]:transition-all",
            "[&::-webkit-slider-thumb]:hover:bg-primary-600",
            "[&::-moz-range-thumb]:w-5",
            "[&::-moz-range-thumb]:h-5",
            "[&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:bg-primary-500",
            "[&::-moz-range-thumb]:border-0",
            "[&::-moz-range-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:transition-all",
            "[&::-moz-range-thumb]:hover:bg-primary-600",
            className
          )}
          ref={ref}
          onChange={handleChange}
          {...props}
        />
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }