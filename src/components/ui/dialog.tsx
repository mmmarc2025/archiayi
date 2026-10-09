import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogContent({
  className,
  children,
  title,
  description,
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[1400] bg-ink/45" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-[1410] flex max-h-[min(88dvh,760px)] w-full flex-col overflow-hidden bg-card text-card-foreground shadow-2xl",
          "inset-x-0 bottom-0 rounded-t-3xl",
          "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(560px,calc(100%-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <DialogPrimitive.Title className="font-serif text-2xl leading-tight">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-foreground"
            aria-label="關閉"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogContent };
