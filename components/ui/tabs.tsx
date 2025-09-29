import * as React from "react"
import { cn } from "@/lib/utils"

const Tabs = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { defaultValue?: string; value?: string; onValueChange?: (value: string) => void }
>(({ className, defaultValue, value: controlledValue, onValueChange, children, ...props }, ref) => {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue)
  const value = controlledValue ?? uncontrolledValue
  const setValue = React.useCallback((newValue: string) => {
    if (onValueChange) {
      onValueChange(newValue)
    } else {
      setUncontrolledValue(newValue)
    }
  }, [onValueChange])
  
  return (
    <div
      ref={ref}
      className={cn("w-full", className)}
      {...props}
    >
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          // Pass parentValue to TabsContent instead of value
          if (child.type === TabsContent) {
            return React.cloneElement(child as React.ReactElement<any>, { parentValue: value, setValue })
          }
          return React.cloneElement(child as React.ReactElement<any>, { value, setValue })
        }
        return child
      })}
    </div>
  )
})
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: string; setValue?: (value: string) => void }
>(({ className, children, value, setValue, ...props }, ref) => {
  // Remove setValue from props to avoid passing it to the DOM element
  const { setValue: _, ...restProps } = props as any;
  
  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      {...restProps}
    >
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, { parentValue: value, setValue })
        }
        return child
      })}
    </div>
  )
})
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string; parentValue?: string; setValue?: (value: string) => void }
>(({ className, value: triggerValue, parentValue, setValue, ...props }, ref) => {
  // Remove setValue and value from props to avoid passing them to the DOM element
  const { value: _, setValue: __, ...restProps } = props as any;
  const isActive = parentValue === triggerValue;
  
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      data-state={isActive ? "active" : "inactive"}
      onClick={() => setValue?.(triggerValue)}
      {...restProps}
    />
  )
})
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string; parentValue?: string; setValue?: (value: string) => void }
>(({ className, value: contentValue, parentValue, setValue, ...props }, ref) => {
  const isActive = parentValue === contentValue
  
  if (!isActive) return null
  
  // Remove setValue from props to avoid passing it to the DOM element
  const { setValue: _, ...restProps } = props as any;
  
  return (
    <div
      ref={ref}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...restProps}
    />
  )
})
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }