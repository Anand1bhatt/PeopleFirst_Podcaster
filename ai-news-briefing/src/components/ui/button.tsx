"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full border border-transparent bg-clip-padding px-5 text-base font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 sm:min-h-10 sm:text-sm",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm [a]:hover:bg-primary/90 hover:bg-primary/90",
        outline:
          "rounded-full border-2 border-primary/25 bg-card text-foreground hover:border-primary/40 hover:bg-muted/80 aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary",
        ghost:
          "rounded-full hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
        destructive:
          "rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        link: "min-h-0 min-w-0 rounded-none px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 gap-2 px-6 sm:h-10 sm:px-5",
        xs: "h-9 min-h-9 gap-1 rounded-full px-4 text-xs",
        sm: "h-10 min-h-10 gap-1.5 rounded-full px-4 text-sm",
        lg: "h-12 min-h-12 gap-2 rounded-full px-8 text-base",
        icon: "size-11 min-h-11 min-w-11 rounded-full p-0 sm:size-10 sm:min-h-10 sm:min-w-10",
        "icon-xs": "size-9 min-h-9 min-w-9 rounded-full p-0 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-10 min-h-10 min-w-10 rounded-full p-0",
        "icon-lg": "size-12 min-h-12 min-w-12 rounded-full p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
