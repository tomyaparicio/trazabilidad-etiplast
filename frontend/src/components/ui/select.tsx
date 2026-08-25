import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Select nativo estilizado — mismo lenguaje visual que <Input> (fuente única del
 * estilo de campos). Envuelve el <select> nativo: reenvía todas sus props y sus
 * <option> como children, así los formularios existentes no cambian su lógica.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select"
        className={cn(
          "h-9 w-full min-w-0 appearance-none rounded-[10px] border-[1.5px] border-input bg-[#f4f5fa] py-1 pl-3 pr-9 text-base transition-[color,box-shadow,background-color] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-white/[0.04]",
          "focus-visible:border-ring focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-ring/15",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { Select }
