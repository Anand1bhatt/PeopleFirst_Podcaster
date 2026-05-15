import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-h-12 min-w-0 rounded-full border-2 border-input bg-card px-5 py-3 text-base transition-colors outline-none file:inline-flex file:h-9 file:rounded-full file:border-0 file:bg-primary file:px-4 file:text-sm file:font-medium file:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sm:h-11 sm:min-h-11 sm:text-base",
        className
      )}
      {...props}
    />
  )
}

export { Input }
