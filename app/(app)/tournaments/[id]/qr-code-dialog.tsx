"use client";

import { useState } from "react";
import { useT } from "@/components/locale-provider";
import QRCode from "react-qr-code";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function QRCodeDialog({ url }: { url: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("tournament.qr_code")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>{t("tournament.invite_qr_title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="rounded-xl bg-white p-4">
            <QRCode value={url} size={200} />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {t("tournament.scan_to_join")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
